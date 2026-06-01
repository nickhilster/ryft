import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      injectRegister: 'auto',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons.svg', 'pwa-icon.svg', 'pwa-icon-maskable.svg'],
      manifest: {
        name: 'RyFine',
        short_name: 'RyFine',
        description: 'Refine prompts with local or hosted models, compare outputs, and ground boosts with repo context.',
        theme_color: '#0a0a0c',
        background_color: '#0a0a0c',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-icon.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
          { src: 'pwa-icon-maskable.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        globIgnores: ['**/lib-*.js'],
        // Don't let the SW intercept navigation to Astro marketing pages —
        // let them fall through to the network so Vercel serves the static HTML.
        navigateFallbackDenylist: [/^\/about/],
      },
    }),
  ],
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
  },
})
