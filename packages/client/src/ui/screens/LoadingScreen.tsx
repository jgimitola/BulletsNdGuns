import { t } from '../../i18n/index.ts';
import { useUi } from '../UiStoreContext.tsx';

export function LoadingScreen() {
  const progress = useUi((s) => s.loading.progress);
  const file = useUi((s) => s.loading.file);
  const percent = Math.trunc(progress * 100);
  return (
    <div className="screen screen--menu loading">
      <p>{t('loader.loading')}</p>
      <div
        className="loading__bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className="loading__fill" style={{ width: `${percent}%` }} />
      </div>
      <p>{percent}%</p>
      <p className="loading__file">{file ? t('loader.asset', { key: file }) : ' '}</p>
    </div>
  );
}
