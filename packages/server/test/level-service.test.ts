import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { CLASSIC_LEVELS, LEVELS_PAGE_SIZE, type LevelData, type LevelWrite } from '@bng/shared';
import { createAuth } from '../src/auth/auth.ts';
import { loadConfig } from '../src/config.ts';
import { openDatabase, type Database } from '../src/db/database.ts';
import { migrateGameTables } from '../src/db/migrations.ts';
import { kyselyLevelStore } from '../src/levels/kysely-level-store.ts';
import {
  LevelService,
  MAX_LEVELS_PER_ACCOUNT,
  type ServiceResult,
} from '../src/levels/level-service.ts';

let db: Database;
let service: LevelService;
let ana: string;
let beto: string;

const playable: LevelData = CLASSIC_LEVELS[0]!.data;
const noPortal: LevelData = { ...playable, portal: null };
const noRightSpawn: LevelData = { ...playable, spawns: { ...playable.spawns, right: null } };
const write = (name: string, data: LevelData = playable): LevelWrite => ({ name, data });

beforeEach(async () => {
  db = openDatabase(':memory:');
  const config = { ...loadConfig({ NODE_ENV: 'development' }), databasePath: ':memory:' };
  const auth = await createAuth(db, config, { nicknameChanged: () => {} });
  const register = async (nickname: string) =>
    (
      await auth.api.signUpEmail({
        body: {
          email: `${nickname}@bng.test`,
          password: 'password123',
          name: nickname,
          username: nickname,
          displayUsername: nickname,
        },
      })
    ).user.id;
  ana = await register('Ana');
  beto = await register('Beto');
  await migrateGameTables(db);
  service = new LevelService(kyselyLevelStore(db));
  await service.seedBuiltins();
});

afterEach(async () => {
  await db.close();
});

function value<T>(result: ServiceResult<T>): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
  return result.value;
}

const errorOf = <T>(result: ServiceResult<T>) => (result.ok ? 'ok' : result.error);

describe('visibility and ownership', () => {
  test("a draft is invisible to everyone but its author, who can't be told it exists", async () => {
    const draft = value(await service.create(ana, write('Torre')));
    expect(draft).toMatchObject({ author: 'Ana', published: false, builtin: false });
    expect(errorOf(await service.get(beto, draft.id))).toBe('notFound');
    expect(errorOf(await service.get(null, draft.id))).toBe('notFound');
    expect(errorOf(await service.get(ana, draft.id))).toBe('ok');
    expect(errorOf(await service.update(beto, draft.id, write('Mine')))).toBe('notFound');
  });

  test('a published level is visible, but only its author changes it', async () => {
    const level = value(await service.create(ana, write('Torre')));
    expect(value(await service.setPublished(ana, level.id, true)).published).toBe(true);
    expect(errorOf(await service.get(beto, level.id))).toBe('ok');
    expect(errorOf(await service.update(beto, level.id, write('Mine')))).toBe('forbidden');
    expect(errorOf(await service.delete(beto, level.id))).toBe('forbidden');
    expect(errorOf(await service.setPublished(beto, level.id, false))).toBe('forbidden');
  });

  test('nobody edits a built-in level', async () => {
    expect(errorOf(await service.update(ana, 'classic-1', write('Mine')))).toBe('forbidden');
    expect(errorOf(await service.delete(ana, 'classic-1'))).toBe('forbidden');
    expect(errorOf(await service.setPublished(ana, 'classic-1', false))).toBe('forbidden');
  });

  test('deleting removes the level for good', async () => {
    const level = value(await service.create(ana, write('Torre')));
    expect(errorOf(await service.delete(ana, level.id))).toBe('ok');
    expect(errorOf(await service.get(ana, level.id))).toBe('notFound');
  });
});

describe('publishing', () => {
  test('a level without a portal cannot be published', async () => {
    const draft = value(await service.create(ana, write('Torre', noPortal)));
    expect(errorOf(await service.setPublished(ana, draft.id, true))).toBe('notPublishable');
  });

  test('saving a published level that is no longer playable is refused, and nothing changes', async () => {
    const level = value(await service.create(ana, write('Torre')));
    await service.setPublished(ana, level.id, true);
    expect(errorOf(await service.update(ana, level.id, write('Torre', noRightSpawn)))).toBe(
      'notPublishable',
    );
    expect(value(await service.get(ana, level.id)).data).toEqual(playable);
  });

  test('a draft may be saved incomplete', async () => {
    const draft = value(await service.create(ana, write('Torre')));
    expect(errorOf(await service.update(ana, draft.id, write('Torre', noPortal)))).toBe('ok');
  });
});

test(`an account holds at most ${MAX_LEVELS_PER_ACCOUNT} levels`, async () => {
  expect(MAX_LEVELS_PER_ACCOUNT).toBe(10);
  for (let i = 0; i < MAX_LEVELS_PER_ACCOUNT; i++) value(await service.create(ana, write(`L${i}`)));
  expect(errorOf(await service.create(ana, write('One more')))).toBe('tooManyLevels');
  const published = value(await service.create(beto, write('Torre')));
  await service.setPublished(beto, published.id, true);
  expect(errorOf(await service.duplicate(ana, published.id))).toBe('tooManyLevels');
});

describe('duplicating', () => {
  test("copies a visible level into the caller's own draft", async () => {
    const original = value(await service.create(ana, write('Torre')));
    await service.setPublished(ana, original.id, true);
    const copy = value(await service.duplicate(beto, original.id));
    expect(copy.id).not.toBe(original.id);
    expect(copy).toMatchObject({ name: 'Torre', author: 'Beto', published: false, data: playable });
  });

  test("someone else's draft cannot be duplicated", async () => {
    const draft = value(await service.create(ana, write('Torre')));
    expect(errorOf(await service.duplicate(beto, draft.id))).toBe('notFound');
  });

  test('a built-in level can be duplicated', async () => {
    expect(value(await service.duplicate(ana, 'classic-2')).data).toEqual(CLASSIC_LEVELS[1]!.data);
  });
});

