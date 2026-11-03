import { useEffect, useState, type ReactElement } from 'react';
import { t } from '../../i18n/index.ts';
import { AuthErrorMessage } from '../AuthErrorMessage.tsx';
import { PixelDialog } from '../PixelDialog.tsx';
import { useUi, useUiStore } from '../UiStoreContext.tsx';

export function SignInDialog({ trigger }: { trigger: ReactElement }) {
  return (
    <PixelDialog trigger={trigger} title={t('signIn.title')}>
      <SignInForm />
    </PixelDialog>
  );
}

/** Mounted each time the dialog opens. Success reloads the page signed in. */
function SignInForm() {
  const store = useUiStore();
  const pending = useUi((s) => s.authPending);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  useEffect(() => store.getState().clearAuthError(), [store]);
  return (
    <form
      className="auth-form"
      onSubmit={(event) => {
        event.preventDefault();
        void store.getState().signIn(email.trim(), password);
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
      <label className="field">
        <span className="field__label">{t('signIn.password')}</span>
        <input
          className="pixel-input pixel-input--wide"
          type="password"
          value={password}
          autoComplete="current-password"
          required
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <AuthErrorMessage />
      <button
        type="submit"
        className="pixel-button pixel-button--primary"
        disabled={pending || email.trim() === '' || password === ''}
      >
        {t('signIn.submit')}
      </button>
    </form>
  );
}
