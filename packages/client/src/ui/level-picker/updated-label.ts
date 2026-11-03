import type { Locale } from '../../i18n/index.ts';

const DAY_MS = 86_400_000;

/** "today", "yesterday", "2 days ago" (or "hace 2 días"), counted in whole days. */
export function updatedLabel(updatedAt: string, now: number, locale: Locale): string {
  const days = Math.floor((now - Date.parse(updatedAt)) / DAY_MS);
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-Math.max(0, days), 'day');
}
