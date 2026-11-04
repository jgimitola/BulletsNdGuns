import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, test } from 'vitest';
import { CLIENT_IP_HEADER } from '../src/auth/auth.ts';
import type { ServerConfig } from '../src/config.ts';
import { createApp } from '../src/http/create-app.ts';

let server: Server | undefined;

afterEach(async () => {
  await new Promise((resolve) => server?.close(resolve));
  server = undefined;
});

/** The address better-auth would rate-limit a request under, for the given proxy settings. */
async function rateLimitAddress(
  config: Pick<ServerConfig, 'trustProxy' | 'realIpHeader'>,
  headers: Record<string, string>,
): Promise<string> {
  server = createServer(
    createApp(
      {
        clientDist: 'does-not-exist',
        authUrl: 'http://localhost:3000',
        trustedOrigins: [],
        ...config,
      },
      {
        listRooms: () => [],
        authHandler: (req, res) => {
          res.end(req.headers[CLIENT_IP_HEADER]);
        },
        levelsRouter: (_req, res) => res.end(),
      },
    ),
  );
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  const res = await fetch(`http://localhost:${port}/api/auth/get-session`, { headers });
  return res.text();
}

describe('the address auth rate limits count under', () => {
  test('is the connecting socket when no proxy is trusted, whatever the headers claim', async () => {
    const address = await rateLimitAddress(
      { trustProxy: false, realIpHeader: null },
      { 'x-real-ip': '9.9.9.9', 'x-forwarded-for': '8.8.8.8' },
    );
    expect(address).toMatch(/127\.0\.0\.1|::1/);
  });

  test("comes from the proxy's header when one is configured", async () => {
    const address = await rateLimitAddress(
      { trustProxy: false, realIpHeader: 'x-real-ip' },
      { 'x-real-ip': '9.9.9.9' },
    );
    expect(address).toBe('9.9.9.9');
  });

  test('takes the first address when the header lists several', async () => {
    const address = await rateLimitAddress(
      { trustProxy: false, realIpHeader: 'x-real-ip' },
      { 'x-real-ip': ' 9.9.9.9 , 7.7.7.7' },
    );
    expect(address).toBe('9.9.9.9');
  });

  test('falls back to the connection when the header is missing', async () => {
    const address = await rateLimitAddress({ trustProxy: false, realIpHeader: 'x-real-ip' }, {});
    expect(address).toMatch(/127\.0\.0\.1|::1/);
  });
});
