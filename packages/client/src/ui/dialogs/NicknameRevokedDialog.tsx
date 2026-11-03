import { Dialog } from 'radix-ui';
import { parseNickname } from '@bng/shared';
import { t } from '../../i18n/index.ts';
import { NicknameErrorMessage } from '../AuthErrorMessage.tsx';
import { NicknameField } from '../NicknameField.tsx';
import { useUi, useUiStore } from '../UiStoreContext.tsx';

/**
 * A registered player took this guest's nickname. It stays open, with no way to dismiss it, until
 * the guest claims another; the screen underneath (menu, rooms, lobby, result) stays as it was.
 */
export function NicknameRevokedDialog({ nickname }: { nickname: string }) {
  const store = useUiStore();
  const field = useUi((s) => s.nickname);
  return (
    <Dialog.Root open>
      <Dialog.Portal container={document.getElementById('ui')}>
        <Dialog.Overlay className="dialog__overlay interactive" />
        <Dialog.Content
          className="dialog pixel-panel interactive"
          aria-describedby="nickname-revoked-text"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <Dialog.Title className="dialog__title">{t('nicknameRevoked.title')}</Dialog.Title>
          <form
            className="dialog__body auth-form"
            onSubmit={(event) => {
              event.preventDefault();
              void store.getState().reclaimNickname();
            }}
          >
            <p id="nickname-revoked-text">{t('nicknameRevoked.text', { nickname })}</p>
            <NicknameField
              label={t('menu.nickname')}
              value={field}
              onChange={(value) => store.getState().setNickname(value)}
              autoFocus
            />
            <NicknameErrorMessage />
            <button
              type="submit"
              className="pixel-button pixel-button--primary"
              disabled={parseNickname(field) === null}
            >
              {t('nicknameRevoked.submit')}
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
