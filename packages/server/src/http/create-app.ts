import express from 'express';
import type { ServerConfig } from '../config.ts';

export function createApp(config: ServerConfig): express.Express {
  const app = express();
  app.get('/healthz', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });
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
