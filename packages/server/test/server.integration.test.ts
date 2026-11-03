import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  InputFrame,
  LevelStarted,
  MatchEnded,
  RoomLobby,
  RoomSummary,
  ServerToClientEvents,
  Snapshot,
} from '@bng/shared';
import { CLASSIC_LEVELS, type LevelData, type LevelDetail, type LevelPage } from '@bng/shared';
import { loadConfig, type ServerConfig } from '../src/config.ts';
import { startServer } from '../src/index.ts';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let server: Awaited<ReturnType<typeof startServer>>;
let clients: Client[] = [];
let timers: ReturnType<typeof setInterval>[] = [];

const url = (): string => `http://localhost:${server.port}`;

function testConfig(): ServerConfig {
  return {
    ...loadConfig({ NODE_ENV: 'development' }),
    port: 0,
    clientDist: 'does-not-exist',
    databasePath: ':memory:',
  };
}

/** Registers an account over HTTP; returns its session cookie. */
async function register(nickname: string, email = `${nickname}@bng.test`): Promise<string> {
  const res = await fetch(`${url()}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      password: 'password123',
      name: nickname,
      username: nickname,
      displayUsername: nickname,
    }),
  });
  if (!res.ok) throw new Error(`register ${nickname}: ${res.status} ${await res.text()}`);
  return (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
}

/** `cookie` is a session cookie, for a client that belongs to an account. */
function newClient(cookie?: string): Client {
  const c: Client = connect(url(), {
    transports: ['websocket'],
    forceNew: true,
    ...(cookie ? { extraHeaders: { cookie } } : {}),
  });
  clients.push(c);
  return c;
}

/** A connected client signed in as a newly registered account. */
async function account(nickname: string): Promise<Client> {
  return connected(newClient(await register(nickname)));
}

/** A connected guest that has claimed `nickname`. */
async function guest(nickname: string): Promise<Client> {
  const c = await connected(newClient());
  const claimed = await c.emitWithAck('claimNickname', { nickname });
  if (!claimed.ok) throw new Error(`claim ${nickname}: ${claimed.error}`);
  return c;
}

function once<T>(c: Client, event: string): Promise<T> {
  return new Promise((resolve) => {
    (c as Socket).once(event, (v: T) => resolve(v));
  });
}

beforeEach(async () => {
  server = await startServer(testConfig());
});

afterEach(async () => {
  for (const t of timers) clearInterval(t);
  timers = [];
  for (const c of clients) c.disconnect();
  clients = [];
  await server.close();
});

async function connected(c: Client): Promise<Client> {
  if (!c.connected) await once(c, 'connect');
  return c;
}

/** a (an account) creates a room, b joins it. Returns the room id. */
async function sharedRoom(a: Client, b: Client): Promise<string> {
  const created = await a.emitWithAck('createRoom', { name: 'Sala' });
  if (!created.ok) throw new Error(created.error);
  const joined = await b.emitWithAck('joinRoom', { roomId: created.lobby.id });
  if (!joined.ok) throw new Error(joined.error);
  return created.lobby.id;
}

async function startMatch(a: Client, b: Client): Promise<string> {
  const roomId = await sharedRoom(a, b);
  const started = Promise.all([once(a, 'levelStarted'), once(b, 'levelStarted')]);
  a.emit('ready');
  b.emit('ready');
  await started;
  return roomId;
}

async function listRooms(): Promise<RoomSummary[]> {
  const res = await fetch(`${url()}/api/rooms`);
  return ((await res.json()) as { rooms: RoomSummary[] }).rooms;
}

describe('accounts over HTTP', () => {
  test('registering returns a session cookie that get-session reads', async () => {
    const cookie = await register('Ana');
    expect(cookie).toMatch(/^better-auth.session_token=/);
    const res = await fetch(`${url()}/api/auth/get-session`, { headers: { cookie } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { user: { displayUsername: string } }).user.displayUsername).toBe(
      'Ana',
    );
  });

  test('other /api paths are still a JSON 404', async () => {
    const res = await fetch(`${url()}/api/nope`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'notFound' });
  });

  test.each([
    ['GET', '/verify-email?token=x'],
    ['POST', '/send-verification-email'],
    ['POST', '/change-email'],
    ['POST', '/request-password-reset'],
    ['POST', '/reset-password'],
    ['POST', '/delete-user'],
  ])('better-auth endpoints the game does not use are off: %s %s', async (method, path) => {
    const res = await fetch(`${url()}/api/auth${path}`, {
      method,
      headers: method === 'POST' ? { 'content-type': 'application/json' } : {},
      body: method === 'POST' ? '{}' : undefined,
    });
    expect(res.status).toBe(404);
  });

  test('an oversized auth request is refused before it is read', async () => {
    const res = await fetch(`${url()}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.co', password: 'x'.repeat(100_000), name: 'A' }),
    });
    expect(res.status).toBe(413);
  });
});

