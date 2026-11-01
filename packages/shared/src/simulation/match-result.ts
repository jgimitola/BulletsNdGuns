import type { PlayerId } from './player.ts';

export type MatchResult = 'win' | 'lose' | 'tie';

/** Highest score wins; sharing the highest score is a tie; a lone player wins. */
export function matchResult(
  scores: readonly { id: PlayerId; score: number }[],
  playerId: PlayerId,
): MatchResult {
  const mine = scores.find((s) => s.id === playerId);
  if (!mine) return 'lose';
  const best = Math.max(...scores.map((s) => s.score));
  if (mine.score < best) return 'lose';
  const leaders = scores.filter((s) => s.score === best).length;
  return leaders > 1 ? 'tie' : 'win';
}
