import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    base: './',
    define: {
      global: 'globalThis',
      'process.env': env,
    },
    build: {
      sourcemap: true, // Enable source maps for debugging
    },
    server: {
      port: 3000,
      host: true,
      watch: {
        usePolling: true
      }
    },
  };
});
