/**
 * Draw order of the original level scene, which came from creation order: local player, other
 * players, platforms, ammo pickups, coins, own bullets, other bullets, portal. Views here are
 * created on demand, so the order is pinned with depths instead.
 */
export const Depth = {
  localPlayer: 1,
  remotePlayers: 2,
  platforms: 3,
  pickups: 4,
  ownBullets: 5,
  remoteBullets: 6,
  portal: 7,
  /** Not in the original: names stay readable over everything else. */
  nicknames: 8,
  /** Debug overlay (dev only): over everything, so it never hides behind what it explains. */
  debug: 9,
} as const;
