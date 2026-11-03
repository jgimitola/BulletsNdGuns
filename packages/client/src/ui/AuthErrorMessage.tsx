import { t } from '../i18n/index.ts';
import { useUi } from './UiStoreContext.tsx';

/** Why the last account request failed, if it did. */
export function AuthErrorMessage() {
  const error = useUi((s) => s.authError);
  return (
    <p className="room-error" role="alert">
      {error ? t(`authError.${error}`) : ''}
    </p>
  );
}

/** Why the last nickname claim failed, if it did. */
export function NicknameErrorMessage() {
  const error = useUi((s) => s.nicknameError);
  return (
    <p className="room-error" role="alert">
      {error ? t(`nicknameError.${error}`) : ''}
    </p>
  );
}
