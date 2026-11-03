import { expect, test } from 'vitest';
import { updatedLabel } from '../src/ui/level-picker/updated-label.ts';

const now = Date.UTC(2026, 10, 3, 12);
const daysAgo = (days: number) => new Date(now - days * 86_400_000).toISOString();

test('says today, yesterday or how many days ago', () => {
  expect(updatedLabel(daysAgo(0), now, 'en')).toBe('today');
  expect(updatedLabel(daysAgo(1), now, 'en')).toBe('yesterday');
  expect(updatedLabel(daysAgo(2), now, 'en')).toBe('2 days ago');
  expect(updatedLabel(daysAgo(2), now, 'es')).toBe('anteayer');
  expect(updatedLabel(daysAgo(3), now, 'es')).toBe('hace 3 días');
});
