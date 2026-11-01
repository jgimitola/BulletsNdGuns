import { t } from '../../i18n/index.ts';
import { CreditsDialog } from '../dialogs/CreditsDialog.tsx';
import { HowToPlayDialog } from '../dialogs/HowToPlayDialog.tsx';
import { playHoverSound } from '../hover-sound.ts';
import { useUi, useUiStore } from '../UiStoreContext.tsx';

export function MenuScreen() {
  const store = useUiStore();
  const waiting = useUi((s) => s.waiting);
  return (
    <div className="screen screen--menu interactive">
      <div className="brick-strip" />
      <CreditsDialog
        returnFocus={!waiting}
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
      {waiting ? (
        // Not a button: once clicked there is nothing left to press, and SPACE must reach the game.
        <div className="pixel-button pixel-button--static blink" role="status">
          {t('menu.waiting')}
        </div>
      ) : (
        <button
          type="button"
          className="pixel-button pixel-button--primary"
          onPointerEnter={playHoverSound}
          onClick={() => store.getState().ready()}
        >
          {t('menu.play')}
        </button>
      )}
      <HowToPlayDialog
        // While waiting, a focused trigger would reopen the dialog on SPACE instead of doing nothing.
        returnFocus={!waiting}
        trigger={
          <button type="button" className="pixel-button" onPointerEnter={playHoverSound}>
            {t('menu.howToPlay')}
          </button>
        }
      />
    </div>
  );
}
