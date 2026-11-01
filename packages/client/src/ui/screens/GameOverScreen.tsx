import { t } from '../../i18n/index.ts';
import { useUi } from '../UiStoreContext.tsx';

export function GameOverScreen() {
  const result = useUi((s) => s.result);
  if (!result) return null;
  return (
    <div className="screen screen--menu">
      <p className={`game-over game-over--${result}`}>{t(`result.${result}`)}</p>
    </div>
  );
}
