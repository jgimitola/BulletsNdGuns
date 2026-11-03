/** Every overlay layer `VITE_DEBUG` can switch on. */
export const DEBUG_LAYERS = [
  'hitboxes',
  'tiles',
  'ghost',
  'trail',
  'forces',
  'timers',
  'panel',
] as const;
export type DebugLayer = (typeof DEBUG_LAYERS)[number];

const ALL = 'all';

function isLayer(name: string): name is DebugLayer {
  return (DEBUG_LAYERS as readonly string[]).includes(name);
}

/**
 * Reads a comma-separated layer list such as `hitboxes, trail` or `all`. A typo warns instead of
 * failing, so the rest of the list still shows.
 */
export function parseDebugLayers(
  raw: string | undefined,
  warn: (message: string) => void = console.warn,
): ReadonlySet<DebugLayer> {
  const names = (raw ?? '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name !== '');
  if (names.includes(ALL)) return new Set(DEBUG_LAYERS);

  const layers = new Set<DebugLayer>();
  const unknown: string[] = [];
  for (const name of names) {
    if (isLayer(name)) layers.add(name);
    else unknown.push(name);
  }
  if (unknown.length > 0) {
    warn(
      `VITE_DEBUG: unknown layer(s) ${unknown.join(', ')}. Valid: ${ALL}, ${DEBUG_LAYERS.join(', ')}.`,
    );
  }
  return layers;
}
