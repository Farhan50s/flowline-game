import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    watch: { ignored: ['**/android/**', '**/.npm-cache/**'] },
  },
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
    clearMocks: true,
  },
});
