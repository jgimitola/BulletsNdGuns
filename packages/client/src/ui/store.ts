import { createStore, type StoreApi } from 'zustand/vanilla';
import type { MatchResult } from '@bng/shared';

export type Screen = 'connecting' | 'loading' | 'menu' | 'level' | 'gameOver';

/**
 * Everything the HTML layer shows. Phaser scenes write here, React components read with selectors,
 * so neither side knows about the other.
 */
export interface UiState {
  screen: Screen;
  matchInProgress: boolean;
  /** Progress is 0..1; file is the key of the asset being loaded. */
  loading: { progress: number; file: string };
  hud: { ammo: number; coins: number };
  result: MatchResult | null;
  /** COMENZAR was clicked and the server was told this player is ready. */
  waiting: boolean;
  setScreen(screen: Screen): void;
  setLoading(progress: number, file: string): void;
  setHud(ammo: number, coins: number): void;
  setResult(result: MatchResult): void;
  showMatchInProgress(): void;
  ready(): void;
}

export type UiStore = StoreApi<UiState>;

export interface UiActions {
  sendReady(): void;
}

export function createUiStore(actions: UiActions): UiStore {
  return createStore<UiState>()((set, get) => ({
    screen: 'connecting',
    matchInProgress: false,
    loading: { progress: 0, file: '' },
    hud: { ammo: 0, coins: 0 },
    result: null,
    waiting: false,
    setScreen: (screen) => set({ screen }),
    setLoading: (progress, file) => set({ loading: { progress, file } }),
    setHud: (ammo, coins) => {
      // The level scene calls this every frame; only real changes may notify subscribers.
      const { hud } = get();
      if (hud.ammo === ammo && hud.coins === coins) return;
      set({ hud: { ammo, coins } });
    },
    setResult: (result) => set({ result, screen: 'gameOver' }),
    showMatchInProgress: () => set({ matchInProgress: true }),
    ready: () => {
      if (get().waiting) return;
      set({ waiting: true });
      actions.sendReady();
    },
  }));
}
