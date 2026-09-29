import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Use '/' for Cloudflare Pages / Netlify. For GitHub Pages project sites, set base: '/REPO_NAME/'
  base: '/',
})
