import Phaser from 'phaser';
import { gameConfig } from './game-config.ts';
import { NetworkClient } from './net/network-client.ts';
import { SERVICES_KEY, type GameServices } from './services.ts';
import { showMatchInProgress } from './ui/match-in-progress.ts';

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>)['__showMatchInProgress'] = showMatchInProgress;
}

const network = new NetworkClient();
let game: Phaser.Game | undefined;

network.on('joined', () => {
  if (game) return;
  game = new Phaser.Game(gameConfig);
  const services: GameServices = { network };
  game.registry.set(SERVICES_KEY, services);
});

network.on('matchInProgress', showMatchInProgress);
