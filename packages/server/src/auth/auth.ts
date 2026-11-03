import type { IncomingHttpHeaders } from 'node:http';
import { isReservedNickname, nicknameKey, parseNickname } from '@bng/shared';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import { fromNodeHeaders } from 'better-auth/node';
import { username } from 'better-auth/plugins/username';
import type { ServerConfig } from '../config.ts';
import type { Database } from '../db/database.ts';

export interface AuthEvents {
  /** An account registered or renamed; `nickname` is the name as typed. */
  nicknameChanged(accountId: string, nickname: string): void;
}

/** Set by the HTTP app from the client's address; better-auth's rate limits count by it. */
export const CLIENT_IP_HEADER = 'x-bng-client-ip';

/**
 * better-auth endpoints the game never calls. Email verification, email change and password reset
 * are out of scope, and an enabled endpoint is attack surface even when no screen links to it.
 */
const DISABLED_PATHS = [
  '/verify-email',
  '/send-verification-email',
  '/change-email',
  '/request-password-reset',
  '/reset-password',
  '/delete-user',
];

/** Who a request or socket belongs to, from its session cookie. */
export interface SessionAccount {
  id: string;
  nickname: string;
}

const isValidNickname = (nickname: string): boolean =>
  parseNickname(nickname) !== null && !isReservedNickname(nickname);

/**
 * The username plugin keeps the key in `username` and the name as typed in `displayUsername`.
 * Both must be sent together and agree, so nobody shows a name whose key they don't own.
 */
function nicknameFieldsAgree(user: Record<string, unknown>): boolean {
  const { username: key, displayUsername: display } = user;
  if (key === undefined && display === undefined) return true;
  return typeof key === 'string' && typeof display === 'string' && nicknameKey(display) === key;
}

function authOptions(db: Database, config: ServerConfig, events: AuthEvents) {
  return {
    database: { db: db.kysely, type: 'sqlite' },
    secret: config.authSecret,
    baseURL: config.authUrl,
    trustedOrigins: config.trustedOrigins,
    telemetry: { enabled: false },
    disabledPaths: DISABLED_PATHS,
    rateLimit: { enabled: config.authRateLimit },
    advanced: { ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] } },
    emailAndPassword: { enabled: true, requireEmailVerification: false },
    plugins: [
      username({
        // Code units, not characters: parseNickname is the real rule. This only lifts the default of 3.
        minUsernameLength: 1,
        maxUsernameLength: 12 * 2,
        usernameValidator: isValidNickname,
        displayUsernameValidator: isValidNickname,
        usernameNormalization: nicknameKey,
        displayUsernameNormalization: (nickname) => nickname.trim(),
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (!nicknameFieldsAgree(user)) return false;
            const nickname = user['displayUsername'];
            return { data: { ...user, name: typeof nickname === 'string' ? nickname : user.name } };
          },
          after: async (user) => {
            const nickname = user['displayUsername'];
            if (typeof nickname === 'string') events.nicknameChanged(user.id, nickname);
          },
        },
        update: {
          before: async (user) => (nicknameFieldsAgree(user) ? undefined : false),
          after: async (user) => {
            const nickname = user['displayUsername'];
            if (typeof nickname === 'string') events.nicknameChanged(user.id, nickname);
          },
        },
      },
    },
  } satisfies BetterAuthOptions;
}

type BetterAuthInstance = ReturnType<typeof betterAuth<ReturnType<typeof authOptions>>>;

export interface Auth {
  /** Server-side calls into better-auth (used by tests and server code, never by clients). */
  api: BetterAuthInstance['api'];
  /** The `/api/auth/*` endpoints, for `toNodeHandler`. */
  handler: BetterAuthInstance;
  /** The signed-in account of a request or socket handshake; null for guests and bad cookies. */
  sessionAccount(headers: IncomingHttpHeaders): Promise<SessionAccount | null>;
}

/** Builds better-auth on `db` and brings its tables up to date. */
export async function createAuth(
  db: Database,
  config: ServerConfig,
  events: AuthEvents,
): Promise<Auth> {
  const options = authOptions(db, config, events);
  // Before betterAuth(): it checks the schema on creation and would log the missing tables.
  const { runMigrations } = await getMigrations(options);
  await runMigrations();
  const auth = betterAuth(options);
  return {
    api: auth.api,
    handler: auth,
    async sessionAccount(headers) {
      try {
        const session = await auth.api.getSession({ headers: fromNodeHeaders(headers) });
        const nickname = session?.user.displayUsername;
        return session && nickname ? { id: session.user.id, nickname } : null;
      } catch {
        return null;
      }
    },
  };
}
