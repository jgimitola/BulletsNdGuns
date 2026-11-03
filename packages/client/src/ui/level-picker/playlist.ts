import { CLASSIC_LEVELS, MAX_PLAYLIST_LENGTH } from '@bng/shared';

/** A level in the create-room playlist; the name is kept so chips need no lookup. */
export interface PlaylistItem {
  id: string;
  name: string;
}

/** What a new room plays unless the creator changes it: the three classics. */
export function defaultPlaylist(): PlaylistItem[] {
  return CLASSIC_LEVELS.map((l) => ({ id: l.slug, name: l.name }));
}

/** Clicking a level in the browser: removes it (every copy) when present, else adds it at the end. */
export function toggleLevel(list: readonly PlaylistItem[], item: PlaylistItem): PlaylistItem[] {
  if (list.some((l) => l.id === item.id)) return list.filter((l) => l.id !== item.id);
  return list.length < MAX_PLAYLIST_LENGTH ? [...list, item] : [...list];
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
