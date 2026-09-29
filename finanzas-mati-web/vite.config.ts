import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // GitHub Pages project site: https://Sebastian-Tamayo.github.io/personal/
  // For Cloudflare/Netlify at domain root, change to base: '/'
  base: '/personal/',
})
