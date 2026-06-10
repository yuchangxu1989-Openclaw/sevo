import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    testTimeout: 15000,
    include: [
      'src/**/__tests__/**/*.test.ts',
      'src/tests/**/*.test.ts',
      'tests/**/*.test.ts',
      'web/__tests__/**/*.test.{ts,tsx}',
    ],
  },
  resolve: {
    alias: {
      '@/': path.resolve(__dirname, 'web') + '/',
      '@': path.resolve(__dirname, 'web'),
    },
  },
});
