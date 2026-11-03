import type Phaser from 'phaser';
import {
  MOVEMENT,
  PLAYER_FRAME_HEIGHT,
  PLAYER_FRAME_WIDTH,
  PLAYER_SCALE,
  SPRITE_OFFSET_Y,
  ammoPickupRect,
  bodyBox,
  bulletBox,
  coinRect,
  portalRect,
  spriteCentre,
  type BulletState,
  type Contacts,
  type InputFrame,
  type Level,
  type PlayerState,
  type Rect,
  type StepTrace,
} from '@bng/shared';
import { Depth } from '../render/depth.ts';
import { NICKNAME_FONT_SIZE, NICKNAME_OFFSET_Y } from '../render/player-view.ts';
import { CorrectionMeter, RESET_THRESHOLD_PX } from './correction-meter.ts';
import { DebugPanel } from './debug-panel.ts';
import { parseDebugLayers, type DebugLayer } from './layers.ts';
import { formatAssist } from './panel-text.ts';
import { ASSIST_MARKER_TICKS, AssistMarkers, Trail, type TrailState } from './trail.ts';

/** What the scene draws this frame, so the overlay outlines exactly what is on screen. */
export interface DebugView {
  local: PlayerState;
  remotes: readonly PlayerState[];
  /** Own (predicted) and remote (interpolated) bullets, as drawn this frame. */
  bullets: readonly BulletState[];
  ammoPickupIds: readonly number[];
  coinIds: readonly number[];
  /** The local player in the latest snapshot. */
  serverLocal: PlayerState | undefined;
  unacked: number;
}

const Color = {
  local: 0x39ff14,
  remote: 0xff3b3b,
  frame: 0xffffff,
  contact: 0x00e5ff,
  ghost: 0xbbbbbb,
  velocity: 0xffee00,
  accel: 0xff4fd8,
  assist: 0x00e5ff,
  tile: 0x000000,
  coin: 0xffa500,
  ammo: 0xffa500,
  portal: 0xb388ff,
  bullet: 0xff00ff,
  barBack: 0x333333,
} as const;

const TRAIL_COLOR: Record<TrailState, number> = {
  grounded: 0x39ff14,
  coyote: 0xffa500,
  airborne: 0x4fc3ff,
};

/** Arrow px per px/s: a full run (270 px/s) is ~68 px, a jump (525 px/s) ~131 px. */
const VELOCITY_ARROW_SCALE = 0.25;
/** Arrow px per px/s of change in one tick: one tick of gravity (25) is 25 px. */
const ACCEL_ARROW_SCALE = 1;
/** A jump's impulse is ~500 px/s in one tick; clamp so no arrow crosses half the screen. */
const MAX_ARROW_PX = 120;
const ARROW_HEAD_PX = 6;

const BAR_WIDTH = 40;
const BAR_HEIGHT = 4;
const BAR_GAP = 2;
/** The nickname label is about one line of its font tall (plus stroke). */
const NICKNAME_HEIGHT = NICKNAME_FONT_SIZE + 4;

const LABEL_STYLE = {
  fontFamily: 'monospace',
  fontSize: '10px',
  color: '#ffffff',
  stroke: '#000000',
  strokeThickness: 3,
} as const;

const DASH_PX = 3;
const DASH_GAP_PX = 2;

/**
 * Debug drawing over the world: hitboxes, tiles, the server ghost, the trail, forces and timers.
 * Dev-only; the scene reaches it through a dynamic import so production builds drop it.
 */
export class DebugOverlay {
  private readonly scene: Phaser.Scene;
  private readonly level: Level;
  private readonly layers: ReadonlySet<DebugLayer>;
  private readonly tiles: Phaser.GameObjects.Graphics | undefined;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly panel: DebugPanel | undefined;
  private readonly labels: Phaser.GameObjects.Text[] = [];
  private labelsUsed = 0;

  private readonly trail = new Trail();
  private readonly assists = new AssistMarkers();
  private readonly corrections = new CorrectionMeter();
  private lastInput: InputFrame | undefined;
  private lastTrace: StepTrace | undefined;

  constructor(scene: Phaser.Scene, level: Level, layers: ReadonlySet<DebugLayer>) {
    this.scene = scene;
    this.level = level;
    this.layers = layers;
    if (layers.has('tiles')) this.tiles = this.drawTiles();
    this.g = scene.add.graphics().setDepth(Depth.debug);
    if (layers.has('panel')) this.panel = new DebugPanel(scene, Depth.debugPanel);
  }

  /** Once per fixed tick, so the trail and markers count ticks, the unit the timers use. */
  step(state: PlayerState, input: InputFrame, trace: StepTrace): void {
    this.lastInput = input;
    this.lastTrace = trace;
    this.trail.push(state);
    this.assists.tick();
    if (trace.assist) this.assists.push(state.x, state.y, trace.assist);
    this.corrections.tick();
  }

