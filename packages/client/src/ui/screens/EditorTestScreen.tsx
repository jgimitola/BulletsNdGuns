import { t } from '../../i18n/index.ts';
import { useUi } from '../UiStoreContext.tsx';
import { HudScreen } from './HudScreen.tsx';

/** Test mode's overlay: the HUD counters and a banner with the keys, or the result once done. */
export function EditorTestScreen() {
  const status = useUi((s) => s.testStatus);
  return (
    <>
      <HudScreen />
      <p className={`test-banner${status?.completed ? ' test-banner--done' : ''}`} role="status">
        {status?.completed
          ? t('editorTest.completed', { coins: status.coins, total: status.totalCoins })
          : t('editorTest.banner')}
      </p>
    </>
  );
}
