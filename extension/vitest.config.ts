import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const coreSrcRoot = fileURLToPath(new URL('../packages/core/src/', import.meta.url));

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: [
      {
        find: '@ryfine/core/agents',
        replacement: `${coreSrcRoot}agents.ts`,
      },
      {
        find: '@ryfine/core/providers',
        replacement: `${coreSrcRoot}providers.ts`,
      },
      {
        find: '@ryfine/core/imageUtils',
        replacement: `${coreSrcRoot}imageUtils.ts`,
      },
      {
        find: '@ryfine/core/ryFine',
        replacement: `${coreSrcRoot}ryFine.ts`,
      },
      {
        find: /^@ryfine\/core$/,
        replacement: `${coreSrcRoot}index.ts`,
      },
    ],
  },
});