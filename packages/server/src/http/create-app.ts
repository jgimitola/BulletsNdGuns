import express, { type RequestHandler } from 'express';
import type { RoomSummary } from '@bng/shared';
import { CLIENT_IP_HEADER } from '../auth/auth.ts';
import type { ServerConfig } from '../config.ts';
import { allowedOrigins, isAllowedOrigin } from './origins.ts';
import { precompressed } from './precompressed.ts';
import { securityHeaders } from './security-headers.ts';

/** Account requests carry a few short fields; anything bigger is refused before it is buffered. */
const AUTH_BODY_LIMIT = '16kb';

export interface AppDeps {
  /** Open rooms for the room table. */
  listRooms(): RoomSummary[];
  /** better-auth's endpoints. It reuses a body already read, so the size limit runs first. */
  authHandler: RequestHandler;
  /** `/api/levels`. */
  levelsRouter: RequestHandler;
}

/**
 * better-auth rate-limits by the address in CLIENT_IP_HEADER, so a player must not pick their own
 * bucket. It comes from the configured proxy header when there is one (the proxy overwrites it),
 * else from Express's view of the client: the socket, or the proxy chain `trust proxy` allows.
 */
function clientIp(realIpHeader: string | null): RequestHandler {
  return (req, _res, next) => {
    const fromProxy = realIpHeader ? req.get(realIpHeader)?.split(',')[0]?.trim() : undefined;
    req.headers[CLIENT_IP_HEADER] = fromProxy || req.ip || '';
    next();
  };
}

/**
 * Level writes act with the session cookie, so a page on another site must not be able to send
 * them. better-auth checks its own endpoints; this covers ours.
 */
function sameOriginWrites(allowed: ReadonlySet<string>): RequestHandler {
  return (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    if (isAllowedOrigin(req.headers.origin, allowed)) return next();
    res.status(403).json({ error: 'forbidden' });
  };
}

export function createApp(
  config: Pick<
    ServerConfig,
    'clientDist' | 'trustProxy' | 'realIpHeader' | 'authUrl' | 'trustedOrigins'
  >,
  deps: AppDeps,
): express.Express {
  const app = express();
  // Names the framework to anyone probing for known holes; the game has no use for it.
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(securityHeaders(config.authUrl));
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
    clientIp(config.realIpHeader),
    deps.authHandler,
  );
  app.use('/api/levels', sameOriginWrites(allowedOrigins(config)), deps.levelsRouter);
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
