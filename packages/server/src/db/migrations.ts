import type { Kysely } from 'kysely';
import { Migrator, type Migration } from 'kysely/migration';
import type { Database } from './database.ts';

/**
 * The game's own tables, beside better-auth's. Append new migrations; never edit one that has
 * shipped. Names sort in the order they run.
 */
const MIGRATIONS: Record<string, Migration> = {
  '2026-11-03-level': {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async up(db: Kysely<any>) {
      await db.schema
        .createTable('level')
        .addColumn('id', 'text', (c) => c.primaryKey())
        .addColumn('name', 'text', (c) => c.notNull())
        // nicknameKey(name): what search compares against.
        .addColumn('name_key', 'text', (c) => c.notNull())
        // No foreign key: SQLite doesn't enforce them by default, and accounts can't be deleted.
        .addColumn('author_id', 'text')
        .addColumn('builtin', 'integer', (c) => c.notNull().defaultTo(0))
        .addColumn('published', 'integer', (c) => c.notNull().defaultTo(0))
        // LevelData as JSON.
        .addColumn('data', 'text', (c) => c.notNull())
        .addColumn('created_at', 'integer', (c) => c.notNull())
        .addColumn('updated_at', 'integer', (c) => c.notNull())
        .execute();
      await db.schema.createIndex('level_author_id').on('level').column('author_id').execute();
      await db.schema.createIndex('level_published').on('level').column('published').execute();
    },
  },
};

/** Brings the game's tables up to date; run on every start, after better-auth's. */
export async function migrateGameTables(db: Database): Promise<void> {
  const migrator = new Migrator({
    db: db.kysely,
    provider: { getMigrations: async () => MIGRATIONS },
  });
  const { error } = await migrator.migrateToLatest();
  if (error) throw error;
}
