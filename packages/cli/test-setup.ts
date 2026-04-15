/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, beforeEach, afterEach } from 'vitest';
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
coreEvents.setMaxListeners(0);
uiTelemetryService.setMaxListeners(0);
process.setMaxListeners(0);

import './src/test-utils/customMatchers.js';

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

  // Mock debugLogger to pipe to console, so test-level console spies work.
  // We don't silence them here; we let Vitest's 'silent' config handle the noise.
  vi.spyOn(debugLogger, 'log').mockImplementation((...args) =>
    console.log(...args),
  );
  vi.spyOn(debugLogger, 'warn').mockImplementation((...args) =>
    console.warn(...args),
  );
  vi.spyOn(debugLogger, 'error').mockImplementation((...args) =>
    console.error(...args),
  );
  vi.spyOn(debugLogger, 'debug').mockImplementation((...args) =>
    console.debug(...args),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
