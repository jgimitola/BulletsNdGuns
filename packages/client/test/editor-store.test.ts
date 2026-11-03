import { describe, expect, test } from 'vitest';
import { CLASSIC_LEVELS, type LevelData, type LevelDetail, type LevelWrite } from '@bng/shared';
import { confirmLeave, createEditorStore } from '../src/editor/editor-store.ts';
import { emptyLevel, snapObject } from '../src/editor/level-edits.ts';
import type { ApiResult, LevelsApi } from '../src/net/levels-api.ts';

const detail = (id: string, write: LevelWrite, published = false): LevelDetail => ({
  id,
  name: write.name,
  author: 'Ana',
  builtin: false,
  published,
  playable: false,
  updatedAt: '2026-11-03T10:00:00.000Z',
  data: write.data,
});

type Answer<T> = (() => Promise<ApiResult<T>>) | null;

/** A LevelsApi whose answers each test can replace, recording every call. */
function fakeApi() {
  const calls: string[] = [];
  const next: { create: Answer<LevelDetail>; update: Answer<LevelDetail> } = {
    create: null,
    update: null,
  };
  let published = false;
  const api: LevelsApi = {
    get: () => Promise.reject(new Error('unused')),
    create: (write) => {
      calls.push('create');
      return next.create?.() ?? Promise.resolve({ ok: true, value: detail('new-id', write) });
    },
    update: (id, write) => {
      calls.push(`update ${id}`);
      return next.update?.() ?? Promise.resolve({ ok: true, value: detail(id, write, published) });
    },
    setPublished: (id, value) => {
      calls.push(`setPublished ${id} ${value}`);
      published = value;
      return Promise.resolve({
        ok: true,
        value: detail(id, { name: 'x', data: emptyLevel() }, value),
      });
    },
    remove: (id) => {
      calls.push(`remove ${id}`);
      return Promise.resolve({ ok: true, value: null });
    },
    duplicate: () => Promise.reject(new Error('unused')),
  };
  return { api, calls, next };
}

const classic: LevelData = CLASSIC_LEVELS[0]!.data;
const savedSession = (published: boolean) => ({
  levelId: 'lvl',
  name: 'Torre',
  published,
  data: classic,
});

describe('saving and saved state', () => {
  test('a new session starts saved, with no id, the default name and the first tile', () => {
    const editor = createEditorStore(fakeApi().api, null, 'My level');
    const state = editor.getState();
    expect(state.levelId).toBeNull();
    expect(state.name).toBe('My level');
    expect(state.published).toBe(false);
    expect(state.saveState).toBe('saved');
    expect(state.tool).toEqual({ kind: 'tile', id: 1 });
    expect(state.data).toEqual(emptyLevel());
  });

  test('painting makes it unsaved and undoing the paint makes it saved again', () => {
    const editor = createEditorStore(fakeApi().api, null, 'My level');
    editor.getState().beginStroke();
    editor.getState().paintAt(10, 10);
    editor.getState().endStroke();
    expect(editor.getState().data.tiles[0]).toBe(1);
    expect(editor.getState().saveState).toBe('unsaved');
    editor.getState().undo();
    expect(editor.getState().saveState).toBe('saved');
    editor.getState().redo();
    expect(editor.getState().saveState).toBe('unsaved');
  });

  test('painting outside the level does nothing', () => {
    const editor = createEditorStore(fakeApi().api, null, 'My level');
    editor.getState().paintAt(-5, 900);
    expect(editor.getState().saveState).toBe('saved');
  });

  test('the first save creates the level and the next one updates it', async () => {
    const { api, calls } = fakeApi();
    const editor = createEditorStore(api, null, 'My level');
    editor.getState().paintAt(10, 10);
    expect(await editor.getState().save()).toBe(true);
    expect(editor.getState().levelId).toBe('new-id');
    expect(editor.getState().saveState).toBe('saved');
    editor.getState().paintAt(50, 10);
    expect(await editor.getState().save()).toBe(true);
    expect(calls).toEqual(['create', 'update new-id']);
  });

  test('a save pressed while one runs does nothing', async () => {
    const { api, calls } = fakeApi();
    const editor = createEditorStore(api, null, 'My level');
    editor.getState().paintAt(10, 10);
    const first = editor.getState().save();
    expect(editor.getState().saveState).toBe('saving');
    expect(await editor.getState().save()).toBe(false);
    expect(await first).toBe(true);
    expect(calls).toEqual(['create']);
  });

  test('an edit made while saving stays unsaved after the save lands', async () => {
    const { api } = fakeApi();
    const editor = createEditorStore(api, null, 'My level');
    editor.getState().paintAt(10, 10);
    const saving = editor.getState().save();
    editor.getState().paintAt(50, 10);
    await saving;
    expect(editor.getState().saveState).toBe('unsaved');
  });
});

