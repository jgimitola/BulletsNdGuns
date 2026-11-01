import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import type { RoomSummary } from '@bng/shared';
import { t } from '../../i18n/index.ts';
import { fetchRooms, ROOMS_QUERY_KEY } from '../../net/rooms-api.ts';
import { CreateRoomDialog } from '../dialogs/CreateRoomDialog.tsx';
import { playHoverSound } from '../hover-sound.ts';
import { RoomErrorMessage } from '../RoomErrorMessage.tsx';
import { useUi, useUiStore } from '../UiStoreContext.tsx';

const ROOMS_POLL_MS = 3000;

// Only the room table uses HTTP; it polls on its own, so one failed fetch need not be retried.
// Module scope keeps the cache across visits to this screen.
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });

/** Entry point of the lazily loaded room list chunk (see lazy-screens.ts). */
export function RoomsScreenWithQuery() {
  return (
    <QueryClientProvider client={queryClient}>
      <RoomsScreen />
    </QueryClientProvider>
  );
}

function RoomsScreen() {
  const store = useUiStore();
  const pending = useUi((s) => s.roomPending);
  const rooms = useQuery({
    queryKey: ROOMS_QUERY_KEY,
    queryFn: ({ signal }) => fetchRooms(signal),
    refetchInterval: ROOMS_POLL_MS,
  });
  return (
    <div className="screen screen--menu screen--above-strip interactive">
      <div className="brick-strip" />
      <div className="rooms pixel-panel">
        <div className="rooms__header">
          <h2 className="rooms__title">{t('rooms.title')}</h2>
          <button
            type="button"
            className="pixel-button pixel-button--small"
            onPointerEnter={playHoverSound}
            onClick={() => void rooms.refetch()}
          >
            {t('rooms.refresh')}
          </button>
        </div>
        <div className="rooms__table-wrap">
          <table className="rooms__table">
            <thead>
              <tr>
                <th scope="col">{t('rooms.name')}</th>
                <th scope="col">{t('rooms.players')}</th>
                <th scope="col">{t('rooms.status')}</th>
              </tr>
            </thead>
            <tbody>
              {rooms.data?.map((room) => (
                <RoomRow
                  key={room.id}
                  room={room}
                  disabled={pending}
                  onJoin={() => void store.getState().joinRoom(room.id)}
                />
              ))}
            </tbody>
          </table>
          <RoomsTableNote
            loading={rooms.isPending}
            failed={rooms.isError && !rooms.data}
            empty={rooms.data?.length === 0}
          />
        </div>
        <RoomErrorMessage />
      </div>
      <div className="rooms__actions">
        <button
          type="button"
          className="pixel-button"
          onPointerEnter={playHoverSound}
          onClick={() => store.getState().backToMenu()}
        >
          {t('rooms.back')}
        </button>
        <CreateRoomDialog
          trigger={
            <button
              type="button"
              className="pixel-button pixel-button--primary"
              disabled={pending}
              onPointerEnter={playHoverSound}
            >
              {t('rooms.create')}
            </button>
          }
        />
      </div>
    </div>
  );
}

function RoomRow({
  room,
  disabled,
  onJoin,
}: {
  room: RoomSummary;
  disabled: boolean;
  onJoin: () => void;
}) {
  return (
    <tr>
      <td className="rooms__name">{room.name}</td>
      <td className="rooms__count">{room.players}</td>
      <td className="rooms__status">
        {room.status === 'lobby' ? (
          <button
            type="button"
            className="pixel-button pixel-button--small"
            disabled={disabled}
            aria-label={t('rooms.joinRoom', { name: room.name })}
            onPointerEnter={playHoverSound}
            onClick={onJoin}
          >
            {t('rooms.join')}
          </button>
        ) : (
          <span className="rooms__playing">{t('rooms.playing')}</span>
        )}
      </td>
    </tr>
  );
}

function RoomsTableNote({
  loading,
  failed,
  empty,
}: {
  loading: boolean;
  failed: boolean;
  empty: boolean;
}) {
  if (loading) return <p className="rooms__note blink">{t('rooms.loading')}</p>;
  if (failed) return <p className="rooms__note rooms__note--error">{t('rooms.loadError')}</p>;
  if (empty) return <p className="rooms__note">{t('rooms.empty')}</p>;
  return null;
}
