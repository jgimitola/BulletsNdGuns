import '@fontsource/tiny5';
import '@fontsource/press-start-2p';
import './ui/styles.css';
import Phaser from 'phaser';
import { gameConfig } from './game-config.ts';
import { NetworkClient } from './net/network-client.ts';
import { SERVICES_KEY, type GameServices } from './services.ts';
import { mountUi } from './ui/mount.tsx';
import { createUiStore } from './ui/store.ts';

const NICKNAME_STORAGE_KEY = 'bng.nickname';

/** Storage can be unavailable (private mode, blocked cookies); the nickname then lasts one visit. */
function loadNickname(): string {
  try {
    return localStorage.getItem(NICKNAME_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveNickname(nickname: string): void {
  try {
    localStorage.setItem(NICKNAME_STORAGE_KEY, nickname);
  } catch {
    // Not remembered; nothing else depends on it.
  }
}

const network = new NetworkClient();
const ui = createUiStore(
  {
    sendReady: () => network.sendReady(),
    createRoom: (name, nickname) => network.createRoom(name, nickname),
    joinRoom: (roomId, nickname) => network.joinRoom(roomId, nickname),
    leaveRoom: () => network.leaveRoom(),
    saveNickname,
  },
  { nickname: loadNickname() },
);

const uiRoot = document.getElementById('ui');
if (!uiRoot) throw new Error('#ui element is missing from index.html');
mountUi(uiRoot, ui);

let game: Phaser.Game | undefined;

network.onConnect(() => {
  // A second connect means socket.io reconnected under a new socket id: the server has forgotten
  // this player and any room they were in, so start over from a clean page.
  if (game) {
    window.location.reload();
    return;
  }
  if (network.playerId) ui.getState().setPlayerId(network.playerId);
  game = new Phaser.Game(gameConfig);
  const services: GameServices = { network, ui };
  game.registry.set(SERVICES_KEY, services);
});

network.on('lobbyUpdated', (lobby) => ui.getState().setLobby(lobby));
