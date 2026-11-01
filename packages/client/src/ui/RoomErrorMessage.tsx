import { t } from '../i18n/index.ts';
import { useUi } from './UiStoreContext.tsx';

/** Why the last create/join failed, if it did. */
export function RoomErrorMessage() {
  const error = useUi((s) => s.roomError);
  return (
    <p className="room-error" role="alert">
      {error ? t(`roomError.${error}`) : ''}
    </p>
  );
}