  /** Per applied reconcile. A respawn-sized jump also clears the trail, which would show a stale path. */
  correction(distancePx: number): void {
    this.corrections.record(distancePx);
    if (distancePx > RESET_THRESHOLD_PX) this.trail.clear();
  }

  render(view: DebugView): void {
    this.g.clear();
    this.labelsUsed = 0;
    if (this.layers.has('trail')) this.drawTrail();
    if (this.layers.has('hitboxes')) this.drawHitboxes(view);
    if (this.layers.has('ghost') && view.serverLocal) this.drawGhost(view.serverLocal);
    if (this.layers.has('forces')) this.drawForces(view.local);
    if (this.layers.has('timers')) this.drawTimers(view.local);
    for (let i = this.labelsUsed; i < this.labels.length; i++) this.labels[i]!.setVisible(false);
    // Input and trace exist from the first fixed step on; until then there is nothing to show.
    if (this.panel && this.lastInput && this.lastTrace) {
      this.panel.update({
        state: view.local,
        input: this.lastInput,
        trace: this.lastTrace,
        lastAssist: this.assists.last,
        unacked: view.unacked,
        peakPx: this.corrections.peakPx,
        resetInWindow: this.corrections.resetInWindow,
      });
    }
  }

  destroy(): void {
    this.tiles?.destroy();
    this.g.destroy();
    this.panel?.destroy();
    for (const label of this.labels) label.destroy();
  }

  private drawTiles(): Phaser.GameObjects.Graphics {
    const g = this.scene.add.graphics().setDepth(Depth.debug);
    const { grid } = this.level;
    g.lineStyle(1, Color.tile, 0.55);
    for (let row = 0; row < grid.rows; row++) {
      for (let col = 0; col < grid.cols; col++) {
        if (!grid.isSolid(col, row)) continue;
        g.strokeRect(col * grid.tileWidth, row * grid.tileHeight, grid.tileWidth, grid.tileHeight);
      }
    }
    return g;
  }

  private drawTrail(): void {
    for (const p of this.trail.points) {
      this.g.fillStyle(TRAIL_COLOR[p.state], 1);
      this.g.fillCircle(p.x, p.y, 1.5);
    }
  }

  private drawHitboxes(view: DebugView): void {
    const { local } = view;
    this.drawPlayer(local, Color.local, this.lastTrace?.contacts);
    for (const p of view.remotes) {
      // Snapshots carry no contacts for other players; onFloor is the one side they do carry.
      this.drawPlayer(p, Color.remote, { left: false, right: false, up: false, down: p.onFloor });
    }
    this.g.lineStyle(1, Color.bullet, 1);
    for (const b of view.bullets) this.strokeRect(bulletBox(b));
    const ammo = new Set(view.ammoPickupIds);
    const coins = new Set(view.coinIds);
    this.g.lineStyle(1, Color.ammo, 1);
    for (const p of this.level.ammoPickups) if (ammo.has(p.id)) this.strokeRect(ammoPickupRect(p));
    this.g.lineStyle(1, Color.coin, 1);
    for (const p of this.level.coins) if (coins.has(p.id)) this.strokeRect(coinRect(p));
    this.g.lineStyle(1, Color.portal, 1);
    this.strokeRect(portalRect(this.level));
  }

  private drawPlayer(p: PlayerState, color: number, contacts: Contacts | undefined): void {
    const box = bodyBox(p);
    this.g.fillStyle(color, 0.15);
    this.g.fillRect(box.x, box.y, box.width, box.height);
    this.g.lineStyle(1.5, color, 1);
    this.strokeRect(box);

    const frameW = PLAYER_FRAME_WIDTH * PLAYER_SCALE;
    const frameH = PLAYER_FRAME_HEIGHT * PLAYER_SCALE;
    const sprite = spriteCentre(p, p.facing);
    this.g.lineStyle(1, Color.frame, 0.9);
    this.dashedRect({
      x: sprite.x - frameW / 2,
      y: sprite.y - frameH / 2,
      width: frameW,
      height: frameH,
    });

    this.g.fillStyle(color, 1);
    this.g.fillCircle(p.x, p.y, 2);
    if (contacts) this.drawContacts(box, contacts);
    this.label(box.x, box.y - 12, `${p.x.toFixed(1)}, ${p.y.toFixed(1)}`, '#ffffff');
  }

  private drawContacts(box: Rect, c: Contacts): void {
    const right = box.x + box.width;
    const bottom = box.y + box.height;
    this.g.lineStyle(3.5, Color.contact, 1);
    if (c.down) this.g.lineBetween(box.x, bottom, right, bottom);
    if (c.up) this.g.lineBetween(box.x, box.y, right, box.y);
    if (c.left) this.g.lineBetween(box.x, box.y, box.x, bottom);
    if (c.right) this.g.lineBetween(right, box.y, right, bottom);
  }

  private drawGhost(server: PlayerState): void {
    this.g.lineStyle(1, Color.ghost, 1);
    this.dashedRect(bodyBox(server));
  }

