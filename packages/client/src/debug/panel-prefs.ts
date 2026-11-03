export interface PanelPrefs {
  x: number;
  y: number;
  collapsed: boolean;
}

const STORAGE_KEY = 'bng:debug-panel';

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

function isPrefs(v: unknown): v is PanelPrefs {
  if (typeof v !== 'object' || v === null) return false;
  const { x, y, collapsed } = v as Record<string, unknown>;
  return (
    typeof x === 'number' &&
    Number.isFinite(x) &&
    typeof y === 'number' &&
    Number.isFinite(y) &&
    typeof collapsed === 'boolean'
  );
}

/**
 * The panel's saved place and state. Anything unreadable falls back; a position from an older
 * layout is pulled back inside the canvas (the panel clamps again once it knows its own size).
 */
export function loadPanelPrefs(
  storage: Pick<Storage, 'getItem'>,
  fallback: PanelPrefs,
  bounds: { width: number; height: number },
): PanelPrefs {
  return loadPrefsAt(STORAGE_KEY, storage, fallback, bounds);
}

export function savePanelPrefs(storage: Pick<Storage, 'setItem'>, prefs: PanelPrefs): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

/** The same load for any floating panel that keeps its place under its own storage key. */
export function loadPrefsAt(
  key: string,
  storage: Pick<Storage, 'getItem'>,
  fallback: PanelPrefs,
  bounds: { width: number; height: number },
): PanelPrefs {
  let parsed: unknown;
  try {
    parsed = JSON.parse(storage.getItem(key) ?? 'null');
  } catch {
    return fallback;
  }
  if (!isPrefs(parsed)) return fallback;
  return {
    x: clamp(parsed.x, 0, bounds.width - 1),
    y: clamp(parsed.y, 0, bounds.height - 1),
    collapsed: parsed.collapsed,
  };
}

/** Movement up to this many px between press and release still counts as a click, not a drag. */
export const PANEL_TOGGLE_MAX_DRAG_PX = 4;

/** Whether a press-release on the panel title should toggle it rather than end a drag. */
export function isTitleClick(downX: number, downY: number, upX: number, upY: number): boolean {
  return Math.hypot(upX - downX, upY - downY) <= PANEL_TOGGLE_MAX_DRAG_PX;
}
