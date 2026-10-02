import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Nested under GitHub Pages: https://sebastian-tamayo.github.io/personal/familia/
export default defineConfig({
  base: '/personal/familia/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Familia Mati',
        short_name: 'Familia Mati',
        description: 'Organización diaria de la familia Mati',
        theme_color: '#ea580c',
        background_color: '#fff7ed',
        display: 'standalone',
        orientation: 'portrait-primary',
        lang: 'es',
        start_url: '/personal/familia/',
        scope: '/personal/familia/',
        icons: [
          { src: 'icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/personal/familia/index.html',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
    }),
  ],
})
