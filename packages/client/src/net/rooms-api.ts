import type { RoomSummary } from '@bng/shared';

export const ROOMS_QUERY_KEY = ['rooms'] as const;

/** The room table. Throws on a network error or a non-2xx answer, so the query shows its error. */
export async function fetchRooms(signal?: AbortSignal): Promise<RoomSummary[]> {
  const res = await fetch('/api/rooms', { signal });
  if (!res.ok) throw new Error(`GET /api/rooms answered ${res.status}`);
  const body = (await res.json()) as { rooms?: unknown };
  if (!Array.isArray(body.rooms)) throw new Error('GET /api/rooms returned no room list');
  return body.rooms as RoomSummary[];
}
