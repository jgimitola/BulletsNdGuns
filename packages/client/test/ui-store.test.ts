import { describe, expect, it, vi } from 'vitest';
import type { RoomLobby } from '@bng/shared';
import type { NicknameResponse, RoomResponse } from '../src/net/network-client.ts';
import { createUiStore, type UiActions } from '../src/ui/store.ts';

const lobby: RoomLobby = {
  id: 'r1',
  name: 'Sala de Ana',
  players: [{ id: 'a', nickname: 'Ana', ready: false }],
};

function setup(over: Partial<UiActions> = {}, nickname = 'Ana') {
  const actions: UiActions = {
    sendReady: vi.fn(),
    createRoom: vi.fn(async (): Promise<RoomResponse> => ({ ok: true, lobby })),
    joinRoom: vi.fn(async (): Promise<RoomResponse> => ({ ok: true, lobby })),
    leaveRoom: vi.fn(),
    claimNickname: vi.fn(
      async (nickname: string): Promise<NicknameResponse> => ({ ok: true, nickname }),
    ),
    saveNickname: vi.fn(),
    changeLocale: vi.fn(),
    ...over,
  };
  const store = createUiStore(actions, { nickname });
  return { store, actions };
}

describe('ui store', () => {
  it('starts on the connecting screen with the remembered nickname', () => {
    const s = setup().store.getState();
    expect(s).toMatchObject({
      screen: 'connecting',
      nickname: 'Ana',
      lobby: null,
      waiting: false,
      result: null,
    });
  });

  it('setNickname stores and saves the raw value', () => {
    const { store, actions } = setup();
    store.getState().setNickname(' Beto ');
    expect(store.getState().nickname).toBe(' Beto ');
    expect(actions.saveNickname).toHaveBeenCalledWith(' Beto ');
  });

  it('openRooms needs a valid nickname', async () => {
    const { store, actions } = setup({}, '   ');
    store.getState().setScreen('menu');
    await store.getState().openRooms();
    expect(store.getState().screen).toBe('menu');
    expect(actions.claimNickname).not.toHaveBeenCalled();
    store.getState().setNickname('Ana');
    await store.getState().openRooms();
    expect(store.getState().screen).toBe('rooms');
  });

  it('a guest claims the trimmed nickname before seeing the rooms', async () => {
    const { store, actions } = setup({}, ' Ana ');
    store.getState().setScreen('menu');
    await store.getState().openRooms();
    expect(actions.claimNickname).toHaveBeenCalledWith('Ana');
    expect(store.getState().screen).toBe('rooms');
  });

  it('a refused claim stays on the menu with the reason, until the nickname changes', async () => {
    const { store } = setup({
      claimNickname: vi.fn(
        async (): Promise<NicknameResponse> => ({ ok: false, error: 'taken' }),
      ),
    });
    store.getState().setScreen('menu');
    await store.getState().openRooms();
    expect(store.getState()).toMatchObject({ screen: 'menu', nicknameError: 'taken' });
    store.getState().setNickname('Beto');
    expect(store.getState().nicknameError).toBeNull();
  });

  it('a signed-in player goes to the rooms without claiming', async () => {
    const { store, actions } = setup({}, '');
    store.getState().setScreen('menu');
    store.setState({ account: { email: 'a@b.co', nickname: 'Ana' } });
    await store.getState().openRooms();
    expect(actions.claimNickname).not.toHaveBeenCalled();
    expect(store.getState().screen).toBe('rooms');
  });

  it('createRoom sends the room name and enters the lobby', async () => {
    const { store, actions } = setup({}, ' Ana ');
    await store.getState().createRoom('Sala de Ana');
    expect(actions.createRoom).toHaveBeenCalledWith('Sala de Ana');
    expect(store.getState()).toMatchObject({ screen: 'lobby', lobby, roomPending: false });
  });

  it('joinRoom failure shows the error and stays put', async () => {
    const { store, actions } = setup({
      joinRoom: vi.fn(async (): Promise<RoomResponse> => ({ ok: false, error: 'inProgress' })),
    });
    store.getState().setScreen('rooms');
    await store.getState().joinRoom('r1');
    expect(store.getState()).toMatchObject({
      screen: 'rooms',
      lobby: null,
      roomError: 'inProgress',
      roomPending: false,
    });
    expect(actions.leaveRoom).not.toHaveBeenCalled();
  });

  it('a request with no answer leaves whatever room the server may have joined', async () => {
    const { store, actions } = setup({
      createRoom: vi.fn(async (): Promise<RoomResponse> => ({ ok: false, error: 'noResponse' })),
    });
    await store.getState().createRoom('Sala');
    expect(store.getState().roomError).toBe('noResponse');
    expect(actions.leaveRoom).toHaveBeenCalledTimes(1);
  });

  it('ignores a second request while one is pending', async () => {
    const { store, actions } = setup();
    const first = store.getState().joinRoom('r1');
    void store.getState().joinRoom('r1');
    await first;
    expect(actions.joinRoom).toHaveBeenCalledTimes(1);
  });

  it('setLobby only updates the room this player is in', async () => {
    const { store } = setup();
    store.getState().setLobby(lobby);
    expect(store.getState().lobby).toBeNull();
    await store.getState().joinRoom('r1');
    const updated = {
      ...lobby,
      players: [...lobby.players, { id: 'b', nickname: 'B', ready: true }],
    };
    store.getState().setLobby({ ...updated, id: 'other' });
    expect(store.getState().lobby).toEqual(lobby);
    store.getState().setLobby(updated);
    expect(store.getState().lobby).toEqual(updated);
  });

  it('ready() sends ready once, only in a room, and marks waiting', async () => {
    const { store, actions } = setup();
    store.getState().ready();
    expect(actions.sendReady).not.toHaveBeenCalled();
    await store.getState().joinRoom('r1');
    store.getState().ready();
    store.getState().ready();
    expect(actions.sendReady).toHaveBeenCalledTimes(1);
    expect(store.getState().waiting).toBe(true);
  });

  it('leaveRoom tells the server and returns to the room list', async () => {
    const { store, actions } = setup();
    await store.getState().joinRoom('r1');
    store.getState().ready();
    store.getState().leaveRoom();
    expect(actions.leaveRoom).toHaveBeenCalledTimes(1);
    expect(store.getState()).toMatchObject({ screen: 'rooms', lobby: null, waiting: false });
  });

  it('setResult shows the result and forgets the closed room', async () => {
    const { store } = setup();
    await store.getState().joinRoom('r1');
    store.getState().ready();
    store.getState().setResult('win', 'rivalsLeft');
    expect(store.getState()).toMatchObject({
      screen: 'gameOver',
      result: { result: 'win', reason: 'rivalsLeft' },
      lobby: null,
      waiting: false,
    });
  });

  it('backToMenu clears the result', () => {
    const { store } = setup();
    store.getState().setResult('tie', 'completed');
    store.getState().backToMenu();
    expect(store.getState()).toMatchObject({ screen: 'menu', result: null });
  });

  it('setHud does not notify when values are unchanged', () => {
    const { store } = setup();
    const listener = vi.fn();
    store.subscribe(listener);
    store.getState().setHud(12, 3);
    store.getState().setHud(12, 3);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getState().hud).toEqual({ ammo: 12, coins: 3 });
  });

  it('setLoading stores progress and file', () => {
    const { store } = setup();
    store.getState().setLoading(0.5, 'coin');
    expect(store.getState().loading).toEqual({ progress: 0.5, file: 'coin' });
  });
});

