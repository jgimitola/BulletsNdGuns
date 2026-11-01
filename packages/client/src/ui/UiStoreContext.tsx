import { createContext, useContext, type ReactNode } from 'react';
import { useStore } from 'zustand';
import type { UiState, UiStore } from './store.ts';

const UiStoreContext = createContext<UiStore | null>(null);

export function UiStoreProvider({ store, children }: { store: UiStore; children: ReactNode }) {
  return <UiStoreContext value={store}>{children}</UiStoreContext>;
}

export function useUiStore(): UiStore {
  const store = useContext(UiStoreContext);
  if (!store) throw new Error('useUiStore must be used inside UiStoreProvider');
  return store;
}

/** Reads one slice of UI state; the component re-renders only when that slice changes. */
export function useUi<T>(selector: (state: UiState) => T): T {
  return useStore(useUiStore(), selector);
}
