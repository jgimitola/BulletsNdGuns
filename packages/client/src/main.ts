import '@fontsource/tiny5';
import '@fontsource/press-start-2p';
import './ui/styles.css';
import Phaser from 'phaser';
import { gameConfig } from './game-config.ts';
import { detectLocale, setLocale, type Locale } from './i18n/index.ts';
import { NetworkClient } from './net/network-client.ts';
import { SERVICES_KEY, type GameServices } from './services.ts';
import { mountUi } from './ui/mount.tsx';
import { createUiStore } from './ui/store.ts';

const NICKNAME_STORAGE_KEY = 'bng.nickname';
const LOCALE_STORAGE_KEY = 'bng.locale';

/** Storage can be unavailable (private mode, blocked cookies); settings then last one visit. */
function loadSetting(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function saveSetting(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not remembered; nothing else depends on it.
  }
}

function applyLocale(locale: Locale): void {
  setLocale(locale);
  document.documentElement.lang = locale;
}

const locale = detectLocale(loadSetting(LOCALE_STORAGE_KEY), navigator.languages);
applyLocale(locale);

const network = new NetworkClient();
const ui = createUiStore(
  {
    sendReady: () => network.sendReady(),
    createRoom: (name, nickname) => network.createRoom(name, nickname),
    joinRoom: (roomId, nickname) => network.joinRoom(roomId, nickname),
    leaveRoom: () => network.leaveRoom(),
    saveNickname: (nickname) => saveSetting(NICKNAME_STORAGE_KEY, nickname),
    changeLocale: (next) => {
      applyLocale(next);
      saveSetting(LOCALE_STORAGE_KEY, next);
    },
  },
  { nickname: loadSetting(NICKNAME_STORAGE_KEY) ?? '', locale },
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
