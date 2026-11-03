import { useEffect, useState, type ReactElement } from 'react';
import { parseNickname } from '@bng/shared';
import { t } from '../../i18n/index.ts';
import { AuthErrorMessage } from '../AuthErrorMessage.tsx';
import { NicknameField } from '../NicknameField.tsx';
import { PixelDialog } from '../PixelDialog.tsx';
import { useUi, useUiStore } from '../UiStoreContext.tsx';

/** better-auth's default minimum; the server is what enforces it. */
const MIN_PASSWORD_LENGTH = 8;

export function RegisterDialog({ trigger }: { trigger: ReactElement }) {
  return (
    <PixelDialog trigger={trigger} title={t('register.title')}>
      <RegisterForm />
    </PixelDialog>
  );
}

/** Mounted each time the dialog opens, starting from the menu's nickname. Success reloads the page. */
function RegisterForm() {
  const store = useUiStore();
  const pending = useUi((s) => s.authPending);
  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState(() => store.getState().nickname);
  const [password, setPassword] = useState('');
  useEffect(() => store.getState().clearAuthError(), [store]);
  const valid =
    email.trim() !== '' &&
    parseNickname(nickname) !== null &&
    password.length >= MIN_PASSWORD_LENGTH;
  return (
    <form
      className="auth-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) void store.getState().register(email.trim(), nickname, password);
      }}
    >
      <label className="field">
        <span className="field__label">{t('signIn.email')}</span>
        <input
          className="pixel-input pixel-input--wide"
          type="email"
          value={email}
          autoComplete="email"
          autoFocus
          required
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <NicknameField label={t('menu.nickname')} value={nickname} onChange={setNickname} wide />
      <label className="field">
        <span className="field__label">{t('signIn.password')}</span>
        <input
          className="pixel-input pixel-input--wide"
          type="password"
          value={password}
          autoComplete="new-password"
          required
          aria-describedby="register-password-hint"
          onChange={(event) => setPassword(event.target.value)}
        />
        <span id="register-password-hint" className="field__hint">
          {t('register.passwordHint', { min: MIN_PASSWORD_LENGTH })}
        </span>
      </label>
      <AuthErrorMessage />
      <button
        type="submit"
        className="pixel-button pixel-button--primary"
        disabled={!valid || pending}
      >
        {t('register.submit')}
      </button>
    </form>
  );
}
