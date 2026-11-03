import { describe, expect, test } from 'vitest';
import { loadConfig } from '../src/config.ts';

describe('loadConfig', () => {
  test('has local defaults outside production', () => {
    const config = loadConfig({});
    expect(config.port).toBe(3000);
    expect(config.databasePath).toMatch(/data[\\/]bng\.sqlite$/);
    expect(config.authUrl).toBe('http://localhost:3000');
    expect(config.trustedOrigins).toEqual(['http://localhost:5173']);
    expect(config.authSecret.length).toBeGreaterThanOrEqual(32);
  });

  test('takes the auth URL from the port when none is given', () => {
    expect(loadConfig({ PORT: '4000' }).authUrl).toBe('http://localhost:4000');
  });

  test('refuses to start in production without a secret', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/BETTER_AUTH_SECRET/);
  });

  test('reads production settings from env', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      BETTER_AUTH_SECRET: 's'.repeat(40),
      BETTER_AUTH_URL: 'https://bng.example.com',
      DATABASE_PATH: '/data/bng.sqlite',
      TRUSTED_ORIGINS: 'https://a.com, https://b.com',
    });
    expect(config).toMatchObject({
      authSecret: 's'.repeat(40),
      authUrl: 'https://bng.example.com',
      databasePath: '/data/bng.sqlite',
      trustedOrigins: ['https://a.com', 'https://b.com'],
    });
  });

  test('trusts no extra origins in production by default', () => {
    const config = loadConfig({ NODE_ENV: 'production', BETTER_AUTH_SECRET: 's'.repeat(40) });
    expect(config.trustedOrigins).toEqual([]);
  });
});
