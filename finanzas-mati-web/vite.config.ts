import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages project site: https://Sebastian-Tamayo.github.io/personal/
export default defineConfig({
  base: '/personal/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
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
        start_url: '/personal/',
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
        navigateFallback: '/personal/index.html',
        // Familia Hellen y Mati lives under /personal/familia/ — do not steal its navigations.
        navigateFallbackDenylist: [/^\/personal\/familia(?:\/|$)/],
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
    }),
  ],
})
