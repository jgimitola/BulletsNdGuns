import { useEffect, useState, type ReactElement } from 'react';
import { parseNickname } from '@bng/shared';
import { t } from '../../i18n/index.ts';
import { AuthErrorMessage } from '../AuthErrorMessage.tsx';
import { NicknameField } from '../NicknameField.tsx';
import { PixelDialog } from '../PixelDialog.tsx';
import { useUi, useUiStore } from '../UiStoreContext.tsx';

const MIN_PASSWORD_LENGTH = 8;

export function ProfileDialog({ trigger }: { trigger: ReactElement }) {
  return (
    <PixelDialog trigger={trigger} title={t('profile.title')}>
      <Profile />
    </PixelDialog>
  );
}

/** Mounted each time the dialog opens. One error line serves both forms: the last one sent. */
function Profile() {
  const store = useUiStore();
  const account = useUi((s) => s.account);
  const pending = useUi((s) => s.authPending);
  const [nickname, setNickname] = useState(() => account?.nickname ?? '');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [notice, setNotice] = useState<'nicknameSaved' | 'passwordChanged' | null>(null);
  useEffect(() => store.getState().clearAuthError(), [store]);
  if (!account) return null;
  const nicknameChanged = parseNickname(nickname) !== null && nickname.trim() !== account.nickname;
  const passwordReady = current !== '' && next.length >= MIN_PASSWORD_LENGTH;
  return (
    <div className="profile">
      <p className="profile__email">
        <span className="field__label">{t('profile.email')}</span> {account.email}
      </p>
      <div className="profile__forms">
        <form
          className="profile__section"
          onSubmit={(event) => {
            event.preventDefault();
            setNotice(null);
            if (!nicknameChanged) return;
            void store
              .getState()
              .renameAccount(nickname)
              .then((ok) => ok && setNotice('nicknameSaved'));
          }}
        >
          <NicknameField label={t('profile.nickname')} value={nickname} onChange={setNickname} />
          <button
            type="submit"
            className="pixel-button pixel-button--small"
            disabled={!nicknameChanged || pending}
          >
            {t('profile.saveNickname')}
          </button>
        </form>
        <form
          className="profile__section"
          onSubmit={(event) => {
            event.preventDefault();
            setNotice(null);
            if (!passwordReady) return;
            void store
              .getState()
              .changePassword(current, next)
              .then((ok) => {
                if (!ok) return;
                setCurrent('');
                setNext('');
                setNotice('passwordChanged');
              });
          }}
        >
          {/* Lets password managers pair the new password with this account. */}
          <input type="email" autoComplete="username" value={account.email} readOnly hidden />
          <label className="field">
            <span className="field__label">{t('profile.currentPassword')}</span>
            <input
              className="pixel-input"
              type="password"
              value={current}
              autoComplete="current-password"
              onChange={(event) => setCurrent(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field__label">{t('profile.newPassword')}</span>
            <input
              className="pixel-input"
              type="password"
              value={next}
              autoComplete="new-password"
              onChange={(event) => setNext(event.target.value)}
            />
            <span className="field__hint">
              {t('register.passwordHint', { min: MIN_PASSWORD_LENGTH })}
            </span>
          </label>
          <button
            type="submit"
            className="pixel-button pixel-button--small"
            disabled={!passwordReady || pending}
          >
            {t('profile.changePassword')}
          </button>
        </form>
      </div>
      {notice && (
        <p className="profile__notice" role="status">
          {t(`profile.${notice}`)}
        </p>
      )}
      <AuthErrorMessage />
      <button
        type="button"
        className="pixel-button"
        disabled={pending}
        onClick={() => void store.getState().signOut()}
      >
        {t('profile.signOut')}
      </button>
    </div>
  );
}
