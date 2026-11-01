import Phaser from 'phaser';
import { gameConfig } from './game-config.ts';
import { SERVICES_KEY, type GameServices } from './services.ts';

/**
 * Boots Phaser. main.ts imports this module dynamically, so Phaser and the scenes (most of the
 * JavaScript) download alongside the first screen instead of blocking it.
 */
export function startGame(services: GameServices): Phaser.Game {
  const game = new Phaser.Game(gameConfig);
  game.registry.set(SERVICES_KEY, services);
  return game;
}
