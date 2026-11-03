import { lazy } from 'react';

/**
 * The room list is the only screen that needs TanStack Query, so it and its dialog live in their
 * own chunk. Calling this again reuses the same download.
 */
export const loadRoomsScreen = () => import('./RoomsScreen.tsx');

export const LazyRoomsScreen = lazy(() =>
  loadRoomsScreen().then((m) => ({ default: m.RoomsScreenWithQuery })),
);

/** My levels has its own chunk too; it shares the query client with the room list. */
export const loadMyLevelsScreen = () => import('./MyLevelsScreen.tsx');

export const LazyMyLevelsScreen = lazy(() =>
  loadMyLevelsScreen().then((m) => ({ default: m.MyLevelsScreenWithQuery })),
);
