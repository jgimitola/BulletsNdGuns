import { loadPrefsAt, type PanelPrefs } from '../../debug/panel-prefs.ts';

/** Where the editor toolbar sits and whether it is collapsed: the debug panel's shape. */
export type ToolbarPrefs = PanelPrefs;

const STORAGE_KEY = 'bng:editor-toolbar';

export function loadToolbarPrefs(
  storage: Pick<Storage, 'getItem'>,
  fallback: ToolbarPrefs,
  bounds: { width: number; height: number },
): ToolbarPrefs {
  return loadPrefsAt(STORAGE_KEY, storage, fallback, bounds);
}

export function saveToolbarPrefs(storage: Pick<Storage, 'setItem'>, prefs: ToolbarPrefs): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}
