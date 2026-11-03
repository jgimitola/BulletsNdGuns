import { expect, test } from 'vitest';
import type { LevelDetail } from '@bng/shared';
import { createLevelsApi } from '../src/net/levels-api.ts';
import { emptyLevel } from '../src/editor/level-edits.ts';

const level: LevelDetail = {
  id: 'id1',
  name: 'Torre',
  author: 'Ana',
  builtin: false,
  published: false,
  playable: false,
  updatedAt: '2026-11-03T10:00:00.000Z',
  data: emptyLevel(),
};

interface Call {
  url: string;
  method: string;
  body: unknown;
  contentType: string | null;
}

function fakeFetch(answer: () => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      contentType: headers.get('content-type'),
    });
    return answer();
  }) as typeof fetch;
  return { calls, fetchFn };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

test('create POSTs the level as JSON and returns the stored one', async () => {
  const { calls, fetchFn } = fakeFetch(() => json(201, { level }));
  const write = { name: 'Torre', data: emptyLevel() };
  expect(await createLevelsApi(fetchFn).create(write)).toEqual({ ok: true, value: level });
  expect(calls).toEqual([
    { url: '/api/levels', method: 'POST', body: write, contentType: 'application/json' },
  ]);
});

test('get, update, publish, unpublish and duplicate hit their routes', async () => {
  const { calls, fetchFn } = fakeFetch(() => json(200, { level }));
  const api = createLevelsApi(fetchFn);
  const write = { name: 'Torre', data: emptyLevel() };
  await api.get('id1');
  await api.update('id1', write);
  await api.setPublished('id1', true);
  await api.setPublished('id1', false);
  await api.duplicate('id1');
  expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
    'GET /api/levels/id1',
    'PUT /api/levels/id1',
    'POST /api/levels/id1/publish',
    'POST /api/levels/id1/unpublish',
    'POST /api/levels/id1/duplicate',
  ]);
  expect(calls[1]!.body).toEqual(write);
});

test('ids are escaped in the path', async () => {
  const { calls, fetchFn } = fakeFetch(() => json(200, { level }));
  await createLevelsApi(fetchFn).get('a/b');
  expect(calls[0]!.url).toBe('/api/levels/a%2Fb');
});

test('remove handles a 204', async () => {
  const { calls, fetchFn } = fakeFetch(() => new Response(null, { status: 204 }));
  expect(await createLevelsApi(fetchFn).remove('id1')).toEqual({ ok: true, value: null });
  expect(calls[0]!.method).toBe('DELETE');
});

test.each([
  [409, { error: 'notPublishable' }, 'notPublishable'],
  [409, { error: 'tooManyLevels' }, 'tooManyLevels'],
  [404, { error: 'notFound' }, 'notFound'],
  [401, { error: 'signInRequired' }, 'signInRequired'],
  [429, { error: 'rateLimited' }, 'rateLimited'],
  [429, {}, 'rateLimited'],
  [413, { error: 'tooLarge' }, 'tooLarge'],
  [500, { error: 'whatever' }, 'unknown'],
])('a %i %j maps to %s', async (status, body, error) => {
  const { fetchFn } = fakeFetch(() => json(status, body));
  expect(await createLevelsApi(fetchFn).get('id1')).toEqual({ ok: false, error });
});

test('an HTML error page maps to unknown', async () => {
  const { fetchFn } = fakeFetch(() => new Response('<html>', { status: 502 }));
  expect(await createLevelsApi(fetchFn).get('id1')).toEqual({ ok: false, error: 'unknown' });
});

test('a rejected fetch maps to network', async () => {
  const { fetchFn } = fakeFetch(() => Promise.reject(new TypeError('Failed to fetch')));
  expect(await createLevelsApi(fetchFn).get('id1')).toEqual({ ok: false, error: 'network' });
});
