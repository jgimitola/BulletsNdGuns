import type Phaser from 'phaser';
import type { NetworkClient } from './net/network-client.ts';

export interface GameServices {
  network: NetworkClient;
}

export const SERVICES_KEY = 'services';

export function getServices(scene: Phaser.Scene): GameServices {
  const services = scene.game.registry.get(SERVICES_KEY) as GameServices | undefined;
  if (!services) throw new Error('Game services are not registered');
  return services;
}
