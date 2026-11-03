import '@fontsource/tiny5';
import '@fontsource/press-start-2p';
import './ui/styles.css';
import { detectLocale, setLocale, type Locale } from './i18n/index.ts';
import { LATENCY_TIMEOUT_MS, startLatencyMonitor } from './net/latency.ts';
import { NetworkClient } from './net/network-client.ts';
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
    createRoom: (name) => network.createRoom(name),
    joinRoom: (roomId) => network.joinRoom(roomId),
    leaveRoom: () => network.leaveRoom(),
    claimNickname: (nickname) => network.claimNickname(nickname),
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

// Phaser and the scenes are most of the JavaScript: fetch them now, in parallel with the socket
// connection, and only boot them once connected.
const gameModule = import('./game.ts');

let connectedBefore = false;

network.onConnect(() => {
  // A second connect means socket.io reconnected under a new socket id: the server has forgotten
  // this player and any room they were in, so start over from a clean page.
  if (connectedBefore) {
    window.location.reload();
    return;
  }
  connectedBefore = true;
  if (network.playerId) ui.getState().setPlayerId(network.playerId);
  startLatencyMonitor(
    () => network.measureLatency(LATENCY_TIMEOUT_MS),
    (ms) => ui.getState().setPing(ms),
  );
  // The loader scene takes over this screen once Phaser runs.
  ui.getState().setScreen('loading');
  void gameModule.then(({ startGame }) => startGame({ network, ui }));
});

network.on('lobbyUpdated', (lobby) => ui.getState().setLobby(lobby));
