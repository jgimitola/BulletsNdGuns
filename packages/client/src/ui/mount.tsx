import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import type { UiStore } from './store.ts';
import { UiStoreProvider } from './UiStoreContext.tsx';

export function mountUi(element: HTMLElement, store: UiStore): void {
  // Only the room table uses HTTP; it polls on its own, so one failed fetch need not be retried.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });
  createRoot(element).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <UiStoreProvider store={store}>
          <App />
        </UiStoreProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}
