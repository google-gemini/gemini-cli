import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react'; // For JSX support
import path from 'path'; // Import path

export default defineConfig({
  root: path.resolve(__dirname), // Explicitly set root to the current directory (packages/cli)
  plugins: [react()], // Add React plugin for JSX/TSX
  test: {
    globals: true, // Use global APIs (describe, test, expect, vi)
    environment: 'jsdom', // Changed environment to jsdom
    // More specific include pattern to find the test file
    include: ['src/**/*.test.{ts,tsx}'],
    // Add setup files if needed (e.g., for global mocks, testing-library config)
    // setupFiles: './src/test/setup.ts',
    mockReset: true, // Reset mocks between tests
    clearMocks: true, // Clear mock history between tests
    alias: {
      // Add path aliases if you use them in your src code
      // Example: '@/*': path.resolve(__dirname, './src/*'),
    },
  },
});
