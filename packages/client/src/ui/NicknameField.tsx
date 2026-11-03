import { useId } from 'react';
import { NICKNAME_MAX_LENGTH, parseNickname } from '@bng/shared';
import { t } from '../i18n/index.ts';

/** A nickname input with its label and length hint, used wherever a nickname is typed. */
export function NicknameField({
  label,
  value,
  onChange,
  wide = false,
  autoFocus = false,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  wide?: boolean;
  autoFocus?: boolean;
}) {
  const hintId = useId();
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <input
        className={`pixel-input${wide ? ' pixel-input--wide' : ''}`}
        value={value}
        // Room for surrounding spaces, which are trimmed; the length check is parseNickname's.
        maxLength={NICKNAME_MAX_LENGTH + 8}
        autoComplete="nickname"
        spellCheck={false}
        autoFocus={autoFocus}
        aria-invalid={value !== '' && parseNickname(value) === null}
        aria-describedby={hintId}
        onChange={(event) => onChange(event.target.value)}
      />
      <span id={hintId} className="field__hint">
        {t('menu.nicknameHint', { max: NICKNAME_MAX_LENGTH })}
      </span>
    </label>
  );
}
