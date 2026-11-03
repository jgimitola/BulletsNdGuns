import type { ServerConfig } from '../config.ts';

/** Pages allowed to talk to the server: its own public URL, plus any extra trusted origins. */
export function allowedOrigins(
  config: Pick<ServerConfig, 'authUrl' | 'trustedOrigins'>,
): Set<string> {
  return new Set([new URL(config.authUrl).origin, ...config.trustedOrigins]);
}

/**
 * Whether a request may act with the caller's cookies. Browsers always send `Origin` on writes and
 * WebSocket handshakes, so a foreign one means another site is driving the player's browser
 * (cross-site request forgery, WebSocket hijacking). A missing one is a non-browser client, which
 * holds no victim's cookies, so it is let through.
 */
export function isAllowedOrigin(origin: string | undefined, allowed: ReadonlySet<string>): boolean {
  return origin === undefined || allowed.has(origin);
}
