import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { NodeSqliteDialect } from '@better-auth/kysely-adapter/node-sqlite-dialect';
import { Kysely } from 'kysely';

/**
 * The server's one database. Only `db/` and `auth/` see the query builder; everything else talks to
 * the interfaces built on it, so another database means another implementation of those.
 */
export interface Database {
  // Tables come from better-auth's migrations (and later our own); queries name them as strings.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  kysely: Kysely<any>;
  close(): Promise<void>;
}

/** Opens (creating if needed) the SQLite file at `path`, or an in-memory database for `:memory:`. */
export function openDatabase(path: string): Database {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const sqlite = new DatabaseSync(path);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const kysely = new Kysely<any>({ dialect: new NodeSqliteDialect({ database: sqlite }) });
  return {
    kysely,
    async close() {
      // Kysely's destroy closes the driver's connection, and with it the SQLite handle.
      await kysely.destroy();
    },
  };
}
