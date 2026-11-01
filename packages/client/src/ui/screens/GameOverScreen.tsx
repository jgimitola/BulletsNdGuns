import { t } from '../../i18n/index.ts';
import { playHoverSound } from '../hover-sound.ts';
import { useUi, useUiStore } from '../UiStoreContext.tsx';

export function GameOverScreen() {
  const store = useUiStore();
  const result = useUi((s) => s.result);
  if (!result) return null;
  return (
    <div className="screen screen--menu screen--above-strip interactive">
      <div className="brick-strip" />
      <p className={`game-over game-over--${result.result}`}>{t(`result.${result.result}`)}</p>
      {result.reason === 'rivalsLeft' && (
        <p className="game-over__reason">{t('result.rivalsLeft')}</p>
      )}
      <button
        type="button"
        className="pixel-button pixel-button--primary game-over__back"
        onPointerEnter={playHoverSound}
        onClick={() => store.getState().backToMenu()}
      >
        {t('result.back')}
      </button>
    </div>
  );
}
