import express from 'express';
import type { ServerConfig } from '../config.ts';

export function createApp(config: ServerConfig): express.Express {
  const app = express();
  app.get('/healthz', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });
  app.use(express.static(config.clientDist));
  app.use((_req, res) => {
    res.redirect('/');
  });
  return app;
}
