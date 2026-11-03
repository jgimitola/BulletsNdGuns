import Phaser from 'phaser';
import {
  LEVEL_BACKGROUND,
  MAX_CATCH_UP_TICKS,
  TICK_MS,
  TILE_HEIGHT,
  TILE_WIDTH,
  TILESET_NAME,
} from '@bng/shared';
import { SoundKey, TextureKey } from '../assets/manifest.ts';
import { TestRun } from '../editor/test-run.ts';
import { KeyboardInput } from '../input/keyboard-input.ts';
import { BulletViews } from '../render/bullet-views.ts';
import { Depth } from '../render/depth.ts';
import { toPhaserRows } from '../render/level-tiles.ts';
import { PickupViews } from '../render/pickup-views.ts';
import { PlayerView } from '../render/player-view.ts';
import { getServices } from '../services.ts';
import type { UiStore } from '../ui/store.ts';

const SFX_VOLUME = 0.15;

interface TestSession {
  ui: UiStore;
  run: TestRun;
  input: KeyboardInput;
  player: PlayerView;
  bullets: BulletViews;
  pickups: PickupViews;
  jumpSound: Phaser.Sound.BaseSound;
  shotSound: Phaser.Sound.BaseSound;
  accumulator: number;
}

/**
 * The editor's Test: the level being edited, played alone with the shared simulation and no
 * server. Esc goes back to the editor (which was never touched); R starts over.
 */
export class TestScene extends Phaser.Scene {
  private session: TestSession | undefined;

  constructor() {
    super('test');
  }

  create(): void {
    this.session = undefined;
    const { ui } = getServices(this);
    const editor = ui.getState().editor;
    if (!editor) {
      this.scene.start('menu');
      return;
    }
    let run: TestRun;
    try {
      run = new TestRun(editor.getState().data);
    } catch {
      // The toolbar only offers Test for a playable level; anything else goes straight back.
      ui.getState().setEditorScreen('editor');
      this.scene.start('editor');
      return;
    }

    this.cameras.main.setBackgroundColor(LEVEL_BACKGROUND);
    this.createTiles(run);
    this.add
      .image(run.level.portal.x, run.level.portal.y, TextureKey.portal)
      .setDepth(Depth.portal);
    const me = run.world.players[0]!;
    const session: TestSession = {
      ui,
      run,
      input: new KeyboardInput(this),
      player: new PlayerView(
        this,
        'player',
        me,
        ui.getState().account?.nickname ?? '',
        Depth.localPlayer,
        Depth.nicknames,
      ),
      bullets: new BulletViews(this, Depth.ownBullets),
      pickups: new PickupViews(this, run.level, Depth.pickups),
      jumpSound: this.sound.add(SoundKey.jump, { volume: SFX_VOLUME, loop: false }),
      shotSound: this.sound.add(SoundKey.shot, { volume: SFX_VOLUME, loop: false }),
      accumulator: 0,
    };
    this.session = session;
    this.render(session);

    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.key === 'Escape') ui.getState().setEditorScreen('editor');
      // A fresh scene is the simplest full reset: pickups, bullets and views all come back.
      else if (event.key.toLowerCase() === 'r') this.scene.restart();
    };
    window.addEventListener('keydown', onKey);
    const unsubscribe = ui.subscribe((state) => {
      if (state.editor !== editor) this.scene.start('menu');
      else if (state.screen === 'editor') this.scene.start('editor');
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', onKey);
      unsubscribe();
      // Sounds belong to the game-wide manager, so each run removes its own.
      session.jumpSound.destroy();
      session.shotSound.destroy();
      this.session = undefined;
    });
  }

  update(_time: number, delta: number): void {
    const session = this.session;
    if (!session) return;
    // Fixed 60 Hz steps, as in the level scene. A long stall is not replayed.
    session.accumulator = Math.min(session.accumulator + delta, MAX_CATCH_UP_TICKS * TICK_MS);
    while (session.accumulator >= TICK_MS) {
      session.accumulator -= TICK_MS;
      for (const event of session.run.step(session.input.read())) {
        if (event.type === 'jumped') session.jumpSound.play();
        else if (event.type === 'shot') session.shotSound.play();
      }
    }
    this.render(session);
  }

  private createTiles(run: TestRun): void {
    const map = this.make.tilemap({
      data: toPhaserRows(run.level.data),
      tileWidth: TILE_WIDTH,
      tileHeight: TILE_HEIGHT,
    });
    const tileset = map.addTilesetImage(
      TILESET_NAME,
      TextureKey.levelTiles,
      TILE_WIDTH,
      TILE_HEIGHT,
      0,
      0,
      1,
    );
    if (!tileset) throw new Error(`Texture ${TextureKey.levelTiles} is missing`);
    const layer = map.createLayer(0, tileset, 0, 0);
    if (!(layer instanceof Phaser.Tilemaps.TilemapLayer)) {
      throw new Error('The level tile layer could not be created');
    }
    layer.setDepth(Depth.platforms);
  }

  private render(session: TestSession): void {
    const { run } = session;
    const me = run.world.players[0]!;
    session.player.update(me);
    session.bullets.sync(run.world.bullets);
    session.pickups.sync(
      run.world.ammoPickups.map((p) => p.id),
      run.world.coins.map((c) => c.id),
    );
    // Both setters only notify the HTML layer when a value changes.
    session.ui.getState().setHud(me.ammo, me.score);
    const { collected, total } = run.coins;
    session.ui.getState().setTestStatus({
      completed: run.outcome === 'completed',
      coins: collected,
      totalCoins: total,
    });
  }
}
