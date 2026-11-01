// Ported from Phaser 3.20.1 (MIT), © Richard Davey / Photon Storm
// Sources: src/physics/arcade/Body.js (resetFlags, update, checkWorldBounds) and
// src/physics/arcade/World.js (computeVelocity, gravity part only).
// Dropped: bounce (always 0), drag, acceleration, max velocity/speed, custom bounds, events.

export interface Blocked {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

/**
 * An arcade body box: (x, y) is the top-left corner (Phaser's `body.position`).
 * `prevX`/`prevY` hold the position at the start of the step; `x - prevX` is Phaser's
 * `deltaX()` once `integrate` and `clampToBounds` have run.
 */
export interface ArcadeBody {
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  vy: number;
  prevX: number;
  prevY: number;
  blocked: Blocked;
}

/**
 * One physics step of `Body.update`: reset the blocked flags, remember the previous position,
 * apply gravity to the velocity (World.computeVelocity) and then move by the new velocity
 * (semi-implicit Euler).
 */
export function integrate(body: ArcadeBody, gravityY: number, dt: number): void {
  body.blocked.up = false;
  body.blocked.down = false;
  body.blocked.left = false;
  body.blocked.right = false;

  body.prevX = body.x;
  body.prevY = body.y;

  body.vy += gravityY * dt;

  body.x += body.vx * dt;
  body.y += body.vy * dt;
}

/**
 * `Body.checkWorldBounds` against (0, 0, width, height) with bounce 0. Phaser computes
 * `velocity *= -bounce`, which yields 0 (or -0); we store a plain 0.
 */
export function clampToBounds(body: ArcadeBody, width: number, height: number): void {
  if (body.x < 0) {
    body.x = 0;
    body.vx = 0;
    body.blocked.left = true;
  } else if (body.x + body.width > width) {
    body.x = width - body.width;
    body.vx = 0;
    body.blocked.right = true;
  }

  if (body.y < 0) {
    body.y = 0;
    body.vy = 0;
    body.blocked.up = true;
  } else if (body.y + body.height > height) {
    body.y = height - body.height;
    body.vy = 0;
    body.blocked.down = true;
  }
}
