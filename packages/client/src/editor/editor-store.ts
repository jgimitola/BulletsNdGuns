import { createStore, type StoreApi } from 'zustand/vanilla';
import { isPlayable, levelNameSchema, type LevelData, type LevelDetail } from '@bng/shared';
import type { ApiError, ApiResult, LevelsApi } from '../net/levels-api.ts';
import { EditHistory } from './edit-history.ts';
import { applyTool, cellAt, emptyLevel } from './level-edits.ts';
import type { Tool } from './tools.ts';

export type SaveState = 'saved' | 'unsaved' | 'saving';

export interface EditorState {
  /** Null until the level's first save. */
  levelId: string | null;
  name: string;
  published: boolean;
  history: EditHistory;
  /** Mirrors `history.current`, so subscribers see every change. */
  data: LevelData;
  tool: Tool;
  saveState: SaveState;
  error: ApiError | null;
  setTool(tool: Tool): void;
  /** Painting between these two is one undo step. */
  beginStroke(): void;
  /** Applies the tool to the cell under a world pixel; outside the level it does nothing. */
  paintAt(x: number, y: number): void;
  endStroke(): void;
  undo(): void;
  redo(): void;
  rename(name: string): void;
  /** Stores the level. False when it failed (see `error`) or a save is already running. */
  save(): Promise<boolean>;
  setPublished(published: boolean): Promise<boolean>;
  remove(): Promise<boolean>;
  clearError(): void;
}

export type EditorStore = StoreApi<EditorState>;

export interface EditorSession {
  levelId: string;
  name: string;
  published: boolean;
  data: LevelData;
}

const snapshot = (name: string, data: LevelData) => JSON.stringify({ name, data });

/** Leaving the editor asks first while anything is unsaved, a running save included. */
export function confirmLeave(state: Pick<EditorState, 'saveState'>): 'leave' | 'ask' {
  return state.saveState === 'saved' ? 'leave' : 'ask';
}

/**
 * One editing session: a new level when `from` is null, or a stored one. The level counts as
 * saved whenever its name and data equal what was last stored, so undoing back to it is saved.
 */
export function createEditorStore(
  api: LevelsApi,
  from: EditorSession | null,
  defaultName: string,
): EditorStore {
  const initial = from?.data ?? emptyLevel();
  const initialName = from?.name ?? defaultName;
  let saved = snapshot(initialName, initial);
  let saving = false;

  return createStore<EditorState>()((set, get) => {
    const stateOf = (name: string, data: LevelData): SaveState =>
      saving ? 'saving' : snapshot(name, data) === saved ? 'saved' : 'unsaved';

    /** Re-reads the history after it changed. */
    const sync = () => {
      const data = get().history.current;
      if (data !== get().data) set({ data, saveState: stateOf(get().name, data) });
    };

    const fail = (error: ApiError) => {
      set({ error });
      return false;
    };

    const stored = (result: ApiResult<LevelDetail>): boolean => {
      if (!result.ok) return fail(result.error);
      set({ levelId: result.value.id, published: result.value.published, error: null });
      return true;
    };

    return {
      levelId: from?.levelId ?? null,
      name: initialName,
      published: from?.published ?? false,
      history: new EditHistory(initial),
      data: initial,
      tool: { kind: 'tile', id: 1 },
      saveState: 'saved',
      error: null,

      setTool: (tool) => set({ tool }),
      beginStroke: () => get().history.beginStroke(),
      paintAt: (x, y) => {
        const cell = cellAt(x, y);
        if (!cell) return;
        const { history, tool } = get();
        history.apply(applyTool(history.current, tool, cell));
        sync();
      },
      endStroke: () => get().history.endStroke(),
      undo: () => {
        get().history.undo();
        sync();
      },
      redo: () => {
        get().history.redo();
        sync();
      },

      rename: (raw) => {
        const parsed = levelNameSchema.safeParse(raw);
        if (!parsed.success) return;
        set({ name: parsed.data, saveState: stateOf(parsed.data, get().data) });
      },

      save: async () => {
        if (saving) return false;
        const { levelId, name, data } = get();
        if (levelId !== null && get().saveState === 'saved') return true;
        saving = true;
        set({ saveState: 'saving' });
        const write = { name, data };
        const result =
          levelId === null ? await api.create(write) : await api.update(levelId, write);
        saving = false;
        if (result.ok) saved = snapshot(name, data);
        const ok = stored(result);
        set({ saveState: stateOf(get().name, get().data) });
        return ok;
      },

      setPublished: async (published) => {
        if (saving) return false;
        if (published) {
          if (!isPlayable(get().data)) return fail('notPublishable');
          // What gets published is the stored copy, so it must be this one.
          if (get().levelId === null || get().saveState !== 'saved') {
            if (!(await get().save())) return false;
          }
        }
        const { levelId } = get();
        // A level never stored was never published.
        if (levelId === null) return true;
        // Unpublishing leaves unsaved edits alone: it is the way out when a published level's
        // edit is refused for missing a spawn or the portal.
        return stored(await api.setPublished(levelId, published));
      },

      remove: async () => {
        const { levelId } = get();
        if (levelId === null) return true;
        const result = await api.remove(levelId);
        return result.ok ? true : fail(result.error);
      },

      clearError: () => set({ error: null }),
    };
  });
}
