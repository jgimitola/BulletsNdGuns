import { fileURLToPath } from 'node:url';

export interface ServerConfig {
  port: number;
  clientDist: string;
}

const DEFAULT_PORT = 3000;
const DEFAULT_CLIENT_DIST = fileURLToPath(new URL('../../client/dist', import.meta.url));

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const parsed = Number(env['PORT']);
  const port = env['PORT'] && Number.isInteger(parsed) && parsed >= 0 ? parsed : DEFAULT_PORT;
  return { port, clientDist: env['CLIENT_DIST'] || DEFAULT_CLIENT_DIST };
}
