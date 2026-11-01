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
import { startServer } from '../src/index.ts';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let server: Awaited<ReturnType<typeof startServer>>;
let clients: Client[] = [];
let timers: ReturnType<typeof setInterval>[] = [];

const url = (): string => `http://localhost:${server.port}`;

function newClient(): Client {
  const c: Client = connect(url(), { transports: ['websocket'], forceNew: true });
  clients.push(c);
  return c;
}

function once<T>(c: Client, event: string): Promise<T> {
  return new Promise((resolve) => {
    (c as Socket).once(event, (v: T) => resolve(v));
  });
}

beforeEach(async () => {
  server = await startServer({ port: 0, clientDist: 'does-not-exist' });
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

/** a creates a room, b joins it. Returns the room id. */
async function sharedRoom(a: Client, b: Client): Promise<string> {
  await Promise.all([connected(a), connected(b)]);
  const created = await a.emitWithAck('createRoom', { name: 'Sala', nickname: 'Ana' });
  if (!created.ok) throw new Error(created.error);
  const joined = await b.emitWithAck('joinRoom', { roomId: created.lobby.id, nickname: 'Beto' });
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

describe('server integration', () => {
  test('nobody is in a room on connect; GET /api/rooms lists created rooms', async () => {
    const a = await connected(newClient());
    expect(await listRooms()).toEqual([]);
    const created = await a.emitWithAck('createRoom', { name: ' Sala ', nickname: ' Ana ' });
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
    const a = await connected(newClient());
    expect(await a.emitWithAck('createRoom', { name: '', nickname: 'Ana' })).toEqual({
      ok: false,
      error: 'invalid',
    });
    expect(await a.emitWithAck('joinRoom', { roomId: 'nope', nickname: 'Ana' })).toEqual({
      ok: false,
      error: 'notFound',
    });
    expect(await listRooms()).toEqual([]);
  });

  test('two players ready → level 1 starts with nicknames; a third cannot join', async () => {
    const a = newClient();
    const b = newClient();
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

    const c = await connected(newClient());
    expect(await c.emitWithAck('joinRoom', { roomId, nickname: 'Carla' })).toEqual({
      ok: false,
      error: 'inProgress',
    });
    expect(c.connected).toBe(true);
    expect(await listRooms()).toEqual([
      { id: roomId, name: 'Sala', players: 2, status: 'playing' },
    ]);
  });

  test('a rival disconnecting mid-match ends it: rivalsLeft, room gone, player free', async () => {
    const a = newClient();
    const b = newClient();
    await startMatch(a, b);
    const ended = once<MatchEnded>(a, 'matchEnded');
    b.disconnect();
    const payload = await ended;
    expect(payload.reason).toBe('rivalsLeft');
    expect(payload.scores.map((s) => s.id)).toEqual([a.id]);
    expect(await listRooms()).toEqual([]);
    const again = await a.emitWithAck('createRoom', { name: 'Otra', nickname: 'Ana' });
    expect(again.ok).toBe(true);
  });

  test('leaveRoom in the lobby closes an emptied room', async () => {
    const a = await connected(newClient());
    await a.emitWithAck('createRoom', { name: 'Sala', nickname: 'Ana' });
    a.emit('leaveRoom');
    await expect.poll(listRooms).toEqual([]);
  });

  test('server decides hits: a shoots b across level 1', async () => {
    const a = newClient();
    const b = newClient();
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
          // The first snapshot at the respawn tick is unclamped (x 803); the next one has settled.
          resolve(snap);
        }
      });
    });

    const mk = (seq: number, over: Partial<InputFrame>): InputFrame => ({
      seq,
      level: 0,
      left: false,
      right: false,
      jump: false,
      shoot: false,
      ...over,
    });

    timers.push(
      setInterval(() => {
        b.emit('input', mk(++seqB, { left: state.phase === 'walk' }));
        const shoot = state.shootPending;
        state.shootPending = false;
        a.emit('input', mk(++seqA, { shoot }));
      }, 16),
    );

    const snap = await done;
    const pa = snap.players.find((p) => p.id === aId);
    const pb = snap.players.find((p) => p.id === bId);
    expect(pb?.x).toBeCloseTo(775.85, 1);
    expect(pa?.ammo).toBe(1);
  }, 15000);

  test('a client flooding inputs is disconnected; the others keep receiving snapshots', async () => {
    const a = newClient();
    const b = newClient();
    // A third player keeps the match alive once a is gone.
    const c = await connected(newClient());
    const roomId = await sharedRoom(a, b);
    await c.emitWithAck('joinRoom', { roomId, nickname: 'Carla' });
    const started = Promise.all([a, b, c].map((x) => once(x, 'levelStarted')));
    for (const x of [a, b, c]) x.emit('ready');
    await started;

    const kicked = once<string>(a, 'disconnect');
    for (let seq = 1; seq <= 400; seq++) {
      a.emit('input', { seq, level: 0, left: false, right: false, jump: false, shoot: false });
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
