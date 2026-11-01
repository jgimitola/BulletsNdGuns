import { t } from '../../i18n/index.ts';

export function ConnectingScreen() {
  return (
    <div className="screen screen--menu">
      <p className="blink">{t('connecting')}</p>
      <div className="brick-strip" />
    </div>
  );
}
