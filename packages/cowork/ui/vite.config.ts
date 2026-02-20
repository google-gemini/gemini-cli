import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Proxy SSE and API calls to the Cowork dashboard server.
      '/events': 'http://localhost:3141',
      '/api': 'http://localhost:3141',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
