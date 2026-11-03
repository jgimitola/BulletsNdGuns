import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { CLASSIC_LEVELS, type LevelData } from '@bng/shared';
import { createAuth } from '../src/auth/auth.ts';
import { loadConfig } from '../src/config.ts';
import { openDatabase, type Database } from '../src/db/database.ts';
import { migrateGameTables } from '../src/db/migrations.ts';
import { kyselyLevelStore } from '../src/levels/kysely-level-store.ts';
import type { LevelListFilter, LevelStore } from '../src/levels/level-store.ts';

let db: Database;
let store: LevelStore;
let clock = 1_000;
let ana: string;
let beto: string;

const data: LevelData = CLASSIC_LEVELS[0]!.data;

beforeEach(async () => {
  clock = 1_000;
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
  store = kyselyLevelStore(db, () => clock);
});

afterEach(async () => {
  await db.close();
});

function filter(over: Partial<LevelListFilter> = {}): LevelListFilter {
  return { viewerId: null, mineOnly: false, search: '', offset: 0, limit: 50, ...over };
}

const ids = async (f: LevelListFilter) => (await store.list(f)).records.map((l) => l.name);

describe('migrations', () => {
  test('running them again changes nothing', async () => {
    await migrateGameTables(db);
    expect(await store.list(filter())).toEqual({ records: [], more: false });
  });
});

describe('built-in levels', () => {
  test('are listed first, with no author, and read back as stored', async () => {
    for (const level of CLASSIC_LEVELS) await store.upsertBuiltin(level);
    const draft = await store.create(ana, { name: 'Torre', data });
    await store.setPublished(draft.id, true);
    const listed = (await store.list(filter())).records;
    expect(listed.map((l) => l.id)).toEqual(['classic-1', 'classic-2', 'classic-3', draft.id]);
    expect(listed[0]).toMatchObject({
      builtin: true,
      published: true,
      authorId: null,
      authorNickname: null,
    });
    expect((await store.get('classic-2'))?.data).toEqual(CLASSIC_LEVELS[1]!.data);
  });

  test('upserting again updates the data and keeps updatedAt', async () => {
    const classic = CLASSIC_LEVELS[0]!;
    await store.upsertBuiltin(classic);
    clock = 9_000;
    const changed = { ...classic.data, coins: [] };
    await store.upsertBuiltin({ ...classic, data: changed });
    const stored = await store.get(classic.slug);
    expect(stored?.data.coins).toEqual([]);
    expect(stored?.updatedAt).toBe(1_000);
  });
});

describe('visibility', () => {
  test('a draft is only listed for its author until it is published', async () => {
    const draft = await store.create(ana, { name: 'Torre', data });
    expect(draft).toMatchObject({ authorId: ana, authorNickname: 'Ana', published: false });
    expect(await ids(filter({ viewerId: ana }))).toEqual(['Torre']);
    expect(await ids(filter({ viewerId: beto }))).toEqual([]);
    expect(await ids(filter())).toEqual([]);
    expect(await ids(filter({ viewerId: ana, mineOnly: true }))).toEqual(['Torre']);
    expect(await ids(filter({ viewerId: beto, mineOnly: true }))).toEqual([]);
    expect(await ids(filter({ mineOnly: true }))).toEqual([]);
    await store.setPublished(draft.id, true);
    expect(await ids(filter({ viewerId: beto }))).toEqual(['Torre']);
    expect(await ids(filter({ viewerId: beto, mineOnly: true }))).toEqual([]);
  });
});

describe('search', () => {
  beforeEach(async () => {
    for (const level of CLASSIC_LEVELS) await store.upsertBuiltin(level);
    for (const [author, name] of [
      [ana, 'Torre'],
      [beto, '50% off'],
      [beto, '500 off'],
      [beto, 'abc'],
    ] as const) {
      const level = await store.create(author, { name, data });
      await store.setPublished(level.id, true);
    }
  });

  test('finds names whatever the case', async () => {
    expect(await ids(filter({ search: 'TORRE' }))).toEqual(['Torre']);
  });

  test('finds levels by their author', async () => {
    expect(await ids(filter({ search: 'ana' }))).toEqual(['Torre']);
    expect(await ids(filter({ search: 'bullets' }))).toEqual([
      'Classic 1',
      'Classic 2',
      'Classic 3',
    ]);
  });

  test('takes %, _ and \\ literally', async () => {
    expect(await ids(filter({ search: '50%' }))).toEqual(['50% off']);
    expect(await ids(filter({ search: 'a_c' }))).toEqual([]);
    expect(await ids(filter({ search: '\\' }))).toEqual([]);
  });
});

test('offset and limit page through the levels in a stable order', async () => {
  for (let i = 0; i < 25; i++) {
    clock = 1_000 + i;
    const level = await store.create(i % 2 ? ana : beto, { name: `L${i}`, data });
    await store.setPublished(level.id, true);
  }
  const all = await ids(filter({ limit: 100 }));
  expect(all).toHaveLength(25);
  expect(all[0]).toBe('L24');
  const pages = [
    ...(await ids(filter({ limit: 10 }))),
    ...(await ids(filter({ limit: 10, offset: 10 }))),
    ...(await ids(filter({ limit: 10, offset: 20 }))),
  ];
  expect(pages).toEqual(all);
});

describe('writes', () => {
  test('update changes name and data and bumps updatedAt', async () => {
    const level = await store.create(ana, { name: 'Torre', data });
    clock = 5_000;
    const changed = { ...data, ammo: [] };
    const updated = await store.update(level.id, { name: 'Torre 2', data: changed });
    expect(updated).toMatchObject({ name: 'Torre 2', updatedAt: 5_000, createdAt: 1_000 });
    expect(updated?.data.ammo).toEqual([]);
    expect(await store.update('missing', { name: 'x', data })).toBeNull();
  });

  test('delete removes the level', async () => {
    const level = await store.create(ana, { name: 'Torre', data });
    await store.delete(level.id);
    expect(await store.get(level.id)).toBeNull();
  });

  test('countByAuthor counts only that author', async () => {
    await store.create(ana, { name: 'A1', data });
    await store.create(ana, { name: 'A2', data });
    await store.create(beto, { name: 'B1', data });
    expect(await store.countByAuthor(ana)).toBe(2);
    expect(await store.countByAuthor(beto)).toBe(1);
  });
});

test('a row whose data no longer parses is skipped, never a crash', async () => {
  const good = await store.create(ana, { name: 'Good', data });
  const bad = await store.create(ana, { name: 'Bad', data });
  await db.kysely
    .updateTable('level')
    .set({ data: '{"cols":3}' })
    .where('id', '=', bad.id)
    .execute();
  await db.kysely
    .updateTable('level')
    .set({ data: 'not json' })
    .where('id', '=', good.id)
    .execute();
  const third = await store.create(ana, { name: 'Third', data });
  expect(await ids(filter({ viewerId: ana }))).toEqual(['Third']);
  expect(await store.get(bad.id)).toBeNull();
  expect(await store.get(good.id)).toBeNull();
  expect(await store.get(third.id)).not.toBeNull();
});