/** A JSON call to the levels API as the holder of `cookie` (a guest without one). */
async function api(
  method: string,
  path: string,
  cookie?: string,
  body?: unknown,
): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${url()}/api/levels${path}`, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: text ? (JSON.parse(text) as unknown) : null };
}

const levelData: LevelData = CLASSIC_LEVELS[0]!.data;
const levelOf = (json: unknown) => (json as { level: LevelDetail }).level;

describe('levels API', () => {
  test('lists the classics first, for guests too', async () => {
    const { status, json } = await api('GET', '/');
    expect(status).toBe(200);
    const page = json as LevelPage;
    expect(page.levels.map((l) => l.id)).toEqual(['classic-1', 'classic-2', 'classic-3']);
    expect(page.nextOffset).toBeNull();
  });

  test('guests cannot write', async () => {
    const { status, json } = await api('POST', '/', undefined, { name: 'Torre', data: levelData });
    expect(status).toBe(401);
    expect(json).toEqual({ error: 'signInRequired' });
  });

  test('an author creates, edits, publishes and deletes; others only read', async () => {
    const ana = await register('Ana');
    const beto = await register('Beto');
    const created = await api('POST', '/', ana, { name: 'Torre', data: levelData });
    expect(created.status).toBe(201);
    const id = levelOf(created.json).id;
    expect((await api('GET', `/${id}`, beto)).status).toBe(404);
    const renamed = await api('PUT', `/${id}`, ana, { name: 'Torre 2', data: levelData });
    expect(renamed.status).toBe(200);
    expect(levelOf(renamed.json).name).toBe('Torre 2');
    expect(levelOf((await api('POST', `/${id}/publish`, ana)).json).published).toBe(true);
    expect((await api('GET', `/${id}`, beto)).status).toBe(200);
    const stolen = await api('PUT', `/${id}`, beto, { name: 'Mine', data: levelData });
    expect(stolen).toEqual({ status: 403, json: { error: 'forbidden' } });
    expect((await api('POST', `/${id}/duplicate`, beto)).status).toBe(201);
    expect(levelOf((await api('POST', `/${id}/unpublish`, ana)).json).published).toBe(false);
    expect((await api('DELETE', `/${id}`, ana)).status).toBe(204);
    expect((await api('GET', `/${id}`, ana)).status).toBe(404);
  });

  test('refuses invalid data and an oversized body', async () => {
    const ana = await register('Ana');
    expect(await api('POST', '/', ana, { name: '', data: levelData })).toEqual({
      status: 400,
      json: { error: 'invalid' },
    });
    const big = await api('POST', '/', ana, {
      name: 'Torre',
      data: levelData,
      pad: 'x'.repeat(40_000),
    });
    expect(big.status).toBe(413);
  });

  test('publishing an unplayable level is a 409', async () => {
    const ana = await register('Ana');
    const draft = await api('POST', '/', ana, {
      name: 'Torre',
      data: { ...levelData, portal: null },
    });
    const id = levelOf(draft.json).id;
    expect(await api('POST', `/${id}/publish`, ana)).toEqual({
      status: 409,
      json: { error: 'notPublishable' },
    });
  });

  test('writes are rate-limited per account', async () => {
    const ana = await register('Ana');
    const id = levelOf((await api('POST', '/', ana, { name: 'Torre', data: levelData })).json).id;
    const statuses: number[] = [];
    for (let i = 0; i < 20; i++) {
      statuses.push((await api('PUT', `/${id}`, ana, { name: `T${i}`, data: levelData })).status);
    }
    expect(statuses.at(-1)).toBe(429);
    expect(statuses.filter((s) => s === 200)).toHaveLength(19);
  });
});

describe('nicknames and permissions', () => {
  test('a guest cannot create a room', async () => {
    const g = await guest('Beto');
    expect(await g.emitWithAck('createRoom', { name: 'Sala' })).toEqual({
      ok: false,
      error: 'signInRequired',
    });
  });

  test('a guest must claim a nickname before joining', async () => {
    const a = await account('Ana');
    const created = await a.emitWithAck('createRoom', { name: 'Sala' });
    if (!created.ok) throw new Error(created.error);
    const g = await connected(newClient());
    expect(await g.emitWithAck('joinRoom', { roomId: created.lobby.id })).toEqual({
      ok: false,
      error: 'noNickname',
    });
  });

  test('two guests cannot share a nickname, whatever the case', async () => {
    await guest('Beto');
    const other = await connected(newClient());
    expect(await other.emitWithAck('claimNickname', { nickname: 'beto' })).toEqual({
      ok: false,
      error: 'taken',
    });
  });

  test("a guest cannot take a registered account's nickname, even offline", async () => {
    await register('Ana');
    const g = await connected(newClient());
    expect(await g.emitWithAck('claimNickname', { nickname: 'ANA' })).toEqual({
      ok: false,
      error: 'taken',
    });
  });

  test('an account socket cannot claim a guest nickname', async () => {
    const a = await account('Ana');
    expect(await a.emitWithAck('claimNickname', { nickname: 'Otro' })).toEqual({
      ok: false,
      error: 'invalid',
    });
  });

  test("registering a guest's nickname revokes it, and the guest must pick another", async () => {
    const host = await account('Ana');
    const created = await host.emitWithAck('createRoom', { name: 'Sala' });
    if (!created.ok) throw new Error(created.error);
    const g = await guest('Cid');
    const revoked = once<string>(g, 'nicknameRevoked');
    await register('cid');
    expect(await revoked).toBe('Cid');
    expect(await g.emitWithAck('joinRoom', { roomId: created.lobby.id })).toEqual({
      ok: false,
      error: 'noNickname',
    });
    expect((await g.emitWithAck('claimNickname', { nickname: 'Cid2' })).ok).toBe(true);
    expect((await g.emitWithAck('joinRoom', { roomId: created.lobby.id })).ok).toBe(true);
  });

  test('mid-match, a revoked guest keeps the old name inside the match', async () => {
    const a = await account('Ana');
    const b = await guest('Beto');
    const roomId = await sharedRoom(a, b);
    const started = once<LevelStarted>(b, 'levelStarted');
    a.emit('ready');
    b.emit('ready');
    const first = await started;
    const revoked = once<string>(b, 'nicknameRevoked');
    await register('beto');
    expect(await revoked).toBe('Beto');
    expect(first.nicknames[b.id as string]).toBe('Beto');
    expect((await listRooms()).find((r) => r.id === roomId)?.status).toBe('playing');
    expect(b.connected).toBe(true);
  });

  test('a forged session cookie connects as a guest', async () => {
    const forged = await connected(newClient('better-auth.session_token=forged'));
    expect(await forged.emitWithAck('createRoom', { name: 'Sala' })).toEqual({
      ok: false,
      error: 'signInRequired',
    });
    expect((await forged.emitWithAck('claimNickname', { nickname: 'Dani' })).ok).toBe(true);
  });

  test('flooding nickname claims is disconnected', async () => {
    const g = await connected(newClient());
    const kicked = once<string>(g, 'disconnect');
    for (let i = 0; i < 30; i++) g.emit('claimNickname', { nickname: `G${i}` }, () => {});
    expect(await kicked).toBe('io server disconnect');
  });
});

describe('server integration', () => {
  test('nobody is in a room on connect; GET /api/rooms lists created rooms', async () => {
    const a = await account('Ana');
    expect(await listRooms()).toEqual([]);
    const created = await a.emitWithAck('createRoom', { name: ' Sala ' });
    expect(created).toEqual({
      ok: true,
      lobby: {
        id: expect.any(String),
        name: 'Sala',
        players: [{ id: a.id, nickname: 'Ana', ready: false }],
      },
    });
    const res = await fetch(`${url()}/api/rooms`);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await listRooms()).toEqual([
      { id: expect.any(String), name: 'Sala', players: 1, status: 'lobby' },
    ]);
  });

  test('invalid requests are refused and leave the player roomless', async () => {
    const a = await account('Ana');
    expect(await a.emitWithAck('createRoom', { name: '' })).toEqual({
      ok: false,
      error: 'invalid',
    });
    expect(await a.emitWithAck('joinRoom', { roomId: 'nope' })).toEqual({
      ok: false,
      error: 'notFound',
    });
    expect(await listRooms()).toEqual([]);
  });

  test('two players ready → level 1 starts with nicknames; a third cannot join', async () => {
    const a = await account('Ana');
    const b = await guest('Beto');
    const lobbyA = once<RoomLobby>(a, 'lobbyUpdated');
    const roomId = await sharedRoom(a, b);
    expect((await lobbyA).players).toHaveLength(1);
    const startedA = once<LevelStarted>(a, 'levelStarted');
    const startedB = once<LevelStarted>(b, 'levelStarted');
    a.emit('ready');
    b.emit('ready');
    const [sa, sb] = await Promise.all([startedA, startedB]);
    expect(sa.levelIndex).toBe(0);
    expect(sb.levelIndex).toBe(0);
    expect(sa.snapshot.players).toHaveLength(2);
    expect(sa.nicknames).toEqual({ [a.id as string]: 'Ana', [b.id as string]: 'Beto' });

    const c = await guest('Carla');
    expect(await c.emitWithAck('joinRoom', { roomId })).toEqual({
      ok: false,
      error: 'inProgress',
    });
    expect(c.connected).toBe(true);
    expect(await listRooms()).toEqual([
      { id: roomId, name: 'Sala', players: 2, status: 'playing' },
    ]);
  });

  test('a rival disconnecting mid-match ends it: rivalsLeft, room gone, player free', async () => {
    const a = await account('Ana');
    const b = await guest('Beto');
    await startMatch(a, b);
    const ended = once<MatchEnded>(a, 'matchEnded');
    b.disconnect();
    const payload = await ended;
    expect(payload.reason).toBe('rivalsLeft');
    expect(payload.scores.map((s) => s.id)).toEqual([a.id]);
    expect(await listRooms()).toEqual([]);
    const again = await a.emitWithAck('createRoom', { name: 'Otra' });
    expect(again.ok).toBe(true);
  });

  test('latency probes are answered without being in a room', async () => {
    const a = await connected(newClient());
    await expect(a.timeout(2000).emitWithAck('latency')).resolves.toBeUndefined();
  });

  test('leaveRoom in the lobby closes an emptied room', async () => {
    const a = await account('Ana');
    await a.emitWithAck('createRoom', { name: 'Sala' });
    a.emit('leaveRoom');
    await expect.poll(listRooms).toEqual([]);
  });

  test('server decides hits: a shoots b across level 1', async () => {
    const a = await account('Ana');
    const b = await guest('Beto');
    await startMatch(a, b);
    const aId = a.id as string;
    const bId = b.id as string;

    // One explicit state object, advanced only by a's snapshots. The interval just replays it.
    //  walk: b holds left until a snapshot shows it well away from its spawn
    //  fire: a sends one shoot frame, b stands still
    //  Success: after firing, two snapshots show b back at its spawn (the server respawns the victim).
    const state = {
      phase: 'walk' as 'walk' | 'fire',
      shootPending: false,
      awayX: 0,
      respawnSnapshots: 0,
    };
    let seqA = 0;
    let seqB = 0;
    let spawnX: number | undefined;

    const done = new Promise<Snapshot>((resolve) => {
      a.on('snapshot', (snap) => {
        const pb = snap.players.find((p) => p.id === bId);
        if (!pb) return;
        spawnX ??= pb.x;
        if (state.phase === 'walk') {
          if (pb.x < spawnX - 100) {
            state.phase = 'fire';
            state.shootPending = true;
            state.awayX = pb.x;
          }
        } else if (pb.x > state.awayX + 100 && ++state.respawnSnapshots === 2) {
          // The first snapshot at the respawn tick is unclamped (x 815.65, the converted spawn
          // hanging off the right edge); the next one has settled.
          resolve(snap);
        }
      });
    });

    const mk = (seq: number, over: Partial<InputFrame>): InputFrame => ({
      seq,
      level: 0,
      left: false,
      right: false,
      jumpPressed: false,
      shootPressed: false,
      ...over,
    });

    timers.push(
      setInterval(() => {
        b.emit('input', mk(++seqB, { left: state.phase === 'walk' }));
        const shoot = state.shootPending;
        state.shootPending = false;
        a.emit('input', mk(++seqA, { shootPressed: shoot }));
      }, 16),
    );

    const snap = await done;
    const pa = snap.players.find((p) => p.id === aId);
    const pb = snap.players.find((p) => p.id === bId);
    // Hitbox centre flush against the right bound: 800 - 27.6 / 2.
    expect(pb?.x).toBeCloseTo(786.2, 1);
    expect(pa?.ammo).toBe(1);
  }, 15000);

  test('a client flooding inputs is disconnected; the others keep receiving snapshots', async () => {
    const a = await account('Ana');
    const b = await guest('Beto');
    // A third player keeps the match alive once a is gone.
    const c = await guest('Carla');
    const roomId = await sharedRoom(a, b);
    await c.emitWithAck('joinRoom', { roomId });
    const started = Promise.all([a, b, c].map((x) => once(x, 'levelStarted')));
    for (const x of [a, b, c]) x.emit('ready');
    await started;

    const kicked = once<string>(a, 'disconnect');
    for (let seq = 1; seq <= 400; seq++) {
      a.emit('input', {
        seq,
        level: 0,
        left: false,
        right: false,
        jumpPressed: false,
        shootPressed: false,
      });
    }
    expect(await kicked).toBe('io server disconnect');

    const snaps: Snapshot[] = [];
    await new Promise<void>((resolve) => {
      b.on('snapshot', (snap) => {
        snaps.push(snap);
        if (snaps.length === 5) resolve();
      });
    });
    expect(b.connected).toBe(true);
    expect(snaps.at(-1)!.players.map((p) => p.id)).toEqual([b.id, c.id]);
  }, 10000);

  test('GET /healthz is ok and unknown paths redirect to /', async () => {
    const ok = await fetch(`${url()}/healthz`);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ status: 'ok' });
    const res = await fetch(`${url()}/nope/whatever`, { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/');
  });

  test('GET / without a client build is a 404, not a redirect loop', async () => {
    const res = await fetch(`${url()}/`, { redirect: 'manual' });
    expect(res.status).toBe(404);
    expect(res.headers.get('location')).toBeNull();
    expect(await res.text()).toContain('npm run build');
  });
});
