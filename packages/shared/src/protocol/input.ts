/** One tick of player input, numbered by the client so the server can acknowledge it. */
export interface InputFrame {
  seq: number;
  /** Level index the client was playing when it sampled this frame; the server drops mismatches. */
  level: number;
  left: boolean;
  right: boolean;
  jump: boolean;
  shoot: boolean;
}

/** The keys of a frame, without its numbering. */
export type InputKeys = Omit<InputFrame, 'seq' | 'level'>;

export const NEUTRAL_INPUT: Readonly<InputKeys> = Object.freeze({
  left: false,
  right: false,
  jump: false,
  shoot: false,
});
