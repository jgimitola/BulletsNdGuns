import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, InputFrame, ServerToClientEvents, Snapshot } from '@bng/shared';
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

describe('server integration', () => {
  test('two players ready → level 1 starts; third connection gets matchInProgress', async () => {
    const a = newClient();
    const b = newClient();
    await Promise.all([once(a, 'joined'), once(b, 'joined')]);
    const startedA = once<{ levelIndex: number; snapshot: Snapshot }>(a, 'levelStarted');
    const startedB = once<{ levelIndex: number; snapshot: Snapshot }>(b, 'levelStarted');
    a.emit('ready');
    b.emit('ready');
    const [sa, sb] = await Promise.all([startedA, startedB]);
    expect(sa.levelIndex).toBe(0);
    expect(sb.levelIndex).toBe(0);
    expect(sa.snapshot.players).toHaveLength(2);

    const c = newClient();
    const refused = once(c, 'matchInProgress');
    const closed = once(c, 'disconnect');
    await refused;
    await closed;
    expect(c.connected).toBe(false);
  });

  test('server decides hits: a shoots b across level 1', async () => {
    const a = newClient();
    const b = newClient();
    await Promise.all([once(a, 'joined'), once(b, 'joined')]);
    const started = Promise.all([once(a, 'levelStarted'), once(b, 'levelStarted')]);
    a.emit('ready');
    b.emit('ready');
    await started;
    const aId = a.id as string;
    const bId = b.id as string;

    // One explicit state object, advanced only by a's snapshots. The interval just replays it.
    //  walk: b holds left until a snapshot shows it well away from its spawn
    //  fire: a sends one shoot frame, b stands still
    //  Success: after firing, two snapshots show b back at its spawn (the server respawns the victim).
    const state = { phase: 'walk' as 'walk' | 'fire', shootPending: false, awayX: 0, respawnSnapshots: 0 };
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

  test('GET /healthz is ok and unknown paths redirect to /', async () => {
    const ok = await fetch(`${url()}/healthz`);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ status: 'ok' });
    const res = await fetch(`${url()}/nope/whatever`, { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/');
  });
});
