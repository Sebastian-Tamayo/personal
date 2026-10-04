import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Nested under GitHub Pages: https://sebastian-tamayo.github.io/personal/familia/
// Cache-bust bump: strict chip filters + matching Nueva two-line buttons
export const FAMILIA_BUILD_ID = 'profile-filter-v20261004i'
export const FAMILIA_PWA_CACHE_ID = 'familia-hellen-mati-v20261004i'

function familiaVersionJson(): Plugin {
  return {
    name: 'familia-version-json',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'familia-version.json',
        source: JSON.stringify({ build: FAMILIA_BUILD_ID }),
      })
    },
  }
}

export default defineConfig({
  base: '/personal/familia/',
  plugins: [
    react(),
    tailwindcss(),
    familiaVersionJson(),
    VitePWA({
      // Prompt so clients see Actualizar instead of silent swap
      registerType: 'prompt',
      includeAssets: [
        'favicon.svg',
        'icons/apple-touch-icon.png',
        'icons/pwa-192.png',
        'icons/pwa-512.png',
        'icons/pwa-maskable-512.png',
      ],
      manifest: {
        name: 'Familia Hellen y Mati',
        short_name: 'Hellen y Mati',
        description: 'Organización diaria de la familia Hellen y Mati',
        theme_color: '#ea580c',
        background_color: '#fff7ed',
        display: 'standalone',
        orientation: 'portrait-primary',
        lang: 'es',
        start_url: '/personal/familia/?v=20261004i',
        scope: '/personal/familia/',
        icons: [
          { src: 'icons/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icons/pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        cacheId: FAMILIA_PWA_CACHE_ID,
        cleanupOutdatedCaches: true,
        // Waiting worker until user taps Actualizar (updateSW(true))
        skipWaiting: false,
        clientsClaim: true,
        navigateFallback: '/personal/familia/index.html',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,json}'],
        importScripts: ['push-handler.js'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.endsWith('/familia-version.json'),
            handler: 'NetworkOnly',
            options: {
              cacheName: 'familia-version-network',
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
})
