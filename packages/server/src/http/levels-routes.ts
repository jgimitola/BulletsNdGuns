import express, { type ErrorRequestHandler, type Request, type Response } from 'express';
import {
  levelIdSchema,
  parseLevelQuery,
  parseLevelWrite,
  type LevelError,
  type LevelId,
} from '@bng/shared';
import type { Auth } from '../auth/auth.ts';
import type { LevelService, ServiceResult } from '../levels/level-service.ts';
import { rateLimiter, type RateLimiter } from '../net/rate-limiter.ts';

/** A level is about 6 KB of JSON; this leaves room without letting a request hog memory. */
const BODY_LIMIT = '32kb';
const WRITES_PER_WINDOW = 20;
const WRITE_WINDOW_MS = 60_000;

const STATUS: Record<LevelError, number> = {
  invalid: 400,
  signInRequired: 401,
  forbidden: 403,
  notFound: 404,
  levelUnavailable: 404,
  notPublishable: 409,
  tooManyLevels: 409,
};

function sendError(res: Response, error: LevelError | 'rateLimited'): void {
  res.status(error === 'rateLimited' ? 429 : STATUS[error]).json({ error });
}

function sendLevel<T>(res: Response, result: ServiceResult<T>, status = 200): void {
  if (!result.ok) return sendError(res, result.error);
  res.status(status).json({ level: result.value });
}

/** `/api/levels`: the level browser's list, and every level read and write (see the spec). */
export function levelsRouter(
  service: LevelService,
  sessionAccount: Auth['sessionAccount'],
): express.Router {
  const router = express.Router();
  const writeLimits = new Map<string, RateLimiter>();

  router.use(express.json({ limit: BODY_LIMIT }));
  router.use((_req, res, next) => {
    // Lists and levels change with every save; a cached copy would show stale levels.
    res.set('Cache-Control', 'no-store');
    next();
  });

  const viewerOf = async (req: Request) => (await sessionAccount(req.headers))?.id ?? null;
  const idOf = (req: Request): LevelId | null =>
    levelIdSchema.safeParse(req.params['id']).data ?? null;

  /** Runs a write for the signed-in caller, or answers why it can't run. */
  const write =
    (run: (authorId: string, req: Request, res: Response) => Promise<void>) =>
    async (req: Request, res: Response) => {
      const authorId = await viewerOf(req);
      if (authorId === null) return sendError(res, 'signInRequired');
      let limit = writeLimits.get(authorId);
      if (!limit)
        writeLimits.set(authorId, (limit = rateLimiter(WRITES_PER_WINDOW, WRITE_WINDOW_MS)));
      if (!limit.hit()) return sendError(res, 'rateLimited');
      await run(authorId, req, res);
    };

  router.get('/', async (req, res) => {
    const query = parseLevelQuery(req.query);
    if (!query) return sendError(res, 'invalid');
    res.json(await service.list(await viewerOf(req), query));
  });

  router.get('/:id', async (req, res) => {
    const id = idOf(req);
    if (!id) return sendError(res, 'notFound');
    sendLevel(res, await service.get(await viewerOf(req), id));
  });

  router.post(
    '/',
    write(async (authorId, req, res) => {
      const body = parseLevelWrite(req.body);
      if (!body) return sendError(res, 'invalid');
      sendLevel(res, await service.create(authorId, body), 201);
    }),
  );

  router.put(
    '/:id',
    write(async (authorId, req, res) => {
      const id = idOf(req);
      const body = parseLevelWrite(req.body);
      if (!id) return sendError(res, 'notFound');
      if (!body) return sendError(res, 'invalid');
      sendLevel(res, await service.update(authorId, id, body));
    }),
  );

  router.delete(
    '/:id',
    write(async (authorId, req, res) => {
      const id = idOf(req);
      if (!id) return sendError(res, 'notFound');
      const result = await service.delete(authorId, id);
      if (!result.ok) return sendError(res, result.error);
      res.status(204).end();
    }),
  );

  for (const [action, published] of [
    ['publish', true],
    ['unpublish', false],
  ] as const) {
    router.post(
      `/:id/${action}`,
      write(async (authorId, req, res) => {
        const id = idOf(req);
        if (!id) return sendError(res, 'notFound');
        sendLevel(res, await service.setPublished(authorId, id, published));
      }),
    );
  }

  router.post(
    '/:id/duplicate',
    write(async (authorId, req, res) => {
      const id = idOf(req);
      if (!id) return sendError(res, 'notFound');
      sendLevel(res, await service.duplicate(authorId, id), 201);
    }),
  );

  // Body parser failures (bad JSON, too large) answer in the API's shape, not Express's HTML page.
  const bodyErrors: ErrorRequestHandler = (error: { status?: number }, _req, res, next) => {
    if (error.status === 413) return res.status(413).json({ error: 'tooLarge' });
    if (error.status === 400) return sendError(res, 'invalid');
    next(error);
  };
  router.use(bodyErrors);

  return router;
}
