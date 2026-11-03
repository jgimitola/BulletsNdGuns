import { TILE_KINDS } from '@bng/shared';

export type ObjectTool = 'coin' | 'ammo' | 'portal' | 'spawnLeft' | 'spawnRight';

export type Tool =
  { kind: 'tile'; id: number } | { kind: 'object'; object: ObjectTool } | { kind: 'eraser' };

const OBJECT_KEYS: readonly [ObjectTool, string][] = [
  ['coin', '9'],
  ['ammo', '0'],
  ['portal', 'p'],
  ['spawnLeft', 'l'],
  ['spawnRight', 'r'],
];

/** Every editor tool, in toolbar order: the tiles 1..8, the objects, then the eraser. */
export const TOOLS: readonly Tool[] = [
  ...Array.from({ length: TILE_KINDS }, (_, i): Tool => ({ kind: 'tile', id: i + 1 })),
  ...OBJECT_KEYS.map(([object]): Tool => ({ kind: 'object', object })),
  { kind: 'eraser' },
];

/** The keyboard shortcut of a tool, lower case. */
export function toolKey(tool: Tool): string {
  if (tool.kind === 'tile') return String(tool.id);
  if (tool.kind === 'eraser') return 'e';
  return OBJECT_KEYS.find(([object]) => object === tool.object)![1];
}

/**
 * The tool a key picks: '1'..'8' tiles, '9' coin, '0' ammo, 'p' portal, 'l' / 'r' spawns,
 * 'e' eraser. Case-insensitive; null for any other key.
 */
export function toolForKey(key: string): Tool | null {
  const lower = key.toLowerCase();
  return TOOLS.find((tool) => toolKey(tool) === lower) ?? null;
}

export function sameTool(a: Tool, b: Tool): boolean {
  if (a.kind === 'tile') return b.kind === 'tile' && a.id === b.id;
  if (a.kind === 'object') return b.kind === 'object' && a.object === b.object;
  return b.kind === 'eraser';
}
