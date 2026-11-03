import { t } from '../../i18n/index.ts';
import { playHoverSound } from '../hover-sound.ts';
import { useUi, useUiStore } from '../UiStoreContext.tsx';

/** The room this player is in, before its match starts. Updated live by lobbyUpdated. */
export function LobbyScreen() {
  const store = useUiStore();
  const lobby = useUi((s) => s.lobby);
  const waiting = useUi((s) => s.waiting);
  const myId = useUi((s) => s.playerId);
  if (!lobby) return null;
  return (
    <div className="screen screen--menu screen--above-strip interactive">
      <div className="brick-strip" />
      <div className="lobby pixel-panel">
        <h2 className="lobby__title">{lobby.name}</h2>
        <p className="lobby__levels">
          {t('lobby.levels')} {lobby.levels.map((name, i) => `${i + 1}. ${name}`).join(', ')}
        </p>
        <h3 className="lobby__heading">{t('lobby.players')}</h3>
        <ul className="lobby__players">
          {lobby.players.map((p) => (
            <li key={p.id} className="lobby__player">
              <span className={p.id === myId ? 'lobby__me' : undefined}>
                {p.nickname} {p.id === myId && t('lobby.you')}
              </span>
              <span className={p.ready ? 'lobby__ready' : 'lobby__not-ready'}>
                {p.ready ? t('lobby.ready') : t('lobby.notReady')}
              </span>
            </li>
          ))}
        </ul>
        <p className="lobby__hint">{t('lobby.hint')}</p>
      </div>
      <div className="rooms__actions">
        <button
          type="button"
          className="pixel-button"
          onPointerEnter={playHoverSound}
          onClick={() => store.getState().leaveRoom()}
        >
          {t('lobby.leave')}
        </button>
        {waiting ? (
          // Not a button: once clicked there is nothing left to press, and SPACE must reach the game.
          <div className="pixel-button pixel-button--static blink" role="status">
            {t('lobby.waiting')}
          </div>
        ) : (
          <button
            type="button"
            className="pixel-button pixel-button--primary"
            onPointerEnter={playHoverSound}
            onClick={() => store.getState().ready()}
          >
            {t('lobby.start')}
          </button>
        )}
      </div>
    </div>
  );
}
