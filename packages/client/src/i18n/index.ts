import { en } from './locales/en.ts';
import { es } from './locales/es.ts';

export const LOCALES = ['es', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export type TranslationKey = keyof typeof es;

const DEFAULT_LOCALE: Locale = 'es';
const locales: Record<Locale, Record<TranslationKey, string>> = { es, en };
let currentLocale: Locale = DEFAULT_LOCALE;

export function isLocale(value: unknown): value is Locale {
  return (LOCALES as readonly unknown[]).includes(value);
}

/**
 * The saved choice if there is one, otherwise the first browser language we have (`en-GB` counts
 * as `en`), otherwise Spanish.
 */
export function detectLocale(saved: string | null, browserLanguages: readonly string[]): Locale {
  if (isLocale(saved)) return saved;
  for (const language of browserLanguages) {
    const base = language.toLowerCase().split('-')[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

export function getLocale(): Locale {
  return currentLocale;
}

/** Later `t` calls use this locale. Screens re-render through the UI store's `locale`. */
export function setLocale(locale: Locale): void {
  currentLocale = locale;
}

export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  const template = locales[currentLocale][key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}
