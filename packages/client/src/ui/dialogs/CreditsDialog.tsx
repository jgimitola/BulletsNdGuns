import type { ReactElement } from 'react';
import { t, type TranslationKey } from '../../i18n/index.ts';
import { PixelDialog } from '../PixelDialog.tsx';
import { RichText } from '../RichText.tsx';

const SECTIONS: { heading: TranslationKey; lines: TranslationKey[] }[] = [
  { heading: 'credits.designHeading', lines: ['credits.sprites'] },
  { heading: 'credits.soundsHeading', lines: ['credits.jump', 'credits.shot'] },
  { heading: 'credits.devHeading', lines: ['credits.maps', 'credits.engine'] },
];

export function CreditsDialog({
  trigger,
  returnFocus,
}: {
  trigger: ReactElement;
  returnFocus?: boolean;
}) {
  return (
    <PixelDialog trigger={trigger} title={t('credits.title')} returnFocus={returnFocus}>
      <p>{t('credits.authors')}</p>
      {SECTIONS.map(({ heading, lines }) => (
        <section key={heading}>
          <h3 className="credits__heading">{t(heading)}</h3>
          {lines.map((key) => (
            <p key={key}>
              <RichText text={t(key)} />
            </p>
          ))}
        </section>
      ))}
    </PixelDialog>
  );
}