describe('listing', () => {
  test('summaries carry the thumbnail tiles, author and playability', async () => {
    const draft = value(await service.create(ana, write('Torre', noPortal)));
    const page = await service.list(ana, { search: '', mine: false, offset: 0 });
    expect(page.levels.map((l) => l.id)).toEqual(['classic-1', 'classic-2', 'classic-3', draft.id]);
    expect(page.levels[0]).toMatchObject({
      author: 'BulletsNdGuns',
      builtin: true,
      playable: true,
    });
    expect(page.levels[0]!.tiles).toHaveLength(500);
    expect(page.levels[3]).toMatchObject({ author: 'Ana', playable: false, published: false });
    expect(new Date(page.levels[3]!.updatedAt).toISOString()).toBe(page.levels[3]!.updatedAt);
    expect(page.nextOffset).toBeNull();
  });

  test('pages of LEVELS_PAGE_SIZE with the offset of the next one', async () => {
    for (const author of [ana, beto]) {
      for (let i = 0; i < 10; i++) {
        const level = value(await service.create(author, write(`L${i}`)));
        await service.setPublished(author, level.id, true);
      }
    }
    // 3 built-ins + 20 published levels.
    const first = await service.list(null, { search: '', mine: false, offset: 0 });
    expect(first.levels).toHaveLength(LEVELS_PAGE_SIZE);
    expect(first.nextOffset).toBe(LEVELS_PAGE_SIZE);
    const second = await service.list(null, { search: '', mine: false, offset: LEVELS_PAGE_SIZE });
    expect(second.levels).toHaveLength(3);
    expect(second.nextOffset).toBeNull();
  });

  test('a guest asking for their own levels gets none', async () => {
    expect((await service.list(null, { search: '', mine: true, offset: 0 })).levels).toEqual([]);
  });
});

describe('playlists', () => {
  test('loads levels in order, repeats included', async () => {
    const playlist = value(
      await service.loadPlaylist(ana, ['classic-2', 'classic-1', 'classic-2']),
    );
    expect(playlist.map((p) => p.name)).toEqual(['Classic 2', 'Classic 1', 'Classic 2']);
    expect(playlist[0]!.level.data).toEqual(CLASSIC_LEVELS[1]!.data);
  });

  test("the creator's own playable draft is allowed", async () => {
    const draft = value(await service.create(ana, write('Torre')));
    expect(errorOf(await service.loadPlaylist(ana, [draft.id]))).toBe('ok');
  });

  test("someone else's draft, an unplayable level or a missing id fails the whole playlist", async () => {
    const draft = value(await service.create(ana, write('Torre')));
    const unplayable = value(await service.create(beto, write('Hole', noPortal)));
    expect(errorOf(await service.loadPlaylist(beto, ['classic-1', draft.id]))).toBe(
      'levelUnavailable',
    );
    expect(errorOf(await service.loadPlaylist(beto, [unplayable.id]))).toBe('levelUnavailable');
    expect(errorOf(await service.loadPlaylist(beto, ['nope']))).toBe('levelUnavailable');
  });
});

describe('concurrent writes', () => {
  test('a burst of creates cannot get past the cap', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => service.create(ana, write(`L${i}`))),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(MAX_LEVELS_PER_ACCOUNT);
    const mine = await service.list(ana, { search: '', mine: true, offset: 0 });
    expect(mine.levels).toHaveLength(MAX_LEVELS_PER_ACCOUNT);
  });

  test('a burst of duplicates cannot get past the cap either', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => service.duplicate(ana, 'classic-1')),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(MAX_LEVELS_PER_ACCOUNT);
  });

  test('a save racing a publish never leaves an unplayable level published', async () => {
    const level = value(await service.create(ana, write('Torre')));
    await Promise.all([
      service.update(ana, level.id, write('Torre', noPortal)),
      service.setPublished(ana, level.id, true),
    ]);
    const stored = value(await service.get(ana, level.id));
    expect(stored.published && !stored.playable).toBe(false);
  });
});

test('a corrupt row in the first page does not end the paging early', async () => {
  const ids: string[] = [];
  for (const author of [ana, beto]) {
    for (let i = 0; i < 10; i++) {
      const level = value(await service.create(author, write(`L${i}`)));
      await service.setPublished(author, level.id, true);
      ids.push(level.id);
    }
  }
  await db.kysely
    .updateTable('level')
    .set({ data: 'not json' })
    .where('id', '=', ids[19]!)
    .execute();
  // 3 built-ins + 20 levels, one of them unreadable: 22 to show over two pages.
  const first = await service.list(null, { search: '', mine: false, offset: 0 });
  expect(first.nextOffset).toBe(LEVELS_PAGE_SIZE);
  const second = await service.list(null, { search: '', mine: false, offset: LEVELS_PAGE_SIZE });
  expect(first.levels.length + second.levels.length).toBe(22);
  expect(second.nextOffset).toBeNull();
});

test('a playlist that repeats a level reads and builds it once', async () => {
  const store = kyselyLevelStore(db);
  let reads = 0;
  const counting = new LevelService({
    ...store,
    get: (id) => {
      reads++;
      return store.get(id);
    },
  });
  const playlist = value(await counting.loadPlaylist(ana, Array<string>(10).fill('classic-1')));
  expect(playlist).toHaveLength(10);
  expect(reads).toBe(1);
});
