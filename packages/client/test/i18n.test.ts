import { describe, expect, it } from 'vitest';
import { t } from '../src/i18n/index.ts';
import { es } from '../src/i18n/locales/es.ts';

describe('i18n', () => {
  it('interpolates params', () => {
    expect(t('hud.ammo', { count: 2 })).toBe('Munición: 2');
  });

  it('returns text without params untouched', () => {
    expect(t('result.win')).toBe('GANASTE');
  });

  it('has a non-empty string for every key', () => {
    for (const value of Object.values(es)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });
});
