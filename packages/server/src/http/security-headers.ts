import type { RequestHandler } from 'express';

/**
 * The client only loads its own files and talks to its own server. `data:` and `blob:` cover the
 * textures Phaser builds in memory and decoded audio. Styles allow inline because React and Radix
 * set `style` attributes.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/** Half a year, the minimum browsers' HSTS preload lists accept. */
const HSTS_MAX_AGE_SECONDS = 15_552_000;

/**
 * Browser-side protections on every response: no framing (clickjacking), no MIME sniffing, no
 * scripts from anywhere else (limits what an injected tag could do). HSTS only once the public URL
 * is HTTPS: sent over plain HTTP it would lock a local run out of its own server.
 */
export function securityHeaders(publicUrl: string): RequestHandler {
  const https = new URL(publicUrl).protocol === 'https:';
  return (_req, res, next) => {
    res.set({
      'Content-Security-Policy': CONTENT_SECURITY_POLICY,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Resource-Policy': 'same-origin',
      ...(https ? { 'Strict-Transport-Security': `max-age=${HSTS_MAX_AGE_SECONDS}` } : {}),
    });
    next();
  };
}
