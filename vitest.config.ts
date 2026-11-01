import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: ['shared', 'server', 'client'].map((name) => ({
      test: {
        name: `@bng/${name}`,
        root: `packages/${name}`,
        include: ['test/**/*.test.ts'],
        passWithNoTests: true,
      },
    })),
  },
});
