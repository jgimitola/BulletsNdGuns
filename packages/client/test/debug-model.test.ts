import { describe, expect, it } from 'vitest';
import {
  NEUTRAL_INPUT,
  createPlayer,
  getLevel,
  type InputFrame,
  type PlayerState,
  type StepTrace,
} from '@bng/shared';
import {
  CORRECTION_WINDOW_TICKS,
  CorrectionMeter,
  RESET_THRESHOLD_PX,
} from '../src/debug/correction-meter.ts';
import { formatAssist, formatPanel, type PanelData } from '../src/debug/panel-text.ts';
import {
  isTitleClick,
  loadPanelPrefs,
  savePanelPrefs,
  type PanelPrefs,
} from '../src/debug/panel-prefs.ts';
import {
  ASSIST_MARKER_TICKS,
  AssistMarkers,
  TRAIL_TICKS,
  Trail,
  trailStateOf,
} from '../src/debug/trail.ts';

const player = (o: Partial<PlayerState> = {}): PlayerState => ({
  ...createPlayer('me', 'left', getLevel(0)),
  ...o,
});

describe('CorrectionMeter', () => {
  it('keeps the largest correction in the window', () => {
    const m = new CorrectionMeter();
    m.record(1.5);
    m.record(3);
    m.record(2);
    expect(m.peakPx).toBe(3);
  });

  it('forgets corrections older than the window', () => {
    const m = new CorrectionMeter();
    m.record(3);
    for (let i = 0; i < CORRECTION_WINDOW_TICKS; i++) m.tick();
    expect(m.peakPx).toBe(0);
  });

  it('counts a respawn-sized jump as a reset, not a correction', () => {
    const m = new CorrectionMeter();
    m.record(1);
    m.record(RESET_THRESHOLD_PX + 1);
    expect(m.peakPx).toBe(1);
    expect(m.resetInWindow).toBe(true);
    for (let i = 0; i < CORRECTION_WINDOW_TICKS; i++) m.tick();
    expect(m.resetInWindow).toBe(false);
  });
});

describe('trail', () => {
  it('classifies grounded, coyote and airborne', () => {
    expect(trailStateOf(player({ onFloor: true, coyoteTicks: 3 }))).toBe('grounded');
    expect(trailStateOf(player({ onFloor: false, coyoteTicks: 3 }))).toBe('coyote');
    expect(trailStateOf(player({ onFloor: false, coyoteTicks: 0 }))).toBe('airborne');
  });

  it('keeps the newest TRAIL_TICKS points, oldest first', () => {
    const t = new Trail();
    for (let i = 0; i < TRAIL_TICKS + 10; i++) t.push(player({ x: i }));
    expect(t.points).toHaveLength(TRAIL_TICKS);
    expect(t.points[0]!.x).toBe(10);
    expect(t.points.at(-1)!.x).toBe(TRAIL_TICKS + 9);
  });

  it('clear empties it', () => {
    const t = new Trail();
    t.push(player());
    t.clear();
    expect(t.points).toHaveLength(0);
  });
});

describe('AssistMarkers', () => {
  it('fades a marker after ASSIST_MARKER_TICKS but remembers the last one', () => {
    const m = new AssistMarkers();
    m.push(10, 20, { kind: 'ledgeCatch', dy: 6 });
    for (let i = 0; i < ASSIST_MARKER_TICKS - 1; i++) m.tick();
    expect(m.markers).toHaveLength(1);
    expect(m.markers[0]!.age).toBe(ASSIST_MARKER_TICKS - 1);
    m.tick();
    expect(m.markers).toHaveLength(0);
    expect(m.last?.event).toEqual({ kind: 'ledgeCatch', dy: 6 });
    expect(m.last?.age).toBe(ASSIST_MARKER_TICKS);
  });
});

describe('formatAssist', () => {
  it('shows whole px with an explicit sign', () => {
    expect(formatAssist({ kind: 'headNudge', dx: -4.2 })).toBe('head nudge -4px');
    expect(formatAssist({ kind: 'ledgeCatch', dy: 6 })).toBe('ledge catch +6px');
  });
});

