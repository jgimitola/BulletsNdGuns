import { useId, useState } from 'react';
import { Dialog } from 'radix-ui';
import { LEVEL_NAME_MAX_LENGTH, levelNameSchema } from '@bng/shared';
import { t } from '../../i18n/index.ts';
import { ConfirmDialog } from '../ConfirmDialog.tsx';
import type { EditorDialog } from './EditorToolbar.tsx';

/** Rename, delete and leave: the editor's questions, one open at a time. */
export function EditorDialogs({
  open,
  name,
  onClose,
  onRename,
  onDelete,
  onLeave,
}: {
  open: EditorDialog;
  name: string;
  onClose(): void;
  onRename(name: string): void;
  onDelete(): void;
  onLeave(): void;
}) {
  return (
    <>
      {open === 'rename' && <RenameDialog name={name} onClose={onClose} onRename={onRename} />}
      <ConfirmDialog
        open={open === 'delete'}
        title={t('editor.deleteTitle')}
        text={t('editor.deleteText', { name })}
        confirm={t('editor.deleteSubmit')}
        cancel={t('editor.cancel')}
        onConfirm={onDelete}
        onCancel={onClose}
      />
      <ConfirmDialog
        open={open === 'leave'}
        title={t('editor.leaveTitle')}
        text={t('editor.leaveText')}
        confirm={t('editor.leave')}
        cancel={t('editor.stay')}
        onConfirm={onLeave}
        onCancel={onClose}
      />
    </>
  );
}

function RenameDialog({
  name,
  onClose,
  onRename,
}: {
  name: string;
  onClose(): void;
  onRename(name: string): void;
}) {
  const [value, setValue] = useState(name);
  const hintId = useId();
  const valid = levelNameSchema.safeParse(value).success;
  return (
    <Dialog.Root
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal container={document.getElementById('ui')}>
        <Dialog.Overlay className="dialog__overlay interactive" />
        <Dialog.Content className="dialog pixel-panel interactive" aria-describedby={undefined}>
          <Dialog.Title className="dialog__title">{t('editor.renameTitle')}</Dialog.Title>
          <form
            className="dialog__body"
            onSubmit={(event) => {
              event.preventDefault();
              if (!valid) return;
              onRename(value);
              onClose();
            }}
          >
            <label className="field">
              <span className="field__label">{t('editor.name')}</span>
              <input
                className="pixel-input pixel-input--wide"
                value={value}
                // Room for surrounding spaces, which are trimmed; the schema checks the length.
                maxLength={LEVEL_NAME_MAX_LENGTH + 8}
                spellCheck={false}
                autoFocus
                aria-invalid={!valid}
                aria-describedby={hintId}
                onChange={(event) => setValue(event.target.value)}
              />
              <span id={hintId} className="field__hint">
                {t('editor.nameHint', { max: LEVEL_NAME_MAX_LENGTH })}
              </span>
            </label>
            <div className="dialog__actions">
              <button type="button" className="pixel-button" onClick={onClose}>
                {t('editor.cancel')}
              </button>
              <button
                type="submit"
                className="pixel-button pixel-button--primary"
                disabled={!valid}
              >
                {t('editor.renameSubmit')}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
