import {
  MOVEMENT,
  SHOT_COOLDOWN_MS,
  TICK_RATE,
  type CornerAssistEvent,
  type InputFrame,
  type PlayerState,
  type StepTrace,
} from '@bng/shared';
import type { AssistMarker } from './trail.ts';

export interface PanelData {
  state: PlayerState;
  input: InputFrame;
  trace: StepTrace;
  lastAssist: AssistMarker | undefined;
  unacked: number;
  peakPx: number;
  resetInWindow: boolean;
}

const COOLDOWN_TICKS = (SHOT_COOLDOWN_MS * TICK_RATE) / 1000;
/** Past this an assist is simply "a while ago"; two digits keep the line inside the panel. */
const MAX_SHOWN_AGE = 99;

function signed(v: number, digits: number): string {
  const text = Math.abs(v).toFixed(digits);
  return `${v < 0 ? '-' : '+'}${text}`;
}

function num(v: number): string {
  return v.toFixed(1).padStart(5);
}

function bar(ticks: number, max: number): string {
  const filled = Math.min(Math.max(ticks, 0), max);
  return `${'#'.repeat(filled)}${'.'.repeat(max - filled)} ${ticks}/${max}`;
}

function side(name: string, touching: boolean): string {
  return `${name}${touching ? 'X' : '-'}`;
}

export function formatAssist(event: CornerAssistEvent): string {
  return event.kind === 'headNudge'
    ? `head nudge ${signed(Math.round(event.dx), 0)}px`
    : `ledge catch ${signed(Math.round(event.dy), 0)}px`;
}

/** The panel's lines, in fixed columns so values do not shift sideways as they change. */
export function formatPanel(d: PanelData): string[] {
  const { state: p, input, trace } = d;
  const { left, right, up, down } = trace.contacts;
  // Same rule as the step: the shot is ready once strictly more than the cooldown has passed.
  const cooldown =
    p.ticksSinceShot > COOLDOWN_TICKS ? 'ready' : `${p.ticksSinceShot}/${COOLDOWN_TICKS}`;
  const direction = input.left ? 'L' : input.right ? 'R' : '-';
  // Capped so an old assist cannot widen the line past the panel's fixed width.
  const age =
    d.lastAssist && (d.lastAssist.age > MAX_SHOWN_AGE ? `${MAX_SHOWN_AGE}+` : d.lastAssist.age);
  const assist = d.lastAssist ? `${formatAssist(d.lastAssist.event)} (${age} ticks ago)` : 'none';
  const snap = d.resetInWindow ? 'reset' : `${d.peakPx.toFixed(1)}px`;
  return [
    `pos   ${num(p.x)}, ${num(p.y)}`,
    `vel   ${num(p.vx)}, ${num(p.vy)}`,
    `accel ${signed(trace.accel.x, 1).padStart(5)}, ${signed(trace.accel.y, 1).padStart(5)} /tick`,
    `floor ${(p.onFloor ? 'yes' : 'no').padEnd(5)}facing ${p.facing === 'left' ? 'L' : 'R'}  anim ${p.anim}`,
    `touch ${side('L', left)} ${side('R', right)} ${side('U', up)} ${side('D', down)}`,
    `coyote  ${bar(p.coyoteTicks, MOVEMENT.coyoteTicks)}`,
    `jumpbuf ${bar(p.jumpBufferTicks, MOVEMENT.jumpBufferTicks)}`,
    `pose    ${p.shotPoseTicks}/${MOVEMENT.shotPoseTicks}  cooldown ${cooldown}`,
    `input   ${direction}  ${input.jumpPressed ? 'J' : '-'}  ${input.shootPressed ? 'S' : '-'}`,
    `assist  ${assist}`,
    `net     unacked ${d.unacked}  snap ${snap}`,
  ];
}
