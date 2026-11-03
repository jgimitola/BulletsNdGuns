import { z } from 'zod';

// C0 and C1 control characters, which would render as nothing or break the layout.
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;
// Direction overrides and marks: they reorder how the rest of a name (or a whole row) is shown.
const BIDI_CONTROLS = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/;
/** Zero-width and other characters that draw nothing (ZWJ inside emoji included). */
export const INVISIBLE = /\p{Default_Ignorable_Code_Point}/gu;

/**
 * A player-typed name (nickname, room, level): trimmed text of 1..maxLength characters, without
 * control or direction characters, and with at least one visible character.
 */
export function labelSchema(maxLength: number) {
  return z
    .string()
    .trim()
    .refine((text) => {
      // Count code points so an emoji is one character, as the player sees it.
      const length = [...text].length;
      const visible = text.replace(INVISIBLE, '').replace(/\s/gu, '');
      return (
        length >= 1 &&
        length <= maxLength &&
        visible !== '' &&
        !CONTROL_CHARS.test(text) &&
        !BIDI_CONTROLS.test(text)
      );
    });
}
