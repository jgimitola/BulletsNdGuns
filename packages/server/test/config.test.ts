import { describe, expect, test } from 'vitest';
import { loadConfig } from '../src/config.ts';

const DEV = { NODE_ENV: 'development' };
const PROD = {
  NODE_ENV: 'production',
  BETTER_AUTH_SECRET: 's'.repeat(40),
  BETTER_AUTH_URL: 'https://bng.example.com',
};

describe('loadConfig', () => {
  test('has local defaults in development', () => {
    const config = loadConfig(DEV);
    expect(config.port).toBe(3000);
    expect(config.databasePath).toMatch(/data[\\/]bng\.sqlite$/);
    expect(config.authUrl).toBe('http://localhost:3000');
    expect(config.trustedOrigins).toEqual(['http://localhost:5173']);
    expect(config.authSecret.length).toBeGreaterThanOrEqual(32);
    expect(config.trustProxy).toBe(false);
    expect(config.realIpHeader).toBeNull();
    expect(config.authRateLimit).toBe(false);
  });

  test('takes the auth URL from the port when none is given', () => {
    expect(loadConfig({ ...DEV, PORT: '4000' }).authUrl).toBe('http://localhost:4000');
  });

  test('the dev secret is only used when NODE_ENV says development', () => {
    // `npm start` sets no NODE_ENV: that must not fall back to the secret committed in the repo.
    expect(() => loadConfig({})).toThrow(/BETTER_AUTH_SECRET/);
    expect(() => loadConfig({ NODE_ENV: 'test' })).toThrow(/BETTER_AUTH_SECRET/);
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/BETTER_AUTH_SECRET/);
  });

  test('production needs the public URL', () => {
    expect(() => loadConfig({ ...PROD, BETTER_AUTH_URL: '' })).toThrow(/BETTER_AUTH_URL/);
  });

  test('reads production settings from env', () => {
    const config = loadConfig({
      ...PROD,
      DATABASE_PATH: '/data/bng.sqlite',
      TRUSTED_ORIGINS: 'https://a.com, https://b.com',
      TRUST_PROXY: '1',
    });
    expect(config).toMatchObject({
      authSecret: 's'.repeat(40),
      authUrl: 'https://bng.example.com',
      databasePath: '/data/bng.sqlite',
      trustedOrigins: ['https://a.com', 'https://b.com'],
      trustProxy: 1,
    });
  });

  test('trusts no extra origins and limits auth requests in production', () => {
    expect(loadConfig(PROD).trustedOrigins).toEqual([]);
    expect(loadConfig(PROD).authRateLimit).toBe(true);
  });

  test('TRUST_PROXY takes a hop count or true/false', () => {
    expect(loadConfig({ ...DEV, TRUST_PROXY: 'true' }).trustProxy).toBe(true);
    expect(loadConfig({ ...DEV, TRUST_PROXY: 'false' }).trustProxy).toBe(false);
    expect(loadConfig({ ...DEV, TRUST_PROXY: '2' }).trustProxy).toBe(2);
  });

  test('REAL_IP_HEADER names the header a proxy puts the player address in', () => {
    expect(loadConfig({ ...DEV, REAL_IP_HEADER: ' X-Real-IP ' }).realIpHeader).toBe('x-real-ip');
    expect(loadConfig({ ...DEV, REAL_IP_HEADER: '' }).realIpHeader).toBeNull();
    expect(() => loadConfig({ ...DEV, REAL_IP_HEADER: 'x real ip' })).toThrow(/REAL_IP_HEADER/);
  });
});
