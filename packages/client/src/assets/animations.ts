import type Phaser from 'phaser';
import type { AnimationKey } from '@bng/shared';
import { TextureKey } from './manifest.ts';

interface FrameDef {
  start: number;
  end: number;
  frameRate: number;
  repeat: number;
}

const FRAMES: Record<AnimationKey, FrameDef> = {
  idle: { start: 7, end: 7, frameRate: 1, repeat: 0 },
  run: { start: 0, end: 5, frameRate: 6, repeat: 1 },
  jump: { start: 9, end: 9, frameRate: 1, repeat: 0 },
  fall: { start: 10, end: 10, frameRate: 1, repeat: 0 },
  shoot: { start: 8, end: 8, frameRate: 1, repeat: 1 },
};

export function animationKeyFor(sheet: 'player' | 'enemy', key: AnimationKey): string {
  return `${sheet}-${key}`;
}

export function registerAnimations(anims: Phaser.Animations.AnimationManager): void {
  for (const sheet of ['player', 'enemy'] as const) {
    for (const [key, def] of Object.entries(FRAMES) as [AnimationKey, FrameDef][]) {
      anims.create({
        key: animationKeyFor(sheet, key),
        frames: anims.generateFrameNumbers(TextureKey[sheet], { start: def.start, end: def.end }),
        frameRate: def.frameRate,
        repeat: def.repeat,
      });
    }
  }
}
