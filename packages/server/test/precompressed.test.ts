import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createApp } from '../src/http/create-app.ts';

const SCRIPT = 'console.log("bullets and guns");'.repeat(100);
const STYLE = 'body{color:red}'.repeat(100);

let dist: string;
let server: Server;
let port: number;

interface Raw {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

/** node:http, not fetch, so the body arrives exactly as sent (fetch would decode it). */
function get(path: string, headers: Record<string, string> = {}): Promise<Raw> {
  return new Promise((resolve, reject) => {
    const req = request({ port, path, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () =>
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }),
      );
    });
    req.on('error', reject);
    req.end();
  });
}

beforeAll(async () => {
  dist = mkdtempSync(join(tmpdir(), 'bng-dist-'));
  mkdirSync(join(dist, 'assets'));
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>x</title>');
  writeFileSync(join(dist, 'assets', 'app.js'), SCRIPT);
  writeFileSync(join(dist, 'assets', 'app.js.br'), brotliCompressSync(SCRIPT));
  writeFileSync(join(dist, 'assets', 'app.js.gz'), gzipSync(SCRIPT));
  // Only a gzip copy, to check that br is not offered when it does not exist.
  writeFileSync(join(dist, 'assets', 'style.css'), STYLE);
  writeFileSync(join(dist, 'assets', 'style.css.gz'), gzipSync(STYLE));
  server = createServer(
    createApp(
      { clientDist: dist, trustProxy: false },
      {
        listRooms: () => [],
        authHandler: (_req, res) => res.end(),
        levelsRouter: (_req, res) => res.end(),
      },
    ),
  );
  await new Promise<void>((resolve) => server.listen(0, resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(dist, { recursive: true, force: true });
});

describe('precompressed static files', () => {
  test('brotli is preferred when accepted', async () => {
    const res = await get('/assets/app.js', { 'Accept-Encoding': 'gzip, deflate, br' });
    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBe('br');
    expect(res.headers['content-type']).toMatch(/javascript/);
    expect(res.headers['vary']).toMatch(/Accept-Encoding/);
    expect(res.body.equals(brotliCompressSync(SCRIPT))).toBe(true);
  });

  test('gzip when brotli is not accepted', async () => {
    const res = await get('/assets/app.js', { 'Accept-Encoding': 'gzip' });
    expect(res.headers['content-encoding']).toBe('gzip');
    expect(res.body.equals(gzipSync(SCRIPT))).toBe(true);
  });

  test('only encodings that exist on disk are offered', async () => {
    const res = await get('/assets/style.css', { 'Accept-Encoding': 'br, gzip' });
    expect(res.headers['content-encoding']).toBe('gzip');
    expect(res.headers['content-type']).toMatch(/text\/css/);
  });

  test('the original when nothing compressed is accepted', async () => {
    const res = await get('/assets/app.js', { 'Accept-Encoding': 'identity' });
    expect(res.headers['content-encoding']).toBeUndefined();
    expect(res.headers['vary']).toMatch(/Accept-Encoding/);
    expect(res.body.toString()).toBe(SCRIPT);
  });

  test('the original for range requests', async () => {
    const res = await get('/assets/app.js', { 'Accept-Encoding': 'br', Range: 'bytes=0-6' });
    expect(res.status).toBe(206);
    expect(res.headers['content-encoding']).toBeUndefined();
    expect(res.body.toString()).toBe('console');
  });

  test('files without compressed copies are served as before', async () => {
    const res = await get('/', { 'Accept-Encoding': 'br, gzip' });
    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBeUndefined();
    expect(res.body.toString()).toContain('<title>x</title>');
  });

  test('paths outside the build are never resolved', async () => {
    const res = await get('/assets/../../app.js', { 'Accept-Encoding': 'br' });
    expect(res.headers['content-encoding']).toBeUndefined();
  });
});
