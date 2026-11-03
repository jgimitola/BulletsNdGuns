import { useEffect, useState, type ReactElement } from 'react';
import { DEFAULT_PLAYLIST, parseRoomName, ROOM_NAME_MAX_LENGTH } from '@bng/shared';
import { t } from '../../i18n/index.ts';
import { PixelDialog } from '../PixelDialog.tsx';
import { RoomErrorMessage } from '../RoomErrorMessage.tsx';
import { useUi, useUiStore } from '../UiStoreContext.tsx';

export function CreateRoomDialog({ trigger }: { trigger: ReactElement }) {
  return (
    <PixelDialog trigger={trigger} title={t('createRoom.title')}>
      <CreateRoomForm />
    </PixelDialog>
  );
}

/** Mounted each time the dialog opens, so it starts from the default name every time. */
function CreateRoomForm() {
  const store = useUiStore();
  const pending = useUi((s) => s.roomPending);
  const [name, setName] = useState(() =>
    // Only accounts create rooms, so the room is named after the account.
    t('createRoom.defaultName', { nickname: store.getState().account?.nickname ?? '' }),
  );
  useEffect(() => store.getState().clearRoomError(), [store]);
  const valid = parseRoomName(name) !== null;
  return (
    <form
      className="create-room"
      onSubmit={(event) => {
        event.preventDefault();
        // On success the room list, and this dialog with it, gives way to the lobby.
        if (valid) void store.getState().createRoom(name, DEFAULT_PLAYLIST.slice());
      }}
    >
      <label className="field">
        <span className="field__label">{t('createRoom.name')}</span>
        <input
          className="pixel-input pixel-input--wide"
          value={name}
          maxLength={ROOM_NAME_MAX_LENGTH + 8}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={!valid}
          aria-describedby="room-name-hint"
          onChange={(event) => setName(event.target.value)}
        />
        <span id="room-name-hint" className="field__hint">
          {t('createRoom.hint', { max: ROOM_NAME_MAX_LENGTH })}
        </span>
      </label>
      <RoomErrorMessage />
      <button
        type="submit"
        className="pixel-button pixel-button--primary"
        disabled={!valid || pending}
      >
        {t('createRoom.submit')}
      </button>
    </form>
  );
}
