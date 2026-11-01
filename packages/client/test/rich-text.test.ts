import { describe, expect, it } from 'vitest';
import { es } from '../src/i18n/locales/es.ts';
import { parseRichText } from '../src/ui/rich-text.ts';

describe('parseRichText', () => {
  it('splits tagged words out of plain text', () => {
    expect(parseRichText('Presione <key>espacio</key> para disparar.')).toEqual([
      { text: 'Presione ' },
      { text: 'espacio', tag: 'key' },
      { text: ' para disparar.' },
    ]);
  });

  it('returns one plain segment when there is no markup', () => {
    expect(parseRichText('CERRAR')).toEqual([{ text: 'CERRAR' }]);
  });

  it('keeps unknown or unclosed tags as plain text', () => {
    expect(parseRichText('a <b>x</b> <key>y')).toEqual([{ text: 'a <b>x</b> <key>y' }]);
  });

  it('every locale string parses cleanly', () => {
    for (const value of Object.values(es)) {
      for (const segment of parseRichText(value)) {
        if (segment.tag === undefined) expect(segment.text).not.toMatch(/<\/?\w+>/);
      }
    }
  });
});
