import express, { type RequestHandler } from 'express';
import type { RoomSummary } from '@bng/shared';
import { CLIENT_IP_HEADER } from '../auth/auth.ts';
import type { ServerConfig } from '../config.ts';
import { precompressed } from './precompressed.ts';

/** Account requests carry a few short fields; anything bigger is refused before it is buffered. */
const AUTH_BODY_LIMIT = '16kb';

export interface AppDeps {
  /** Open rooms for the room table. */
  listRooms(): RoomSummary[];
  /** better-auth's endpoints. It reuses a body already read, so the size limit runs first. */
  authHandler: RequestHandler;
}

/**
 * better-auth rate-limits by the address in CLIENT_IP_HEADER. Set from Express's view of the client
 * (the socket, or the proxy chain `trust proxy` allows), so a player can't pick their own bucket.
 */
const clientIp: RequestHandler = (req, _res, next) => {
  req.headers[CLIENT_IP_HEADER] = req.ip ?? '';
  next();
};

export function createApp(
  config: Pick<ServerConfig, 'clientDist' | 'trustProxy'>,
  deps: AppDeps,
): express.Express {
  const app = express();
  app.set('trust proxy', config.trustProxy);
  app.get('/healthz', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });
  app.get('/api/rooms', (_req, res) => {
    // The table polls this; a cached copy would show rooms that are already gone.
    res.set('Cache-Control', 'no-store').json({ rooms: deps.listRooms() });
  });
  app.all(
    '/api/auth/*splat',
    // Reads the body as text (any type) up to the limit, answering 413 past it.
    express.text({ type: () => true, limit: AUTH_BODY_LIMIT }),
    clientIp,
    deps.authHandler,
  );
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'notFound' });
  });
  app.use(precompressed(config.clientDist));
  app.use(express.static(config.clientDist));
  // Reached only when the static handler has no index.html (client not built): redirecting would loop.
  app.get('/', (_req, res) => {
    res.status(404).type('text/plain').send('Client build not found. Run `npm run build`.');
  });
  app.use((_req, res) => {
    res.redirect('/');
  });
  return app;
}
