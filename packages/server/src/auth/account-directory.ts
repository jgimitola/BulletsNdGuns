import { nicknameKey } from '@bng/shared';
import type { Database } from '../db/database.ts';

/** Which nicknames registered accounts own; the nickname registry asks before a guest takes one. */
export interface AccountDirectory {
  /** Compared by `nicknameKey`, so case and width don't matter. */
  isNicknameRegistered(nickname: string): Promise<boolean>;
}

/** better-auth's username plugin stores the key in `user.username`. */
export function kyselyAccountDirectory(db: Database): AccountDirectory {
  return {
    async isNicknameRegistered(nickname) {
      const row = await db.kysely
        .selectFrom('user')
        .select('id')
        .where('username', '=', nicknameKey(nickname))
        .executeTakeFirst();
      return row !== undefined;
    },
  };
}
