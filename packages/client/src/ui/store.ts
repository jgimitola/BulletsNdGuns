import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  parseNickname,
  type MatchEndReason,
  type MatchResult,
  type NicknameError,
  type PlayerId,
  type RoomId,
  type RoomLobby,
} from '@bng/shared';
import type { Locale } from '../i18n/index.ts';
import type { NicknameResponse, RoomResponse } from '../net/network-client.ts';

export type Screen = 'connecting' | 'loading' | 'menu' | 'rooms' | 'lobby' | 'level' | 'gameOver';

export type RoomActionError = Extract<RoomResponse, { ok: false }>['error'];

export type NicknameClaimError = NicknameError | 'noResponse';

/** The signed-in player. */
export interface Account {
  email: string;
  nickname: string;
}

/**
 * Everything the HTML layer shows. Phaser scenes write here, React components read with selectors,
 * so neither side knows about the other.
 */
export interface UiState {
  screen: Screen;
  /** Progress is 0..1; file is the key of the asset being loaded. */
  loading: { progress: number; file: string };
  hud: { ammo: number; coins: number };
  /** Averaged round trip to the server in ms; null before the first answer or after a lost probe. */
  ping: number | null;
  /** This player's socket id, once connected. */
  playerId: PlayerId | null;
  /** Language of every text; components re-render when it changes. */
  locale: Locale;
  /** The nickname field as typed; `parseNickname` decides whether it can be used. */
  nickname: string;
  /** Why the server refused the guest nickname, until the field changes. */
  nicknameError: NicknameClaimError | null;
  /** Null for guests. */
  account: Account | null;
  /** The room this player is in, while on the lobby screen and during its match. */
  lobby: RoomLobby | null;
  /** A create or join request is waiting for the server. */
  roomPending: boolean;
  roomError: RoomActionError | null;
  result: { result: MatchResult; reason: MatchEndReason } | null;
  /** COMENZAR was clicked and the server was told this player is ready. */
  waiting: boolean;
  setScreen(screen: Screen): void;
  setLoading(progress: number, file: string): void;
  setHud(ammo: number, coins: number): void;
  setPing(ping: number | null): void;
  setPlayerId(playerId: PlayerId): void;
  setLocale(locale: Locale): void;
  setNickname(nickname: string): void;
  /** Menu -> room list: accounts go straight there, guests first claim their nickname. */
  openRooms(): Promise<void>;
  createRoom(name: string): Promise<void>;
  joinRoom(roomId: RoomId): Promise<void>;
  clearRoomError(): void;
  /** A lobby update from the server; ignored unless it is for the room this player is in. */
  setLobby(lobby: RoomLobby): void;
  leaveRoom(): void;
  ready(): void;
  setResult(result: MatchResult, reason: MatchEndReason): void;
  backToMenu(): void;
}

export type UiStore = StoreApi<UiState>;

export interface UiActions {
  sendReady(): void;
  createRoom(name: string): Promise<RoomResponse>;
  joinRoom(roomId: RoomId): Promise<RoomResponse>;
  leaveRoom(): void;
  claimNickname(nickname: string): Promise<NicknameResponse>;
  saveNickname(nickname: string): void;
  /** Switches the i18n module to `locale` and remembers it. */
  changeLocale(locale: Locale): void;
}

export function createUiStore(
  actions: UiActions,
  initial: { nickname?: string; locale?: Locale } = {},
): UiStore {
  return createStore<UiState>()((set, get) => {
    /** Runs one create/join request and moves to the lobby on success. */
    const enterRoom = async (request: () => Promise<RoomResponse>) => {
      if (get().roomPending) return;
      set({ roomPending: true, roomError: null });
      const response = await request();
      if (response.ok) {
        set({ roomPending: false, lobby: response.lobby, waiting: false, screen: 'lobby' });
        return;
      }
      // Without an answer the server may still have put this player in the room: leave it.
      if (response.error === 'noResponse') actions.leaveRoom();
      set({ roomPending: false, roomError: response.error });
    };

    return {
      screen: 'connecting',
      loading: { progress: 0, file: '' },
      hud: { ammo: 0, coins: 0 },
      ping: null,
      playerId: null,
      locale: initial.locale ?? 'es',
      nickname: initial.nickname ?? '',
      nicknameError: null,
      account: null,
      lobby: null,
      roomPending: false,
      roomError: null,
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
      setPing: (ping) => {
        if (get().ping !== ping) set({ ping });
      },
      setPlayerId: (playerId) => set({ playerId }),
      setLocale: (locale) => {
        if (get().locale === locale) return;
        actions.changeLocale(locale);
        set({ locale });
      },
      setNickname: (nickname) => {
        set({ nickname, nicknameError: null });
        actions.saveNickname(nickname);
      },
      openRooms: async () => {
        if (!get().account) {
          const nickname = parseNickname(get().nickname);
          if (nickname === null) return;
          const response = await actions.claimNickname(nickname);
          if (!response.ok) {
            set({ nicknameError: response.error });
            return;
          }
        }
        set({ screen: 'rooms', roomError: null });
      },
      createRoom: (name) => enterRoom(() => actions.createRoom(name)),
      joinRoom: (roomId) => enterRoom(() => actions.joinRoom(roomId)),
      clearRoomError: () => set({ roomError: null }),
      setLobby: (lobby) => {
        if (get().lobby?.id === lobby.id) set({ lobby });
      },
      leaveRoom: () => {
        if (!get().lobby) return;
        actions.leaveRoom();
        set({ lobby: null, waiting: false, screen: 'rooms' });
      },
      ready: () => {
        if (get().waiting || !get().lobby) return;
        set({ waiting: true });
        actions.sendReady();
      },
      // The server closed the room: it is gone for this player too.
      setResult: (result, reason) =>
        set({ result: { result, reason }, lobby: null, waiting: false, screen: 'gameOver' }),
      backToMenu: () =>
        set({ screen: 'menu', result: null, lobby: null, waiting: false, roomError: null }),
    };
  });
}
