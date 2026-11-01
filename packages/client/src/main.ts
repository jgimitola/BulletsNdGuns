import '@fontsource/tiny5';
import '@fontsource/press-start-2p';
import './ui/styles.css';
import Phaser from 'phaser';
import { gameConfig } from './game-config.ts';
import { NetworkClient } from './net/network-client.ts';
import { SERVICES_KEY, type GameServices } from './services.ts';
import { mountUi } from './ui/mount.tsx';
import { createUiStore } from './ui/store.ts';

const network = new NetworkClient();
const ui = createUiStore({ sendReady: () => network.sendReady() });
const showMatchInProgress = () => ui.getState().showMatchInProgress();

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>)['__showMatchInProgress'] = showMatchInProgress;
}
const uiRoot = document.getElementById('ui');
if (!uiRoot) throw new Error('#ui element is missing from index.html');
mountUi(uiRoot, ui);

let game: Phaser.Game | undefined;

network.on('joined', () => {
  // A second `joined` means socket.io reconnected under a new socket id: the server sees a fresh,
  // not-ready player and the old match state is gone, so start over from a clean page.
  if (game) {
    window.location.reload();
    return;
  }
  game = new Phaser.Game(gameConfig);
  const services: GameServices = { network, ui };
  game.registry.set(SERVICES_KEY, services);
});

network.on('matchInProgress', showMatchInProgress);
