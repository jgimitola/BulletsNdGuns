import type { LevelDetail, LevelError, LevelPage, LevelQuery, LevelWrite } from '@bng/shared';

export const LEVELS_QUERY_KEY = ['levels'] as const;

/** One page of the level browser. Throws on a network error or a non-2xx answer. */
export async function fetchLevels(query: LevelQuery, signal?: AbortSignal): Promise<LevelPage> {
  const params = new URLSearchParams({
    search: query.search,
    mine: query.mine ? '1' : '0',
    offset: String(query.offset),
  });
  const res = await fetch(`/api/levels?${params}`, { signal });
  if (!res.ok) throw new Error(`GET /api/levels answered ${res.status}`);
  const body = (await res.json()) as Partial<LevelPage>;
  if (!Array.isArray(body.levels)) throw new Error('GET /api/levels returned no level list');
  return { levels: body.levels, nextOffset: body.nextOffset ?? null };
}

/** Why a level request failed, as the editor and My levels show it. */
export type ApiError = LevelError | 'rateLimited' | 'tooLarge' | 'network' | 'unknown';
export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: ApiError };

/** The level writes and reads the editor and My levels use; every call answers, never throws. */
export interface LevelsApi {
  get(id: string): Promise<ApiResult<LevelDetail>>;
  create(write: LevelWrite): Promise<ApiResult<LevelDetail>>;
  update(id: string, write: LevelWrite): Promise<ApiResult<LevelDetail>>;
  setPublished(id: string, published: boolean): Promise<ApiResult<LevelDetail>>;
  remove(id: string): Promise<ApiResult<null>>;
  duplicate(id: string): Promise<ApiResult<LevelDetail>>;
}

const LEVEL_ERRORS: readonly ApiError[] = [
  'invalid',
  'signInRequired',
  'notFound',
  'forbidden',
  'notPublishable',
  'tooManyLevels',
  'levelUnavailable',
] satisfies readonly LevelError[];

/** Reads a failed answer's `{ error }`; the status decides when the body says nothing known. */
async function errorOf(res: Response): Promise<ApiError> {
  if (res.status === 429) return 'rateLimited';
  if (res.status === 413) return 'tooLarge';
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
  const error = body?.error;
  return LEVEL_ERRORS.find((known) => known === error) ?? 'unknown';
}

export function createLevelsApi(fetchFn: typeof fetch = (...args) => fetch(...args)): LevelsApi {
  async function request<T>(
    method: string,
    path: string,
    read: (body: unknown) => T,
    body?: unknown,
  ): Promise<ApiResult<T>> {
    let res: Response;
    try {
      res = await fetchFn(`/api/levels${path}`, {
        method,
        ...(body === undefined
          ? {}
          : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      });
    } catch {
      return { ok: false, error: 'network' };
    }
    if (!res.ok) return { ok: false, error: await errorOf(res) };
    try {
      return { ok: true, value: read(res.status === 204 ? null : await res.json()) };
    } catch {
      return { ok: false, error: 'unknown' };
    }
  }

  const level = (body: unknown): LevelDetail => {
    const value = (body as { level?: LevelDetail } | null)?.level;
    if (!value || typeof value !== 'object') throw new Error('no level in the answer');
    return value;
  };
  const at = (id: string) => `/${encodeURIComponent(id)}`;

  return {
    get: (id) => request('GET', at(id), level),
    create: (write) => request('POST', '', level, write),
    update: (id, write) => request('PUT', at(id), level, write),
    setPublished: (id, published) =>
      request('POST', `${at(id)}/${published ? 'publish' : 'unpublish'}`, level),
    remove: (id) => request('DELETE', at(id), () => null),
    duplicate: (id) => request('POST', `${at(id)}/duplicate`, level),
  };
}
