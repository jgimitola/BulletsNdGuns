import Phaser from 'phaser';
import {
  getLevel,
  INTERPOLATION_DELAY_MS,
  LEVEL_BACKGROUND,
  MAX_CATCH_UP_TICKS,
  PLATFORM_LAYER,
  TICK_MS,
  TILESET_NAME,
  type PlayerId,
  type PlayerState,
  type Snapshot,
} from '@bng/shared';
import { SoundKey, TextureKey } from '../assets/manifest.ts';
import { KeyboardInput } from '../input/keyboard-input.ts';
import type { NetworkClient } from '../net/network-client.ts';
import { OwnBulletTracker } from '../net/own-bullets.ts';
import { LocalPlayerPredictor } from '../net/prediction.ts';
import { RemoteShotTracker } from '../net/remote-shots.ts';
import { SnapshotBuffer } from '../net/snapshot-buffer.ts';
import { BulletViews } from '../render/bullet-views.ts';
import { Depth } from '../render/depth.ts';
import { Hud } from '../render/hud.ts';
import { PickupViews } from '../render/pickup-views.ts';
import { PlayerView } from '../render/player-view.ts';
import { getServices } from '../services.ts';

export interface LevelSceneData {
  levelIndex: number;
  snapshot: Snapshot;
}

const SFX_VOLUME = 0.15;

/** Everything one run of the scene owns; rebuilt on every start, so a restart never sees stale state. */
interface LevelSession {
  network: NetworkClient;
  playerId: PlayerId;
  input: KeyboardInput;
  predictor: LocalPlayerPredictor;
  buffer: SnapshotBuffer;
  ownBullets: OwnBulletTracker;
  remoteShots: RemoteShotTracker;
  localView: PlayerView;
  remoteViews: Map<PlayerId, PlayerView>;
  ownBulletViews: BulletViews;
  remoteBulletViews: BulletViews;
  pickups: PickupViews;
  hud: Hud;
  jumpSound: Phaser.Sound.BaseSound;
  shotSound: Phaser.Sound.BaseSound;
  accumulator: number;
}

export class LevelScene extends Phaser.Scene {
  private startData: LevelSceneData | undefined;
  private session: LevelSession | undefined;

  constructor() {
    super('level');
  }

  init(data: LevelSceneData): void {
    this.startData = data;
    this.session = undefined;
  }

