import { describe, expect, it, vi } from 'vitest';
import { createUiStore } from '../src/ui/store.ts';

describe('ui store', () => {
  it('starts on the connecting screen', () => {
    const s = createUiStore({ sendReady: vi.fn() }).getState();
    expect(s.screen).toBe('connecting');
    expect(s.matchInProgress).toBe(false);
    expect(s.waiting).toBe(false);
    expect(s.result).toBeNull();
  });

  it('ready() sends ready once and marks waiting', () => {
    const sendReady = vi.fn();
    const store = createUiStore({ sendReady });
    store.getState().ready();
    store.getState().ready();
    expect(sendReady).toHaveBeenCalledTimes(1);
    expect(store.getState().waiting).toBe(true);
  });

  it('setHud does not notify when values are unchanged', () => {
    const store = createUiStore({ sendReady: vi.fn() });
    const listener = vi.fn();
    store.subscribe(listener);
    store.getState().setHud(12, 3);
    store.getState().setHud(12, 3);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getState().hud).toEqual({ ammo: 12, coins: 3 });
  });

  it('setResult switches to the game over screen', () => {
    const store = createUiStore({ sendReady: vi.fn() });
    store.getState().setResult('tie');
    expect(store.getState()).toMatchObject({ screen: 'gameOver', result: 'tie' });
  });

  it('setLoading stores progress and file', () => {
    const store = createUiStore({ sendReady: vi.fn() });
    store.getState().setLoading(0.5, 'coin');
    expect(store.getState().loading).toEqual({ progress: 0.5, file: 'coin' });
  });

  it('showMatchInProgress sets the flag', () => {
    const store = createUiStore({ sendReady: vi.fn() });
    store.getState().showMatchInProgress();
    expect(store.getState().matchInProgress).toBe(true);
  });
});
