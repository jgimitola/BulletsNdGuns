/** One tick of player input, numbered by the client so the server can acknowledge it. */
export interface InputFrame {
  seq: number;
  left: boolean;
  right: boolean;
  jump: boolean;
  shoot: boolean;
}

export const NEUTRAL_INPUT: Readonly<Omit<InputFrame, 'seq'>> = Object.freeze({
  left: false,
  right: false,
  jump: false,
  shoot: false,
});
