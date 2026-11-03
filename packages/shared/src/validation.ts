import type { z } from 'zod';

/**
 * Runs an untrusted value through a schema: the parsed copy (unknown keys stripped), or null.
 * Never throws, even for values whose getters throw.
 */
export function parseWith<T>(schema: z.ZodType<T>, raw: unknown): T | null {
  try {
    const result = schema.safeParse(raw);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
