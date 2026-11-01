import { LOCALES, t } from '../i18n/index.ts';
import { playHoverSound } from './hover-sound.ts';
import { useUi, useUiStore } from './UiStoreContext.tsx';

/** ES / EN switch. The pressed button is the current language. */
export function LanguageToggle({ className }: { className?: string }) {
  const store = useUiStore();
  const locale = useUi((s) => s.locale);
  return (
    <div
      className={`language-toggle ${className ?? ''}`}
      role="group"
      aria-label={t('language.label')}
    >
      {LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          lang={code}
          className="pixel-button language-toggle__option"
          title={t(`language.${code}`)}
          aria-pressed={code === locale}
          onPointerEnter={playHoverSound}
          onClick={() => store.getState().setLocale(code)}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
