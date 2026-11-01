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

    let phase: 'walk' | 'wait' | 'shot' = 'walk';
    let frames = 0;
    let seqA = 0;
    let seqB = 0;
    let shotSent = false;
    let lastBx: number | undefined;
    let shotAt = 0;

    const done = new Promise<Snapshot>((resolve) => {
      a.on('snapshot', (snap) => {
        const pb = snap.players.find((p) => p.id === bId);
        if (!pb) return;
        if (phase === 'wait') {
          if (lastBx !== undefined && pb.x === lastBx && frames >= 30) {
            phase = 'shot';
            shotSent = false;
          }
          lastBx = pb.x;
        } else if (phase === 'shot' && shotAt > 0 && snap.tick > shotAt + 5 && pb.x > 770) {
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
        frames++;
        const bLeft = phase === 'walk' && frames <= 30;
        if (phase === 'walk' && frames > 30) phase = 'wait';
        b.emit('input', mk(++seqB, { left: bLeft }));
        const shoot = phase === 'shot' && !shotSent;
        if (shoot) {
          shotSent = true;
          shotAt = 1;
        }
        a.emit('input', mk(++seqA, { shoot }));
      }, 16),
    );
    // Track tick of the shot via a's snapshots.
    a.on('snapshot', (snap) => {
      if (shotAt === 1) shotAt = snap.tick;
    });

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
