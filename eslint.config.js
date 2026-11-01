import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'public/**', 'server.js'] },
  ...tseslint.configs.recommended,
);
