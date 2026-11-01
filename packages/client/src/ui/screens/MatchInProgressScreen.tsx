import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../../i18n/index.ts';

/**
 * Shown to a visitor who arrives while a match is running. The game never starts for them, so it
 * covers the whole window (portalled to <body>) instead of only the game area.
 */
export function MatchInProgressScreen() {
  useEffect(() => {
    document.title = t('matchInProgress.title');
  }, []);
  return createPortal(
    <div className="match-in-progress">
      <h1 className="match-in-progress__title">
        <span>{t('menu.titleTop')}</span>
        <span>{t('menu.titleBottom')}</span>
      </h1>
      <p className="match-in-progress__heading">{t('matchInProgress.heading')}</p>
      <p>{t('matchInProgress.body')}</p>
    </div>,
    document.body,
  );
}
