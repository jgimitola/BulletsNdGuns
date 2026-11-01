import { lazy } from 'react';

/**
 * The room list is the only screen that needs TanStack Query, so it and its dialog live in their
 * own chunk. Calling this again reuses the same download.
 */
export const loadRoomsScreen = () => import('./RoomsScreen.tsx');

export const LazyRoomsScreen = lazy(() =>
  loadRoomsScreen().then((m) => ({ default: m.RoomsScreenWithQuery })),
);
