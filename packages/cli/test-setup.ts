/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, beforeEach, afterEach } from 'vitest';
import { format } from 'node:util';
import {
  coreEvents,
  debugLogger,
  uiTelemetryService,
  resetBrowserSession,
} from '@google/gemini-cli-core';
import { themeManager } from './src/ui/themes/theme-manager.js';
import { mockInkSpinner } from './src/test-utils/mockSpinner.js';

// Globally mock ink-spinner to prevent non-deterministic snapshot/act flakes.
mockInkSpinner();

global.IS_REACT_ACT_ENVIRONMENT = true;

// Increase max listeners to avoid warnings in large test suites
coreEvents.setMaxListeners(100);
uiTelemetryService.setMaxListeners(100);

import './src/test-utils/customMatchers.js';

let consoleErrorSpy: vi.SpyInstance;
let actWarnings: Array<{ message: string; stack: string }> = [];

let logSpy: vi.SpyInstance;
let warnSpy: vi.SpyInstance;
let errorSpy: vi.SpyInstance;
let debugSpy: vi.SpyInstance;

beforeEach(async () => {
  // Reset singletons to ensure test isolation
  themeManager.resetForTesting();
  uiTelemetryService.clear();
  uiTelemetryService.removeAllListeners();
  coreEvents.removeAllListeners();
  await resetBrowserSession();

  // Use vi.stubEnv instead of direct process.env manipulation for thread safety
  vi.stubEnv('CI', ''); // Effectively unsets it
  vi.stubEnv('NO_COLOR', ''); // Effectively unsets it
  vi.stubEnv('FORCE_COLOR', '3');
  vi.stubEnv('FORCE_GENERIC_KEYBINDING_HINTS', 'true');
  vi.stubEnv('TERM_PROGRAM', 'generic');

  // Mock debugLogger to avoid test output noise
  logSpy = vi.spyOn(debugLogger, 'log').mockImplementation(() => {});
  warnSpy = vi.spyOn(debugLogger, 'warn').mockImplementation((...args) => {
    console.warn(...args);
  });
  errorSpy = vi.spyOn(debugLogger, 'error').mockImplementation((...args) => {
    console.error(...args);
  });
  debugSpy = vi.spyOn(debugLogger, 'debug').mockImplementation(() => {});

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

      if (
        relevantStack.includes('OverflowContext.tsx') ||
        relevantStack.includes('useTimedMessage.ts') ||
        relevantStack.includes('useInlineEditBuffer.ts')
      ) {
        return;
      }

      actWarnings.push({
        message: format(...args),
        stack: relevantStack,
      });
    }
  });
});

afterEach(() => {
  consoleErrorSpy.mockRestore();

  logSpy?.mockRestore();
  warnSpy?.mockRestore();
  errorSpy?.mockRestore();
  debugSpy?.mockRestore();

  vi.unstubAllEnvs();
  if (actWarnings.length > 0) {
    const messages = actWarnings
      .map(({ message, stack }) => `${message}\n${stack}`)
      .join('\n\n');
    throw new Error(`Failing test due to "act(...)" warnings:\n${messages}`);
  }
});
