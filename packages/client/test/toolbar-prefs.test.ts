import { describe, expect, it } from 'vitest';
import { loadToolbarPrefs, saveToolbarPrefs } from '../src/ui/editor/toolbar-prefs.ts';

const fallback = { x: 8, y: 8, collapsed: false };
const bounds = { width: 800, height: 600 };
const storage = (value: string | null) => ({
  getItem: (key: string) => (key === 'bng:editor-toolbar' ? value : null),
});

describe('editor toolbar prefs', () => {
  it.each([null, 'not json', '{"x":"1","y":2,"collapsed":false}', '{"x":1,"y":2}', '[]'])(
    'falls back on %j',
    (value) => {
      expect(loadToolbarPrefs(storage(value), fallback, bounds)).toEqual(fallback);
    },
  );

  it('clamps a stored position back inside the game area', () => {
    const prefs = loadToolbarPrefs(
      storage('{"x":5000,"y":-20,"collapsed":true}'),
      fallback,
      bounds,
    );
    expect(prefs).toEqual({ x: 799, y: 0, collapsed: true });
  });

  it('round-trips through save and load under its own key', () => {
    const store = new Map<string, string>();
    const prefs = { x: 100, y: 200, collapsed: true };
    saveToolbarPrefs({ setItem: (k: string, v: string) => store.set(k, v) }, prefs);
    expect([...store.keys()]).toEqual(['bng:editor-toolbar']);
    expect(loadToolbarPrefs({ getItem: (k) => store.get(k) ?? null }, fallback, bounds)).toEqual(
      prefs,
    );
  });
});
