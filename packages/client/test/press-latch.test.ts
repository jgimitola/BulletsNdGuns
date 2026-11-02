import { expect, test } from 'vitest';
import { PressLatch } from '../src/input/press-latch.ts';

test('take is false before any press', () => {
  expect(new PressLatch().take()).toBe(false);
});

test('one press yields exactly one true', () => {
  const latch = new PressLatch();
  latch.press();
  expect(latch.take()).toBe(true);
  expect(latch.take()).toBe(false);
});

test('two presses before one take still give a single true', () => {
  const latch = new PressLatch();
  latch.press();
  latch.press();
  expect(latch.take()).toBe(true);
  expect(latch.take()).toBe(false);
});

test('a press survives frames with no take', () => {
  const latch = new PressLatch();
  latch.press();
  // A render frame may run zero ticks; the press must still be there for the next one.
  expect(latch.take()).toBe(true);
});
