import { useEffect, useState, type ReactElement } from 'react';
import { parseRoomName, ROOM_NAME_MAX_LENGTH } from '@bng/shared';
import { t } from '../../i18n/index.ts';
import { LevelBrowser } from '../level-picker/LevelBrowser.tsx';
import {
  defaultPlaylist,
  moveItem,
  removeAt,
  toggleLevel,
  type PlaylistItem,
} from '../level-picker/playlist.ts';
import { PlaylistChips } from '../level-picker/PlaylistChips.tsx';
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

/** Mounted each time the dialog opens, so it starts from the default name and playlist every time. */
function CreateRoomForm() {
  const store = useUiStore();
  const pending = useUi((s) => s.roomPending);
  const [name, setName] = useState(() =>
    // Only accounts create rooms, so the room is named after the account.
    t('createRoom.defaultName', { nickname: store.getState().account?.nickname ?? '' }),
  );
  const [playlist, setPlaylist] = useState<PlaylistItem[]>(defaultPlaylist);
  useEffect(() => store.getState().clearRoomError(), [store]);
  const valid = parseRoomName(name) !== null && playlist.length > 0;
  return (
    <form
      className="create-room"
      onSubmit={(event) => {
        event.preventDefault();
        // On success the room list, and this dialog with it, gives way to the lobby.
        if (valid)
          void store.getState().createRoom(
            name,
            playlist.map((item) => item.id),
          );
      }}
    >
      <label className="field field--row">
        <span className="field__label">{t('createRoom.name')}</span>
        <input
          className="pixel-input pixel-input--wide"
          value={name}
          maxLength={ROOM_NAME_MAX_LENGTH + 8}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={parseRoomName(name) === null}
          aria-describedby="room-name-hint"
          onChange={(event) => setName(event.target.value)}
        />
        <span id="room-name-hint" className="visually-hidden">
          {t('createRoom.hint', { max: ROOM_NAME_MAX_LENGTH })}
        </span>
      </label>
      <div className="field field--wide">
        <span className="field__label">{t('createRoom.playlist')}</span>
        <PlaylistChips
          items={playlist}
          onRemove={(index) => setPlaylist((list) => removeAt(list, index))}
          onMove={(from, to) => setPlaylist((list) => moveItem(list, from, to))}
        />
      </div>
      <LevelBrowser
        playlist={playlist}
        onToggle={(item) => setPlaylist((list) => toggleLevel(list, item))}
      />
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
