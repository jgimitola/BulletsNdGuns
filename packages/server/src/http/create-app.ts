import express, { type RequestHandler } from 'express';
import type { RoomSummary } from '@bng/shared';
import type { ServerConfig } from '../config.ts';
import { precompressed } from './precompressed.ts';

export interface AppDeps {
  /** Open rooms for the room table. */
  listRooms(): RoomSummary[];
  /** better-auth's endpoints; it reads its own bodies, so it runs before any body parser. */
  authHandler: RequestHandler;
}

export function createApp(config: Pick<ServerConfig, 'clientDist'>, deps: AppDeps): express.Express {
  const app = express();
  app.get('/healthz', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });
  app.get('/api/rooms', (_req, res) => {
    // The table polls this; a cached copy would show rooms that are already gone.
    res.set('Cache-Control', 'no-store').json({ rooms: deps.listRooms() });
  });
  app.all('/api/auth/*splat', deps.authHandler);
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
