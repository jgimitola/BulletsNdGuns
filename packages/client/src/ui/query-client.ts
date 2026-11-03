import { QueryClient } from '@tanstack/react-query';

/**
 * The one TanStack Query client of the lazily loaded screens (room list, My levels). Module scope
 * keeps the cache across visits; the room list polls on its own, so one failed fetch need not be
 * retried.
 */
export const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });
