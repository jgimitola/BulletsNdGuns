import type { CornerAssistEvent, PlayerState } from '@bng/shared';

export type TrailState = 'grounded' | 'coyote' | 'airborne';

/** One second of positions: long enough to see a whole short hop or a walk off a ledge. */
export const TRAIL_TICKS = 60;
/** About half a second: long enough to spot, short enough not to clutter a run of jumps. */
export const ASSIST_MARKER_TICKS = 30;

export function trailStateOf(p: PlayerState): TrailState {
  if (p.onFloor) return 'grounded';
  return p.coyoteTicks > 0 ? 'coyote' : 'airborne';
}

export interface TrailPoint {
  x: number;
  y: number;
  state: TrailState;
}

/** The local player's hitbox centre, one point per fixed tick. */
export class Trail {
  private readonly list: TrailPoint[] = [];

  push(p: PlayerState): void {
    this.list.push({ x: p.x, y: p.y, state: trailStateOf(p) });
    if (this.list.length > TRAIL_TICKS) this.list.shift();
  }

  clear(): void {
    this.list.length = 0;
  }

  /** Oldest first. */
  get points(): readonly TrailPoint[] {
    return this.list;
  }
}

export interface AssistMarker {
  x: number;
  y: number;
  event: CornerAssistEvent;
  /** Ticks since it fired. */
  age: number;
}

/** Where corner assists fired recently. The newest is kept after it fades, for the panel. */
export class AssistMarkers {
  private list: AssistMarker[] = [];
  private newest: AssistMarker | undefined;

  push(x: number, y: number, event: CornerAssistEvent): void {
    this.newest = { x, y, event, age: 0 };
    this.list.push(this.newest);
  }

  tick(): void {
    for (const m of this.list) m.age++;
    if (this.newest && !this.list.includes(this.newest)) this.newest.age++;
    this.list = this.list.filter((m) => m.age < ASSIST_MARKER_TICKS);
  }

  get markers(): readonly AssistMarker[] {
    return this.list;
  }

  get last(): AssistMarker | undefined {
    return this.newest;
  }
}
