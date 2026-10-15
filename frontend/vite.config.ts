import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], css: false },
  server: {
    port: 5173,
    // Same-origin in dev: the browser talks to :5173 and Vite forwards /api to the backend,
    // so session cookies work later without any CORS setup.
    proxy: { '/api': { target: process.env.VITE_BACKEND_URL ?? 'http://localhost:4000', changeOrigin: true } },
  },
});
