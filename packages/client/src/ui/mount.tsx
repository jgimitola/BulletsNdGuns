import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import type { UiStore } from './store.ts';
import { UiStoreProvider } from './UiStoreContext.tsx';

export function mountUi(element: HTMLElement, store: UiStore): void {
  createRoot(element).render(
    <StrictMode>
      <UiStoreProvider store={store}>
        <App />
      </UiStoreProvider>
    </StrictMode>,
  );
}