describe('ui store locale', () => {
  it('starts with the given locale and switches through changeLocale once per change', () => {
    const actions: UiActions = {
      sendReady: vi.fn(),
      createRoom: vi.fn(),
      joinRoom: vi.fn(),
      claimNickname: vi.fn(),
      leaveRoom: vi.fn(),
      saveNickname: vi.fn(),
      changeLocale: vi.fn(),
    };
    const store = createUiStore(actions, { locale: 'en' });
    expect(store.getState().locale).toBe('en');
    store.getState().setLocale('en');
    expect(actions.changeLocale).not.toHaveBeenCalled();
    store.getState().setLocale('es');
    expect(actions.changeLocale).toHaveBeenCalledWith('es');
    expect(store.getState().locale).toBe('es');
  });
});

describe('ui store ping', () => {
  it('starts unknown and only notifies on a change', () => {
    const store = createUiStore({
      sendReady: vi.fn(),
      createRoom: vi.fn(),
      joinRoom: vi.fn(),
      claimNickname: vi.fn(),
      leaveRoom: vi.fn(),
      saveNickname: vi.fn(),
      changeLocale: vi.fn(),
    });
    expect(store.getState().ping).toBeNull();
    const listener = vi.fn();
    store.subscribe(listener);
    store.getState().setPing(42);
    store.getState().setPing(42);
    store.getState().setPing(null);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.getState().ping).toBeNull();
  });
});
