import { useEffect } from 'react';
import { parseNickname } from '@bng/shared';
import { t } from '../../i18n/index.ts';
import { NicknameErrorMessage } from '../AuthErrorMessage.tsx';
import { CreditsDialog } from '../dialogs/CreditsDialog.tsx';
import { HowToPlayDialog } from '../dialogs/HowToPlayDialog.tsx';
import { ProfileDialog } from '../dialogs/ProfileDialog.tsx';
import { RegisterDialog } from '../dialogs/RegisterDialog.tsx';
import { SignInDialog } from '../dialogs/SignInDialog.tsx';
import { playHoverSound } from '../hover-sound.ts';
import { LanguageToggle } from '../LanguageToggle.tsx';
import { NicknameField } from '../NicknameField.tsx';
import type { Account } from '../store.ts';
import { useUi, useUiStore } from '../UiStoreContext.tsx';
import { loadRoomsScreen } from './lazy-screens.ts';

export function MenuScreen() {
  const account = useUi((s) => s.account);
  // The room list is the next screen: fetch its chunk now so JUGAR opens it without a wait.
  useEffect(() => {
    void loadRoomsScreen();
  }, []);
  return (
    <div className="screen screen--menu screen--above-strip interactive">
      <div className="brick-strip" />
      <LanguageToggle className="menu__language" />
      <CreditsDialog
        trigger={
          <button
            type="button"
            className="pixel-button menu__credits"
            aria-label={t('menu.credits')}
          >
            ?
          </button>
        }
      />
      <h1 className="menu__title">
        <span>{t('menu.titleTop')}</span>
        <span>{t('menu.titleBottom')}</span>
      </h1>
      {account ? <SignedInMenu account={account} /> : <GuestMenu />}
      <HowToPlayDialog
        trigger={
          <button type="button" className="pixel-button" onPointerEnter={playHoverSound}>
            {t('menu.howToPlay')}
          </button>
        }
      />
    </div>
  );
}

function SignedInMenu({ account }: { account: Account }) {
  const store = useUiStore();
  return (
    <>
      <p className="menu__greeting">{t('menu.greeting', { nickname: account.nickname })}</p>
      <button
        type="button"
        className="pixel-button pixel-button--primary"
        onPointerEnter={playHoverSound}
        onClick={() => void store.getState().openRooms()}
      >
        {t('menu.play')}
      </button>
      <ProfileDialog
        trigger={
          <button type="button" className="pixel-button" onPointerEnter={playHoverSound}>
            {t('menu.profile')}
          </button>
        }
      />
    </>
  );
}

function GuestMenu() {
  const store = useUiStore();
  const nickname = useUi((s) => s.nickname);
  return (
    <>
      <div className="menu__account">
        <SignInDialog
          trigger={
            <button
              type="button"
              className="pixel-button pixel-button--small"
              onPointerEnter={playHoverSound}
            >
              {t('menu.signIn')}
            </button>
          }
        />
        <RegisterDialog
          trigger={
            <button
              type="button"
              className="pixel-button pixel-button--small"
              onPointerEnter={playHoverSound}
            >
              {t('menu.register')}
            </button>
          }
        />
      </div>
      <form
        className="menu__form"
        onSubmit={(event) => {
          event.preventDefault();
          void store.getState().openRooms();
        }}
      >
        <NicknameField
          label={t('menu.nickname')}
          value={nickname}
          onChange={(value) => store.getState().setNickname(value)}
        />
        <NicknameErrorMessage />
        <button
          type="submit"
          className="pixel-button pixel-button--primary"
          disabled={parseNickname(nickname) === null}
          onPointerEnter={playHoverSound}
        >
          {t('menu.playAsGuest')}
        </button>
      </form>
    </>
  );
}
