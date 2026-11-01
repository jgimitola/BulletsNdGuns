/** Styles a locale string may apply to a word, written as `<tag>word</tag>`. */
export type RichTag = 'key' | 'red' | 'gold' | 'name' | 'tool';

export interface RichSegment {
  text: string;
  tag?: RichTag;
}

const TAGGED = /<(key|red|gold|name|tool)>([^<]*)<\/\1>/g;

/**
 * Splits a locale string into plain and tagged segments. Only known tags without nesting count;
 * anything else stays as plain text, so a typo shows up on screen instead of becoming markup.
 */
export function parseRichText(text: string): RichSegment[] {
  const segments: RichSegment[] = [];
  let plainStart = 0;
  for (const match of text.matchAll(TAGGED)) {
    if (match.index > plainStart) segments.push({ text: text.slice(plainStart, match.index) });
    segments.push({ text: match[2] ?? '', tag: match[1] as RichTag });
    plainStart = match.index + match[0].length;
  }
  if (plainStart < text.length || segments.length === 0) {
    segments.push({ text: text.slice(plainStart) });
  }
  return segments;
}