describe('save failures', () => {
  test('a published level saved without its portal keeps the edit and says why', async () => {
    const { api, next } = fakeApi();
    next.update = () => Promise.resolve({ ok: false, error: 'notPublishable' });
    const editor = createEditorStore(api, savedSession(true), 'My level');
    const portal = classic.portal!;
    editor.getState().setTool({ kind: 'eraser' });
    editor.getState().paintAt(portal.x - 16, portal.y - 15);
    expect(editor.getState().data.portal).toBeNull();
    expect(await editor.getState().save()).toBe(false);
    const state = editor.getState();
    expect(state.error).toBe('notPublishable');
    expect(state.saveState).toBe('unsaved');
    expect(state.data.portal).toBeNull();
    expect(state.history.canUndo).toBe(true);
    expect(state.published).toBe(true);
  });

  test('a network failure leaves it unsaved and a retry saves', async () => {
    const { api, next } = fakeApi();
    next.create = () => Promise.resolve({ ok: false, error: 'network' });
    const editor = createEditorStore(api, null, 'My level');
    editor.getState().paintAt(10, 10);
    expect(await editor.getState().save()).toBe(false);
    expect(editor.getState().error).toBe('network');
    expect(editor.getState().saveState).toBe('unsaved');
    next.create = null;
    expect(await editor.getState().save()).toBe(true);
    expect(editor.getState().saveState).toBe('saved');
    expect(editor.getState().error).toBeNull();
  });

  test('clearError forgets the error', async () => {
    const { api, next } = fakeApi();
    next.create = () => Promise.resolve({ ok: false, error: 'rateLimited' });
    const editor = createEditorStore(api, null, 'My level');
    await editor.getState().save();
    editor.getState().clearError();
    expect(editor.getState().error).toBeNull();
  });
});

describe('publishing, removal and renaming', () => {
  test('publishing an unplayable level is refused without a request', async () => {
    const { api, calls } = fakeApi();
    const editor = createEditorStore(api, null, 'My level');
    expect(await editor.getState().setPublished(true)).toBe(false);
    expect(editor.getState().error).toBe('notPublishable');
    expect(calls).toEqual([]);
  });

  test('publishing with unsaved changes saves first', async () => {
    const { api, calls } = fakeApi();
    const editor = createEditorStore(api, savedSession(false), 'My level');
    editor.getState().paintAt(10, 10);
    expect(await editor.getState().setPublished(true)).toBe(true);
    expect(calls).toEqual(['update lvl', 'setPublished lvl true']);
    expect(editor.getState().published).toBe(true);
    expect(editor.getState().saveState).toBe('saved');
  });

  test('a failed save stops the publish', async () => {
    const { api, calls, next } = fakeApi();
    next.update = () => Promise.resolve({ ok: false, error: 'network' });
    const editor = createEditorStore(api, savedSession(false), 'My level');
    editor.getState().paintAt(10, 10);
    expect(await editor.getState().setPublished(true)).toBe(false);
    expect(calls).toEqual(['update lvl']);
  });

  test('unpublishing needs no playable level', async () => {
    const { api, calls } = fakeApi();
    const editor = createEditorStore(
      api,
      { ...savedSession(true), data: emptyLevel() },
      'My level',
    );
    expect(await editor.getState().setPublished(false)).toBe(true);
    expect(calls).toEqual(['setPublished lvl false']);
    expect(editor.getState().published).toBe(false);
  });

  test('removing a level that was never saved makes no request', async () => {
    const { api, calls } = fakeApi();
    const editor = createEditorStore(api, null, 'My level');
    expect(await editor.getState().remove()).toBe(true);
    expect(calls).toEqual([]);
  });

  test('removing a saved level deletes it', async () => {
    const { api, calls } = fakeApi();
    const editor = createEditorStore(api, savedSession(false), 'My level');
    expect(await editor.getState().remove()).toBe(true);
    expect(calls).toEqual(['remove lvl']);
  });

  test('rename trims the name and marks the level unsaved', () => {
    const editor = createEditorStore(fakeApi().api, null, 'My level');
    editor.getState().rename(' Torre ');
    expect(editor.getState().name).toBe('Torre');
    expect(editor.getState().saveState).toBe('unsaved');
  });

  test('object tools place on the snapped spot', () => {
    const editor = createEditorStore(fakeApi().api, null, 'My level');
    editor.getState().setTool({ kind: 'object', object: 'coin' });
    editor.getState().paintAt(12 * 32 + 5, 17 * 30 + 5);
    expect(editor.getState().data.coins).toEqual([snapObject('coin', { col: 12, row: 17 })]);
  });
});

test('leaving asks only when something is not saved', async () => {
  const { api } = fakeApi();
  const editor = createEditorStore(api, null, 'My level');
  expect(confirmLeave(editor.getState())).toBe('leave');
  editor.getState().paintAt(10, 10);
  expect(confirmLeave(editor.getState())).toBe('ask');
  const saving = editor.getState().save();
  expect(confirmLeave(editor.getState())).toBe('ask');
  await saving;
  expect(confirmLeave(editor.getState())).toBe('leave');
});
