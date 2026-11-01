import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, constants, gzip } from 'node:zlib';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const brotli = promisify(brotliCompress);
const gzipAsync = promisify(gzip);

/** Text formats only: images, audio and woff2 are already compressed (and audio uses Range requests). */
const COMPRESSIBLE = /\.(js|css|html|json|svg)$/;
/** Below this the headers outweigh the saving. */
const MIN_BYTES = 1024;

async function* filesIn(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* filesIn(path);
    else yield path;
  }
}

/**
 * Writes `.br` and `.gz` next to every compressible file in the build output (public files
 * included), so the server can send them without compressing on each request.
 */
function precompress(): Plugin {
  let outDir = 'dist';
  return {
    name: 'bng:precompress',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    async closeBundle() {
      for await (const file of filesIn(outDir)) {
        if (!COMPRESSIBLE.test(file) || (await stat(file)).size < MIN_BYTES) continue;
        const source = await readFile(file);
        const [br, gz] = await Promise.all([
          brotli(source, {
            params: {
              [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
              [constants.BROTLI_PARAM_SIZE_HINT]: source.length,
            },
          }),
          gzipAsync(source, { level: constants.Z_BEST_COMPRESSION }),
        ]);
        // Only keep a variant that is meaningfully smaller than the original.
        if (br.length < source.length * 0.9) await writeFile(`${file}.br`, br);
        if (gz.length < source.length * 0.9) await writeFile(`${file}.gz`, gz);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), precompress()],
  build: {
    // Phaser alone is about 1.35 MB minified and cannot be split further.
    chunkSizeWarningLimit: 1400,
    rolldownOptions: {
      output: {
        // Libraries in their own chunks: a deploy that only changes game code leaves them cached.
        // Phaser and TanStack Query are only reached through dynamic imports, so they stay lazy.
        codeSplitting: {
          groups: [
            { name: 'phaser', test: /[\\/]node_modules[\\/]phaser[\\/]/, priority: 3 },
            {
              name: 'react',
              test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 2,
            },
            {
              name: 'vendor',
              test: /[\\/]node_modules[\\/](?!phaser[\\/]|@tanstack[\\/])/,
              priority: 1,
            },
          ],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/socket.io': { target: 'http://localhost:3000', ws: true },
      '/api': 'http://localhost:3000',
    },
  },
});
