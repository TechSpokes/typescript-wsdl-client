import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    include: ['research/**/*.test.ts'],
    globals: false,
    testTimeout: 30_000,
    snapshotFormat: {escapeString: false, printBasicPrototype: false},
  },
});
