import { parseRichText } from './rich-text.ts';

/** A locale string with its `<tag>word</tag>` markup rendered as coloured spans. */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {parseRichText(text).map((segment, i) =>
        segment.tag ? (
          <span key={i} className={`rich-${segment.tag}`}>
            {segment.text}
          </span>
        ) : (
          segment.text
        ),
      )}
    </>
  );
}
