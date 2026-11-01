import { afterEach, describe, expect, it } from 'vitest';
import { detectLocale, getLocale, LOCALES, setLocale, t } from '../src/i18n/index.ts';
import { en } from '../src/i18n/locales/en.ts';
import { es } from '../src/i18n/locales/es.ts';
import { parseRichText } from '../src/ui/rich-text.ts';

const PLACEHOLDER = /\{(\w+)\}/g;
const tagsOf = (text: string) => parseRichText(text).flatMap((s) => (s.tag ? [s.tag] : []));

afterEach(() => setLocale('es'));

describe('i18n', () => {
  it('interpolates params', () => {
    expect(t('hud.ammo', { count: 2 })).toBe('Munición: 2');
  });

  it('returns text without params untouched', () => {
    expect(t('result.win')).toBe('GANASTE');
  });

  it('switches language with setLocale', () => {
    setLocale('en');
    expect(getLocale()).toBe('en');
    expect(t('result.win')).toBe('YOU WIN');
    expect(t('hud.ammo', { count: 2 })).toBe('Ammo: 2');
  });

  it('has a non-empty string for every key in every locale', () => {
    for (const locale of [es, en]) {
      for (const value of Object.values(locale)) {
        expect(typeof value).toBe('string');
        expect(value.length).toBeGreaterThan(0);
      }
    }
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
  });

  it('keeps the same placeholders and rich text tags in every locale', () => {
    for (const key of Object.keys(es) as (keyof typeof es)[]) {
      expect([...en[key].matchAll(PLACEHOLDER)].map((m) => m[1]).sort(), key).toEqual(
        [...es[key].matchAll(PLACEHOLDER)].map((m) => m[1]).sort(),
      );
      expect(tagsOf(en[key]), key).toEqual(tagsOf(es[key]));
    }
  });
});

describe('detectLocale', () => {
  it('prefers a saved choice', () => {
    expect(detectLocale('en', ['es-CO'])).toBe('en');
    expect(detectLocale('es', ['en-US'])).toBe('es');
  });

  it('falls back to the first supported browser language', () => {
    expect(detectLocale(null, ['fr-FR', 'en-GB', 'es'])).toBe('en');
    expect(detectLocale('xx', ['ES-co'])).toBe('es');
  });

  it('defaults to Spanish', () => {
    expect(detectLocale(null, ['fr', 'de'])).toBe('es');
    expect(detectLocale(null, [])).toBe('es');
  });

  it('only knows the shipped locales', () => {
    expect(LOCALES).toEqual(['es', 'en']);
  });
});
