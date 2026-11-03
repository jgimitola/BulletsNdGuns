import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  nicknameKey,
  parseNickname,
  type MatchEndReason,
  type MatchResult,
  type NicknameError,
  type PlayerId,
  type RoomId,
  type RoomLobby,
} from '@bng/shared';
import { createEditorStore, type EditorSession, type EditorStore } from '../editor/editor-store.ts';
import { t, type Locale } from '../i18n/index.ts';
import type { AuthApi, AuthError, AuthResult } from '../net/auth-api.ts';
import type { ApiError, LevelsApi } from '../net/levels-api.ts';
import type { NicknameResponse, RoomResponse } from '../net/network-client.ts';

export type Screen =
  | 'connecting'
  | 'loading'
  | 'menu'
  | 'rooms'
  | 'lobby'
  | 'level'
  | 'gameOver'
  | 'myLevels'
  | 'editor'
  | 'editorTest';

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
  /** An account request (register, sign in, profile change) is waiting for the server. */
  authPending: boolean;
  authError: AuthError | null;
  /** The nickname a registered player took from this guest, until they pick another. */
  nicknameRevoked: string | null;
  /** The room this player is in, while on the lobby screen and during its match. */
  lobby: RoomLobby | null;
  /** A create or join request is waiting for the server. */
  roomPending: boolean;
  roomError: RoomActionError | null;
  result: { result: MatchResult; reason: MatchEndReason } | null;
  /** COMENZAR was clicked and the server was told this player is ready. */
  waiting: boolean;
  /** The open editing session, from the editor until it closes (testing included). */
  editor: EditorStore | null;
  /** Why the last My levels action failed, until My levels opens again. */
  myLevelsError: ApiError | null;
  /** Level reads and writes, for the screens that make them directly (My levels). */
  levelsApi: LevelsApi;
  setScreen(screen: Screen): void;
  setLoading(progress: number, file: string): void;
  setHud(ammo: number, coins: number): void;
  setPing(ping: number | null): void;
  setPlayerId(playerId: PlayerId): void;
  setLocale(locale: Locale): void;
  setNickname(nickname: string): void;
  /** Menu -> room list: accounts go straight there, guests first claim their nickname. */
  openRooms(): Promise<void>;
  createRoom(name: string, levelIds: string[]): Promise<void>;
  joinRoom(roomId: RoomId): Promise<void>;
  clearRoomError(): void;
  /** A lobby update from the server; ignored unless it is for the room this player is in. */
  setLobby(lobby: RoomLobby): void;
  leaveRoom(): void;
  ready(): void;
  setResult(result: MatchResult, reason: MatchEndReason): void;
  backToMenu(): void;
  setAccount(account: Account | null): void;
  /**
   * Account actions resolve to whether they succeeded, so a dialog knows to close. Register, sign
   * in and sign out reload the page: the socket must reconnect to carry the new session.
   */
  register(email: string, nickname: string, password: string): Promise<boolean>;
  signIn(email: string, password: string): Promise<boolean>;
  signOut(): Promise<boolean>;
  /** The new name applies from the next room; the current one keeps the old. */
  renameAccount(nickname: string): Promise<boolean>;
  changePassword(current: string, next: string): Promise<boolean>;
  clearAuthError(): void;
  /** The server took this guest's nickname for an account. */
  revokeNickname(nickname: string): void;
  /** Claims the nickname field after a revocation, staying on the current screen. */
  reclaimNickname(): Promise<void>;
  /** Signed-in players only; guests stay where they are. */
  openMyLevels(): void;
  /** A new level for null, else loads that level first. False when it could not load. */
  openEditor(levelId: string | null): Promise<boolean>;
  closeEditor(): void;
  /** Editing and testing the open session; ignored with no session. */
  setEditorScreen(screen: 'editor' | 'editorTest'): void;
  setMyLevelsError(error: ApiError | null): void;
}

export type UiStore = StoreApi<UiState>;

export interface UiActions {
  sendReady(): void;
  createRoom(name: string, levelIds: string[]): Promise<RoomResponse>;
  joinRoom(roomId: RoomId): Promise<RoomResponse>;
  leaveRoom(): void;
  claimNickname(nickname: string): Promise<NicknameResponse>;
  saveNickname(nickname: string): void;
  /** Switches the i18n module to `locale` and remembers it. */
  changeLocale(locale: Locale): void;
  auth: AuthApi;
  levels: LevelsApi;
  reload(): void;
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

    /** Key of the nickname a register request is pending with: a revocation of it is this player. */
    let registeringKey: string | null = null;

    /** Runs one account request; `onSuccess` runs only if it worked. */
    const authCall = async (
      request: () => Promise<AuthResult>,
      onSuccess: () => void,
    ): Promise<boolean> => {
      if (get().authPending) return false;
      set({ authPending: true, authError: null });
      const response = await request();
      set({ authPending: false, authError: response.ok ? null : response.error });
      if (response.ok) onSuccess();
      return response.ok;
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
      authPending: false,
      authError: null,
      nicknameRevoked: null,
      lobby: null,
      roomPending: false,
      roomError: null,
      result: null,
      waiting: false,
      editor: null,
      myLevelsError: null,
      levelsApi: actions.levels,
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
      createRoom: (name, levelIds) => enterRoom(() => actions.createRoom(name, levelIds)),
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
      setAccount: (account) => set({ account }),
      register: async (email, nickname, password) => {
        registeringKey = nicknameKey(nickname);
        try {
          return await authCall(
            () => actions.auth.register(email, nickname, password),
            actions.reload,
          );
        } finally {
          registeringKey = null;
        }
      },
      signIn: (email, password) =>
        authCall(() => actions.auth.signIn(email, password), actions.reload),
      signOut: () => authCall(() => actions.auth.signOut(), actions.reload),
      renameAccount: (nickname) => {
        const name = nickname.trim();
        return authCall(
          () => actions.auth.rename(name),
          () => {
            const account = get().account;
            if (account) set({ account: { ...account, nickname: name } });
          },
        );
      },
      changePassword: (current, next) =>
        authCall(
          () => actions.auth.changePassword(current, next),
          () => {},
        ),
      clearAuthError: () => set({ authError: null }),
      revokeNickname: (nickname) => {
        if (registeringKey !== null && registeringKey === nicknameKey(nickname)) return;
        set({ nicknameRevoked: nickname });
      },
      reclaimNickname: async () => {
        const nickname = parseNickname(get().nickname);
        if (nickname === null) {
          set({ nicknameError: 'invalid' });
          return;
        }
        const response = await actions.claimNickname(nickname);
        if (response.ok) set({ nicknameRevoked: null, nicknameError: null });
        else set({ nicknameError: response.error });
      },
      openMyLevels: () => {
        if (!get().account) return;
        set({ screen: 'myLevels', myLevelsError: null });
      },
      openEditor: async (levelId) => {
        if (!get().account) return false;
        let from: EditorSession | null = null;
        if (levelId !== null) {
          const result = await actions.levels.get(levelId);
          if (!result.ok) {
            set({ myLevelsError: result.error });
            return false;
          }
          const { id, name, published, data } = result.value;
          from = { levelId: id, name, published, data };
        }
        set({
          editor: createEditorStore(actions.levels, from, t('editor.defaultName')),
          screen: 'editor',
          myLevelsError: null,
        });
        return true;
      },
      closeEditor: () => set({ editor: null, screen: 'myLevels' }),
      setEditorScreen: (screen) => {
        if (get().editor) set({ screen });
      },
      setMyLevelsError: (myLevelsError) => set({ myLevelsError }),
    };
  });
}
