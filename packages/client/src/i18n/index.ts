import { es } from './locales/es.ts';

export type Locale = 'es';
export type TranslationKey = keyof typeof es;

const locales: Record<Locale, Record<TranslationKey, string>> = { es };
const currentLocale: Locale = 'es';

export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  const template = locales[currentLocale][key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

export function localizedAsset(file: string): string {
  return `assets/locales/${currentLocale}/${file}`;
}
