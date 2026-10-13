import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages project site: https://Sebastian-Tamayo.github.io/personal/
// Cache-bust bump: Actualizar overlay for PWA updates
export const FINANZAS_BUILD_ID = 'actualizar-overlay-v20261013b'
export const FINANZAS_PWA_CACHE_ID = 'finanzas-mati-v20261013b'

function finanzasVersionJson(): Plugin {
  return {
    name: 'finanzas-version-json',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'finanzas-version.json',
        source: JSON.stringify({ build: FINANZAS_BUILD_ID }),
      })
    },
  }
}

export default defineConfig({
  base: '/personal/',
  plugins: [
    react(),
    tailwindcss(),
    finanzasVersionJson(),
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
        name: 'Finanzas Mati',
        short_name: 'Finanzas Mati',
        description: 'Finanzas y citas compartidas de Sebas y Lore',
        theme_color: '#0f766e',
        background_color: '#e8f2ef',
        display: 'standalone',
        orientation: 'portrait-primary',
        lang: 'es',
        start_url: '/personal/?v=20261013b',
        scope: '/personal/',
        icons: [
          {
            src: 'icons/pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        cacheId: FINANZAS_PWA_CACHE_ID,
        cleanupOutdatedCaches: true,
        // Waiting worker until user taps Actualizar (updateSW(true))
        skipWaiting: false,
        clientsClaim: true,
        navigateFallback: '/personal/index.html',
        // Familia Hellen y Mati lives under /personal/familia/ — do not steal its navigations.
        navigateFallbackDenylist: [/^\/personal\/familia(?:\/|$)/],
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,json}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.endsWith('/finanzas-version.json'),
            handler: 'NetworkOnly',
            options: {
              cacheName: 'finanzas-version-network',
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