  create(): void {
    const data = this.startData;
    if (!data) throw new Error('Level scene started without level data');
    const { levelIndex, snapshot } = data;
    const { network } = getServices(this);
    const playerId = network.playerId;
    const me = snapshot.players.find((p) => p.id === playerId);
    if (playerId === undefined || !me) throw new Error('Local player is missing from the level');
    const level = getLevel(levelIndex);

    this.cameras.main.setBackgroundColor(LEVEL_BACKGROUND);
    const jumpSound = this.sound.add(SoundKey.jump, { volume: SFX_VOLUME, loop: false });
    const shotSound = this.sound.add(SoundKey.shot, { volume: SFX_VOLUME, loop: false });

    const map = this.make.tilemap({ key: level.tilemapKey });
    const tileset = map.addTilesetImage(TILESET_NAME, TextureKey.levelTiles);
    if (!tileset) throw new Error(`Tileset ${TILESET_NAME} is missing from ${level.tilemapKey}`);
    const platforms = map.createLayer(PLATFORM_LAYER, tileset, 0, 0, false);
    if (!(platforms instanceof Phaser.Tilemaps.TilemapLayer)) {
      throw new Error(`Layer ${PLATFORM_LAYER} is missing from ${level.tilemapKey}`);
    }
    platforms.setDepth(Depth.platforms);

    this.add.image(level.portal.x, level.portal.y, TextureKey.portal).setDepth(Depth.portal);

    const buffer = new SnapshotBuffer(levelIndex);
    buffer.push(snapshot, performance.now());

    const session: LevelSession = {
      network,
      playerId,
      input: new KeyboardInput(this),
      // Seq numbering carries on from the previous level: the server rejects anything not above it.
      predictor: new LocalPlayerPredictor(playerId, levelIndex, me, network.lastInputSeq + 1),
      buffer,
      ownBullets: new OwnBulletTracker(playerId, levelIndex),
      remoteShots: new RemoteShotTracker(playerId, levelIndex),
      localView: new PlayerView(this, 'player', me, Depth.localPlayer),
      remoteViews: new Map(),
      ownBulletViews: new BulletViews(this, Depth.ownBullets),
      remoteBulletViews: new BulletViews(this, Depth.remoteBullets),
      pickups: new PickupViews(this, level, Depth.pickups),
      hud: new Hud(this, me.ammo, me.score, Depth.hud),
      jumpSound,
      shotSound,
      accumulator: 0,
    };
    this.session = session;
    this.render(session);

    const unsubscribers = [
      network.on('snapshot', (s) => {
        if (s.levelIndex !== levelIndex) return;
        session.predictor.reconcile(s);
        session.ownBullets.reconcile(s);
        const now = performance.now();
        session.buffer.push(s, now);
        session.remoteShots.push(s, now);
      }),
      network.on('levelStarted', (payload) => {
        this.scene.start('level', payload);
      }),
      network.on('matchEnded', (payload) => {
        this.scene.start('game-over', payload);
      }),
    ];
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const unsubscribe of unsubscribers) unsubscribe();
      // Sounds belong to the game-wide manager, so each run removes its own or they pile up.
      jumpSound.destroy();
      shotSound.destroy();
      this.session = undefined;
    });
  }

  update(_time: number, delta: number): void {
    const session = this.session;
    if (!session) return;
    // Fixed 60 Hz steps, one input frame each, like the server. A long stall is not replayed.
    session.accumulator = Math.min(session.accumulator + delta, MAX_CATCH_UP_TICKS * TICK_MS);
    while (session.accumulator >= TICK_MS) {
      session.accumulator -= TICK_MS;
      this.step(session);
    }
    this.render(session);
  }

  private step(session: LevelSession): void {
    const { frame, jumped, bullet } = session.predictor.applyInput(session.input.read());
    session.network.sendInput(frame);
    session.ownBullets.step();
    if (bullet) session.ownBullets.spawn(bullet);
    if (jumped) session.jumpSound.play();
    if (bullet) session.shotSound.play();
  }

  private render(session: LevelSession): void {
    const local = session.predictor.state;
    session.localView.update(local);
    session.ownBulletViews.sync(session.ownBullets.bullets);
    session.hud.update(local.ammo, local.score);

    // The buffer starts with the level's initial snapshot, so this only fails if that was never pushed.
    const renderAt = performance.now() - INTERPOLATION_DELAY_MS;
    if (session.remoteShots.takeDue(renderAt) > 0) session.shotSound.play();
    const sampled = session.buffer.sample(renderAt);
    if (!sampled) return;
    this.syncRemotePlayers(
      session,
      sampled.players.filter((p) => p.id !== session.playerId),
    );
    session.remoteBulletViews.sync(sampled.bullets.filter((b) => b.ownerId !== session.playerId));
    session.pickups.sync(sampled.latest.ammoPickupIds, sampled.latest.coinIds);
  }

  private syncRemotePlayers(session: LevelSession, players: readonly PlayerState[]): void {
    const live = new Set<PlayerId>();
    for (const p of players) {
      live.add(p.id);
      const view = session.remoteViews.get(p.id);
      if (view) view.update(p);
      else session.remoteViews.set(p.id, new PlayerView(this, 'enemy', p, Depth.remotePlayers));
    }
    for (const [id, view] of session.remoteViews) {
      if (live.has(id)) continue;
      view.destroy();
      session.remoteViews.delete(id);
    }
  }
}
