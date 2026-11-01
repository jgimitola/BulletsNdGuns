import { useEffect } from 'react';
import { NICKNAME_MAX_LENGTH, parseNickname } from '@bng/shared';
import { t } from '../../i18n/index.ts';
import { CreditsDialog } from '../dialogs/CreditsDialog.tsx';
import { HowToPlayDialog } from '../dialogs/HowToPlayDialog.tsx';
import { playHoverSound } from '../hover-sound.ts';
import { LanguageToggle } from '../LanguageToggle.tsx';
import { useUi, useUiStore } from '../UiStoreContext.tsx';
import { loadRoomsScreen } from './lazy-screens.ts';

export function MenuScreen() {
  const store = useUiStore();
  const nickname = useUi((s) => s.nickname);
  const valid = parseNickname(nickname) !== null;
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
      <form
        className="menu__form"
        onSubmit={(event) => {
          event.preventDefault();
          store.getState().openRooms();
        }}
      >
        <label className="field">
          <span className="field__label">{t('menu.nickname')}</span>
          <input
            className="pixel-input"
            value={nickname}
            // Room for surrounding spaces, which are trimmed; the length check is parseNickname's.
            maxLength={NICKNAME_MAX_LENGTH + 8}
            autoComplete="nickname"
            spellCheck={false}
            aria-invalid={nickname !== '' && !valid}
            aria-describedby="nickname-hint"
            onChange={(event) => store.getState().setNickname(event.target.value)}
          />
          <span id="nickname-hint" className="field__hint">
            {t('menu.nicknameHint', { max: NICKNAME_MAX_LENGTH })}
          </span>
        </label>
        <button
          type="submit"
          className="pixel-button pixel-button--primary"
          disabled={!valid}
          onPointerEnter={playHoverSound}
        >
          {t('menu.play')}
        </button>
      </form>
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
