import type { LevelPage, LevelQuery } from '@bng/shared';

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
