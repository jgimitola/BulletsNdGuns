import { Dialog } from 'radix-ui';
import type { ReactElement, ReactNode } from 'react';
import { t } from '../i18n/index.ts';

interface PixelDialogProps {
  /** The button that opens the dialog. */
  trigger: ReactElement;
  title: string;
  children: ReactNode;
}

/**
 * A modal in the arcade style. It portals into #ui rather than <body> so it scales with the game
 * area. Radix closes it on Escape and on a click outside the panel.
 */
export function PixelDialog({ trigger, title, children }: PixelDialogProps) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal container={document.getElementById('ui')}>
        <Dialog.Overlay className="dialog__overlay interactive" />
        <Dialog.Content className="dialog pixel-panel interactive" aria-describedby={undefined}>
          <Dialog.Title className="dialog__title">{title}</Dialog.Title>
          <div className="dialog__body">{children}</div>
          <Dialog.Close className="pixel-button dialog__close">{t('dialog.close')}</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
