import Phaser from 'phaser';
import { matchResult, type MatchScores } from '@bng/shared';
import { getServices } from '../services.ts';

/** Draws nothing: it hands the local player's result to the HTML game-over screen. */
export class GameOverScene extends Phaser.Scene {
  private scores: MatchScores['scores'] = [];

  constructor() {
    super('game-over');
  }

  init(data: MatchScores): void {
    this.scores = data.scores;
  }

  create(): void {
    const { network, ui } = getServices(this);
    ui.getState().setResult(matchResult(this.scores, network.playerId ?? ''));
  }
}
