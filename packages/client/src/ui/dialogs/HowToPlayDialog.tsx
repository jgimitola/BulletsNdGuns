import type { ReactElement } from 'react';
import { t, type TranslationKey } from '../../i18n/index.ts';
import { PixelDialog } from '../PixelDialog.tsx';
import { RichText } from '../RichText.tsx';

const LINES: TranslationKey[] = [
  'howToPlay.move',
  'howToPlay.shoot',
  'howToPlay.enemies',
  'howToPlay.coins',
];

export function HowToPlayDialog({
  trigger,
  returnFocus,
}: {
  trigger: ReactElement;
  returnFocus?: boolean;
}) {
  return (
    <PixelDialog trigger={trigger} title={t('howToPlay.title')} returnFocus={returnFocus}>
      {LINES.map((key) => (
        <p key={key}>
          <RichText text={t(key)} />
        </p>
      ))}
    </PixelDialog>
  );
}
