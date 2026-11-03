import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export interface ServerConfig {
  port: number;
  clientDist: string;
  /** SQLite file, or `:memory:` for a database that lives as long as the process. */
  databasePath: string;
  authSecret: string;
  /** Public URL of the server, which better-auth builds its links and cookie checks from. */
  authUrl: string;
  /** Origins besides `authUrl` that may call the auth API (the Vite dev server). */
  trustedOrigins: string[];
}

const DEFAULT_PORT = 3000;
const DEFAULT_CLIENT_DIST = fileURLToPath(new URL('../../client/dist', import.meta.url));
const DEFAULT_DATABASE_PATH = fileURLToPath(new URL('../../../data/bng.sqlite', import.meta.url));
/** Local runs only: production refuses to start without BETTER_AUTH_SECRET. */
const DEV_AUTH_SECRET = 'bng-dev-only-7f3c9a1e5b2d8046c1f9e3a7d5b0c2e4';
const DEV_TRUSTED_ORIGINS = ['http://localhost:5173'];

/** Empty strings count as unset, as a blank line in an env file means. */
const optional = z
  .string()
  .optional()
  .transform((value) => (value ? value : undefined));

const envSchema = z
  .object({
    NODE_ENV: optional,
    PORT: optional,
    CLIENT_DIST: optional,
    DATABASE_PATH: optional,
    BETTER_AUTH_SECRET: optional,
    BETTER_AUTH_URL: optional,
    TRUSTED_ORIGINS: optional,
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.BETTER_AUTH_SECRET) {
      ctx.addIssue({ code: 'custom', message: 'BETTER_AUTH_SECRET is required in production' });
    }
  })
  .transform((env): ServerConfig => {
    const production = env.NODE_ENV === 'production';
    const parsedPort = Number(env.PORT);
    const port =
      env.PORT && Number.isInteger(parsedPort) && parsedPort >= 0 ? parsedPort : DEFAULT_PORT;
    return {
      port,
      clientDist: env.CLIENT_DIST ?? DEFAULT_CLIENT_DIST,
      databasePath: env.DATABASE_PATH ?? DEFAULT_DATABASE_PATH,
      authSecret: env.BETTER_AUTH_SECRET ?? DEV_AUTH_SECRET,
      authUrl: env.BETTER_AUTH_URL ?? `http://localhost:${port}`,
      trustedOrigins: env.TRUSTED_ORIGINS
        ? env.TRUSTED_ORIGINS.split(',')
            .map((origin) => origin.trim())
            .filter((origin) => origin !== '')
        : production
          ? []
          : DEV_TRUSTED_ORIGINS,
    };
  });

/** Throws with the reason when the environment can't run the server. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) throw new Error(result.error.issues.map((i) => i.message).join('; '));
  return result.data;
}
