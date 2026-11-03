import { randomUUID } from 'node:crypto';
import { sql, type Kysely, type Selectable } from 'kysely';
import { RESERVED_NICKNAME, nicknameKey, parseLevelData, type LevelWrite } from '@bng/shared';
import type { Database } from '../db/database.ts';
import type { LevelRecord, LevelStore } from './level-store.ts';

interface LevelTable {
  id: string;
  name: string;
  name_key: string;
  author_id: string | null;
  builtin: number;
  published: number;
  data: string;
  created_at: number;
  updated_at: number;
}

/** better-auth's user table, as far as levels read it. */
interface UserTable {
  id: string;
  username: string | null;
  displayUsername: string | null;
}

interface Tables {
  level: LevelTable;
  user: UserTable;
}

type LevelRow = Selectable<LevelTable> & { author_nickname: string | null };

/** The author key built-in levels match in search. */
const BUILTIN_AUTHOR_KEY = nicknameKey(RESERVED_NICKNAME);

/** `term` as a LIKE pattern that matches it literally anywhere, with `\` as the escape. */
function containsPattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Null when the stored data no longer parses (a manual edit, an older format). */
function toRecord(row: LevelRow): LevelRecord | null {
  let data: unknown;
  try {
    data = JSON.parse(row.data);
  } catch {
    return null;
  }
  const parsed = parseLevelData(data);
  if (!parsed) return null;
  return {
    id: row.id,
    name: row.name,
    authorId: row.author_id,
    authorNickname: row.author_nickname,
    builtin: row.builtin === 1,
    published: row.published === 1,
    data: parsed,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** LevelStore on the server's SQLite database, through Kysely. */
export function kyselyLevelStore(db: Database, now: () => number = Date.now): LevelStore {
  const kysely = db.kysely as unknown as Kysely<Tables>;

  const select = () =>
    kysely
      .selectFrom('level')
      .leftJoin('user', 'user.id', 'level.author_id')
      .selectAll('level')
      .select('user.displayUsername as author_nickname');

  const get = async (id: string): Promise<LevelRecord | null> => {
    const row = await select().where('level.id', '=', id).executeTakeFirst();
    return row ? toRecord(row) : null;
  };

  return {
    async list({ viewerId, mineOnly, search, offset, limit }) {
      if (mineOnly && viewerId === null) return { records: [], more: false };
      let query = select();
      if (mineOnly) {
        query = query.where('level.author_id', '=', viewerId);
      } else {
        query = query.where((eb) =>
          viewerId === null
            ? eb('level.published', '=', 1)
            : eb.or([eb('level.published', '=', 1), eb('level.author_id', '=', viewerId)]),
        );
      }
      const term = nicknameKey(search);
      if (term !== '') {
        const pattern = containsPattern(term);
        const authorKey = sql`coalesce(${sql.ref('user.username')}, ${BUILTIN_AUTHOR_KEY})`;
        query = query.where(
          sql<boolean>`(${sql.ref('level.name_key')} like ${pattern} escape '\\' or ${authorKey} like ${pattern} escape '\\')`,
        );
      }
      const rows = await query
        .orderBy('level.builtin', 'desc')
        .orderBy(sql`case when ${sql.ref('level.builtin')} = 1 then ${sql.ref('level.id')} end`)
        .orderBy('level.updated_at', 'desc')
        .orderBy('level.id')
        // One extra row says whether another page follows.
        .limit(limit + 1)
        .offset(offset)
        .execute();
      return {
        records: rows
          .slice(0, limit)
          .map(toRecord)
          .filter((r): r is LevelRecord => r !== null),
        more: rows.length > limit,
      };
    },

    get,

    async countByAuthor(authorId) {
      const row = await kysely
        .selectFrom('level')
        .select((eb) => eb.fn.countAll<number>().as('count'))
        .where('author_id', '=', authorId)
        .executeTakeFirstOrThrow();
      return Number(row.count);
    },

    async create(authorId, write: LevelWrite) {
      const id = randomUUID();
      const time = now();
      await kysely
        .insertInto('level')
        .values({
          id,
          name: write.name,
          name_key: nicknameKey(write.name),
          author_id: authorId,
          builtin: 0,
          published: 0,
          data: JSON.stringify(write.data),
          created_at: time,
          updated_at: time,
        })
        .execute();
      const created = await get(id);
      if (!created) throw new Error(`Level ${id} vanished right after it was created`);
      return created;
    },

    async update(id, write) {
      const result = await kysely
        .updateTable('level')
        .set({
          name: write.name,
          name_key: nicknameKey(write.name),
          data: JSON.stringify(write.data),
          updated_at: now(),
        })
        .where('id', '=', id)
        .executeTakeFirst();
      return result.numUpdatedRows > 0n ? get(id) : null;
    },

    async setPublished(id, published) {
      await kysely
        .updateTable('level')
        .set({ published: published ? 1 : 0 })
        .where('id', '=', id)
        .execute();
    },

    async delete(id) {
      await kysely.deleteFrom('level').where('id', '=', id).execute();
    },

    async upsertBuiltin({ slug, name, data }) {
      const time = now();
      await kysely
        .insertInto('level')
        .values({
          id: slug,
          name,
          name_key: nicknameKey(name),
          author_id: null,
          builtin: 1,
          published: 1,
          data: JSON.stringify(data),
          created_at: time,
          updated_at: time,
        })
        .onConflict((oc) =>
          oc.column('id').doUpdateSet({
            name,
            name_key: nicknameKey(name),
            data: JSON.stringify(data),
            builtin: 1,
            published: 1,
          }),
        )
        .execute();
    },
  };
}
