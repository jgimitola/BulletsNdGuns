import { readdirSync, type Dirent } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import type { RequestHandler } from 'express';

/** Preferred first when the browser accepts both. */
const ENCODINGS = [
  { name: 'br', suffix: '.br' },
  { name: 'gzip', suffix: '.gz' },
] as const;

type Encoding = (typeof ENCODINGS)[number]['name'];

/** URL path of every file that has compressed copies, mapped to the encodings available. */
function scan(root: string): Map<string, Set<Encoding>> {
  const variants = new Map<string, Set<Encoding>>();
  const walk = (dir: string): void => {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // No client build: nothing to serve compressed.
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      const encoding = ENCODINGS.find((e) => entry.name.endsWith(e.suffix));
      if (!encoding) continue;
      const original = path.slice(0, -encoding.suffix.length);
      const urlPath = '/' + relative(root, original).split(sep).join('/');
      let set = variants.get(urlPath);
      if (!set) variants.set(urlPath, (set = new Set()));
      set.add(encoding.name);
    }
  };
  walk(root);
  return variants;
}

/**
 * Serves the `.br` / `.gz` copies the client build writes next to its files, when the browser
 * accepts them. Anything else falls through to `express.static`. Only files found under `root` at
 * startup are ever served, so the request path is never joined into a file path unchecked.
 */
export function precompressed(root: string): RequestHandler {
  const variants = scan(root);
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const urlPath = req.path === '/' ? '/index.html' : req.path;
    const available = variants.get(urlPath);
    if (!available) return next();
    res.vary('Accept-Encoding');
    // A byte range of a compressed body confuses some clients; send the original instead.
    if (req.headers.range) return next();
    // Our preference, not the header's order: browsers list `gzip, deflate, br` with equal weight.
    const chosen = ENCODINGS.find((e) => available.has(e.name) && req.acceptsEncodings(e.name));
    if (!chosen) return next();
    const { name: encoding, suffix } = chosen;
    res.set('Content-Encoding', encoding);
    // Typed from the original name; `send` keeps a Content-Type that is already set.
    res.type(extname(urlPath));
    res.sendFile(urlPath.slice(1) + suffix, { root }, (err) => {
      if (!err || res.headersSent) return;
      // Deleted since startup: fall back to the uncompressed file.
      res.removeHeader('Content-Encoding');
      res.removeHeader('Content-Type');
      next();
    });
  };
}
