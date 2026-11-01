export interface TiledLayer {
  name: string;
  type: string;
  data?: number[] | string;
  /**
   * 'base64' | 'csv' in practice. Typed as string so JSON map imports (whose inferred type is
   * `string`) are assignable; decodeLayer validates the value at runtime.
   */
  encoding?: string;
  compression?: string;
}

export interface TiledMap {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: TiledLayer[];
  tilesets: { name: string; firstgid: number }[];
}

/** Tiled stores horizontal/vertical/diagonal flip flags in the top three bits of a gid. */
const GID_MASK = 0x1fffffff;

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decodeBase64(text: string): Uint8Array {
  const clean = text.replace(/[\s=]/g, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let out = 0;
  for (const char of clean) {
    const value = BASE64_ALPHABET.indexOf(char);
    if (value === -1) throw new Error(`Invalid base64 character "${char}"`);
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[out++] = (buffer >> bits) & 0xff;
    }
  }
  return bytes;
}

/**
 * Returns the layer's gids (row-major, flip flags stripped). Supports array data and
 * uncompressed little-endian base64 data.
 */
export function decodeLayer(map: TiledMap, layerName: string): Uint32Array {
  const layer = map.layers.find((l) => l.name === layerName && l.type === 'tilelayer');
  if (!layer || layer.data === undefined) throw new Error(`Tile layer "${layerName}" not found`);
  if (layer.compression)
    throw new Error(`Compressed tile layers are not supported (${layer.compression})`);

  const count = map.width * map.height;
  const gids = new Uint32Array(count);
  const { data } = layer;

  if (typeof data === 'string') {
    if (layer.encoding !== 'base64')
      throw new Error(`Unsupported tile layer encoding "${layer.encoding}"`);
    const bytes = decodeBase64(data);
    if (bytes.length < count * 4) throw new Error(`Tile layer "${layerName}" has too little data`);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 0; i < count; i++) gids[i] = view.getUint32(i * 4, true) & GID_MASK;
  } else {
    if (data.length < count) throw new Error(`Tile layer "${layerName}" has too little data`);
    for (let i = 0; i < count; i++) gids[i] = (data[i] ?? 0) & GID_MASK;
  }
  return gids;
}