describe('formatPanel', () => {
  const input = (o: Partial<InputFrame> = {}): InputFrame => ({
    ...NEUTRAL_INPUT,
    seq: 1,
    level: 0,
    ...o,
  });
  const trace = (o: Partial<StepTrace> = {}): StepTrace => ({
    contacts: { left: false, right: false, up: false, down: false },
    accel: { x: 0, y: 25 },
    assist: null,
    ...o,
  });
  const data = (o: Partial<PanelData> = {}): PanelData => ({
    state: player({
      x: 207,
      y: 134.1,
      vx: 270,
      vy: 50,
      onFloor: false,
      facing: 'right',
      anim: 'fall',
      coyoteTicks: 4,
      jumpBufferTicks: 0,
      shotPoseTicks: 0,
      ticksSinceShot: 34,
    }),
    input: input({ right: true }),
    trace: trace(),
    lastAssist: undefined,
    unacked: 7,
    peakPx: 0,
    resetInWindow: false,
    ...o,
  });

  it('matches the mockup', () => {
    expect(formatPanel(data())).toEqual([
      'pos   207.0, 134.1',
      'vel   270.0,  50.0',
      'accel  +0.0, +25.0 /tick',
      'floor no   facing R  anim fall',
      'touch L- R- U- D-',
      'coyote  ####.. 4/6',
      'jumpbuf ...... 0/6',
      'pose    0/12  cooldown 34/60',
      'input   R  -  -',
      'assist  none',
      'net     unacked 7  snap 0.0px',
    ]);
  });

  it('marks touched sides', () => {
    const lines = formatPanel(
      data({ trace: trace({ contacts: { left: false, right: false, up: false, down: true } }) }),
    );
    expect(lines).toContain('touch L- R- U- DX');
  });

  it('shows a finished cooldown as ready', () => {
    const lines = formatPanel(data({ state: { ...data().state, ticksSinceShot: 61 } }));
    expect(lines).toContain('pose    0/12  cooldown ready');
  });

  it('shows left, jump and shoot input', () => {
    const lines = formatPanel(
      data({ input: input({ left: true, jumpPressed: true, shootPressed: true }) }),
    );
    expect(lines).toContain('input   L  J  S');
  });

  it('shows the last assist and its age', () => {
    const lastAssist = { x: 0, y: 0, event: { kind: 'ledgeCatch', dy: 6 } as const, age: 12 };
    expect(formatPanel(data({ lastAssist }))).toContain('assist  ledge catch +6px (12 ticks ago)');
  });

  it('shows a reset instead of the peak', () => {
    expect(formatPanel(data({ peakPx: 2, resetInWindow: true }))).toContain(
      'net     unacked 7  snap reset',
    );
  });
});

describe('panel prefs', () => {
  const fallback: PanelPrefs = { x: 8, y: 400, collapsed: false };
  const bounds = { width: 800, height: 600 };
  const storage = (value: string | null) => ({ getItem: () => value });

  it.each([null, '{not json', '{"x":"a","y":1,"collapsed":false}', '[]'])(
    'falls back on %j',
    (value) => {
      expect(loadPanelPrefs(storage(value), fallback, bounds)).toEqual(fallback);
    },
  );

  it('clamps a stored position back inside the canvas', () => {
    const prefs = loadPanelPrefs(storage('{"x":5000,"y":-20,"collapsed":true}'), fallback, bounds);
    expect(prefs).toEqual({ x: 799, y: 0, collapsed: true });
  });

  it('round-trips through save and load', () => {
    const store = new Map<string, string>();
    const prefs = { x: 100, y: 200, collapsed: true };
    savePanelPrefs({ setItem: (k: string, v: string) => store.set(k, v) }, prefs);
    const loaded = loadPanelPrefs(
      { getItem: (k: string) => store.get(k) ?? null },
      fallback,
      bounds,
    );
    expect(loaded).toEqual(prefs);
  });
});

describe('isTitleClick', () => {
  it('a press-release that barely moves is a click', () => {
    expect(isTitleClick(0, 0, 3, 0)).toBe(true);
    expect(isTitleClick(0, 0, 0, 4)).toBe(true);
  });

  it('a press-release that moves further is a drag', () => {
    expect(isTitleClick(0, 0, 5, 0)).toBe(false);
  });
});
