import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // ----------------------------------------------------------------
  // FIX: This setting forces Vite to use relative paths (e.g., ./assets/...)
  // instead of absolute paths (/assets/...), which resolves blank page issues
  // when deploying to Netlify, GitHub Pages, or other non-root directories.
  // ----------------------------------------------------------------
  base: './', 
});