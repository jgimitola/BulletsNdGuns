import { CLASSIC_LEVELS, MAX_PLAYLIST_LENGTH } from '@bng/shared';

/** A level the browser lists: what the playlist needs to know about it. */
export interface LevelChoice {
  id: string;
  name: string;
}

/**
 * A level in the create-room playlist; the name is kept so chips need no lookup. `key` is unique
 * per chip and follows it when it moves, so React keeps the focused chip focused.
 */
export interface PlaylistItem extends LevelChoice {
  key: number;
}

let nextKey = 1;
const toItem = (level: LevelChoice): PlaylistItem => ({ ...level, key: nextKey++ });

/** What a new room plays unless the creator changes it: the three classics. */
export function defaultPlaylist(): PlaylistItem[] {
  return CLASSIC_LEVELS.map((l) => toItem({ id: l.slug, name: l.name }));
}

/** Clicking a level in the browser: removes it (every copy) when present, else adds it at the end. */
export function toggleLevel(list: readonly PlaylistItem[], level: LevelChoice): PlaylistItem[] {
  if (list.some((l) => l.id === level.id)) return list.filter((l) => l.id !== level.id);
  return list.length < MAX_PLAYLIST_LENGTH ? [...list, toItem(level)] : [...list];
}

export function removeAt(list: readonly PlaylistItem[], index: number): PlaylistItem[] {
  return list.filter((_, i) => i !== index);
}

/** Moves the item at `from` to `to`; out-of-range indexes leave the list as it was. */
export function moveItem(list: readonly PlaylistItem[], from: number, to: number): PlaylistItem[] {
  const inRange = (i: number) => Number.isInteger(i) && i >= 0 && i < list.length;
  if (!inRange(from) || !inRange(to)) return [...list];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as PlaylistItem);
  return next;
}
