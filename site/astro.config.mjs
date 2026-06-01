import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://ryfine.app',
  outDir: '../web/dist',
  vite: {
    build: {
      // Don't wipe the React SPA output that was built first
      emptyOutDir: false,
    },
  },
});