  private drawForces(p: PlayerState): void {
    this.arrow(p.x, p.y, p.vx * VELOCITY_ARROW_SCALE, p.vy * VELOCITY_ARROW_SCALE, Color.velocity);
    this.label(p.x + 6, p.y + 6, `v ${p.vx.toFixed(0)}, ${p.vy.toFixed(0)}`, '#ffee00');
    const accel = this.lastTrace?.accel;
    if (accel) {
      this.arrow(p.x, p.y, accel.x * ACCEL_ARROW_SCALE, accel.y * ACCEL_ARROW_SCALE, Color.accel);
      this.label(p.x + 6, p.y + 18, `a ${accel.x.toFixed(1)}, ${accel.y.toFixed(1)}`, '#ff4fd8');
    }
    for (const m of this.assists.markers) {
      const alpha = 1 - m.age / ASSIST_MARKER_TICKS;
      this.g.lineStyle(2, Color.assist, alpha);
      this.g.strokeCircle(m.x, m.y, 6);
      this.label(m.x + 8, m.y - 20, formatAssist(m.event), '#00e5ff', alpha);
    }
  }

  private drawTimers(p: PlayerState): void {
    // Above the nickname, so the bars never cover the name.
    const nameTop = p.y + SPRITE_OFFSET_Y - NICKNAME_OFFSET_Y - NICKNAME_HEIGHT;
    const x = p.x - BAR_WIDTH / 2;
    const bars: [number, number, number][] = [
      [p.coyoteTicks, MOVEMENT.coyoteTicks, TRAIL_COLOR.coyote],
      [p.jumpBufferTicks, MOVEMENT.jumpBufferTicks, Color.velocity],
    ];
    bars.forEach(([ticks, max, color], i) => {
      const y = nameTop - (bars.length - i) * (BAR_HEIGHT + BAR_GAP);
      this.g.fillStyle(Color.barBack, 0.8);
      this.g.fillRect(x, y, BAR_WIDTH, BAR_HEIGHT);
      this.g.fillStyle(color, 1);
      this.g.fillRect(x, y, (BAR_WIDTH * Math.min(ticks, max)) / max, BAR_HEIGHT);
    });
  }

  private arrow(x: number, y: number, dx: number, dy: number, color: number): void {
    const length = Math.hypot(dx, dy);
    if (length < 1) return;
    const scale = Math.min(1, MAX_ARROW_PX / length);
    const ex = x + dx * scale;
    const ey = y + dy * scale;
    const angle = Math.atan2(dy, dx);
    this.g.lineStyle(2, color, 1);
    this.g.lineBetween(x, y, ex, ey);
    this.g.fillStyle(color, 1);
    this.g.fillTriangle(
      ex,
      ey,
      ex - ARROW_HEAD_PX * Math.cos(angle - 0.5),
      ey - ARROW_HEAD_PX * Math.sin(angle - 0.5),
      ex - ARROW_HEAD_PX * Math.cos(angle + 0.5),
      ey - ARROW_HEAD_PX * Math.sin(angle + 0.5),
    );
  }

  private strokeRect(r: Rect): void {
    this.g.strokeRect(r.x, r.y, r.width, r.height);
  }

  /** Graphics has no dash style, so dashes are drawn as short segments. */
  private dashedRect(r: Rect): void {
    const right = r.x + r.width;
    const bottom = r.y + r.height;
    this.dashedLine(r.x, r.y, right, r.y);
    this.dashedLine(right, r.y, right, bottom);
    this.dashedLine(right, bottom, r.x, bottom);
    this.dashedLine(r.x, bottom, r.x, r.y);
  }

  private dashedLine(x1: number, y1: number, x2: number, y2: number): void {
    const length = Math.hypot(x2 - x1, y2 - y1);
    const ux = (x2 - x1) / length;
    const uy = (y2 - y1) / length;
    for (let d = 0; d < length; d += DASH_PX + DASH_GAP_PX) {
      const end = Math.min(d + DASH_PX, length);
      this.g.lineBetween(x1 + ux * d, y1 + uy * d, x1 + ux * end, y1 + uy * end);
    }
  }

  /** Text objects are pooled: the overlay redraws every frame and creating text is not cheap. */
  private label(x: number, y: number, text: string, color: string, alpha = 1): void {
    let label = this.labels[this.labelsUsed];
    if (!label) {
      label = this.scene.add.text(0, 0, '', LABEL_STYLE).setDepth(Depth.debug);
      this.labels.push(label);
    }
    this.labelsUsed++;
    if (label.text !== text) label.setText(text);
    label
      .setColor(color)
      .setAlpha(alpha)
      .setPosition(Math.round(x), Math.round(y))
      .setVisible(true);
  }
}

/** Builds the overlay from `VITE_DEBUG`, or returns null when no layer is on. */
export function createDebugOverlay(scene: Phaser.Scene, level: Level): DebugOverlay | null {
  const layers = parseDebugLayers(import.meta.env.VITE_DEBUG);
  return layers.size === 0 ? null : new DebugOverlay(scene, level, layers);
}
