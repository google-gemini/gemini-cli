/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Mock the ResizeObserver API for tests.
// This needs to be at the top of the file to ensure it's available globally
// before any other modules (especially React components) are imported.
// Otherwise, we can get a "ResizeObserver is not defined" error during test runs.
class ResizeObserver {
  observe() {
    // do nothing
  }
  unobserve() {
    // do nothing
  }
  disconnect() {
    // do nothing
  }
}

global.ResizeObserver = ResizeObserver;

import { vi, beforeEach, afterEach } from 'vitest';
import { format } from 'node:util';

global.IS_REACT_ACT_ENVIRONMENT = true;

// Unset NO_COLOR environment variable to ensure consistent theme behavior between local and CI test runs
if (process.env.NO_COLOR !== undefined) {
  delete process.env.NO_COLOR;
}

import './src/test-utils/customMatchers.js';

let consoleErrorSpy: vi.SpyInstance;
let actWarnings: Array<{ message: string; stack: string }> = [];

beforeEach(() => {
  actWarnings = [];
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
    const firstArg = args[0];
    if (
      typeof firstArg === 'string' &&
      firstArg.includes('was not wrapped in act(...)')
    ) {
      const stackLines = (new Error().stack || '').split('\n');
      let lastReactFrameIndex = -1;

      // Find the index of the last frame that comes from react-reconciler
      for (let i = 0; i < stackLines.length; i++) {
        if (stackLines[i].includes('react-reconciler')) {
          lastReactFrameIndex = i;
        }
      }

      // If we found react-reconciler frames, start the stack trace after the last one.
      // Otherwise, just strip the first line (which is the Error message itself).
      const relevantStack =
        lastReactFrameIndex !== -1
          ? stackLines.slice(lastReactFrameIndex + 1).join('\n')
          : stackLines.slice(1).join('\n');

      actWarnings.push({
        message: format(...args),
        stack: relevantStack,
      });
    }
  });
});

afterEach(() => {
  consoleErrorSpy.mockRestore();

  if (actWarnings.length > 0) {
    const messages = actWarnings
      .map(({ message, stack }) => `${message}\n${stack}`)
      .join('\n\n');
    throw new Error(`Failing test due to "act(...)" warnings:\n${messages}`);
  }
});
