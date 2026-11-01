import Phaser from 'phaser';
import { matchResult, type MatchResult, type MatchScores } from '@bng/shared';
import { t } from '../i18n/index.ts';
import { getServices } from '../services.ts';

const RESULT_COLOR: Record<MatchResult, string> = {
  win: '#00ff0d',
  lose: '#ff0000',
  tie: '#ffffff',
};

export class GameOverScene extends Phaser.Scene {
  private scores: MatchScores['scores'] = [];

  constructor() {
    super('game-over');
  }

  init(data: MatchScores): void {
    this.scores = data.scores;
  }

  create(): void {
    const { network } = getServices(this);
    const result = matchResult(this.scores, network.playerId ?? '');
    this.add
      .text(400, 300, t(`result.${result}`), { fontSize: '32px', color: RESULT_COLOR[result] })
      .setOrigin(0.5, 0.5);
  }
}
