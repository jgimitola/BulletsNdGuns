import { AlertDialog } from 'radix-ui';

/**
 * A yes/no question in the arcade style, opened by its caller. Escape and the cancel button
 * answer no.
 */
export function ConfirmDialog({
  open,
  title,
  text,
  confirm,
  cancel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  text: string;
  confirm: string;
  cancel: string;
  onConfirm(): void;
  onCancel(): void;
}) {
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <AlertDialog.Portal container={document.getElementById('ui')}>
        <AlertDialog.Overlay className="dialog__overlay interactive" />
        <AlertDialog.Content className="dialog pixel-panel interactive">
          <AlertDialog.Title className="dialog__title">{title}</AlertDialog.Title>
          <AlertDialog.Description className="dialog__body">{text}</AlertDialog.Description>
          <div className="dialog__actions">
            <AlertDialog.Cancel className="pixel-button">{cancel}</AlertDialog.Cancel>
            <AlertDialog.Action className="pixel-button pixel-button--danger" onClick={onConfirm}>
              {confirm}
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
