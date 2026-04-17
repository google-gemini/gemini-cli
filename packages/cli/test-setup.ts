/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import {
  coreEvents,
  uiTelemetryService,
  resetBrowserSession,
} from '@google/gemini-cli-core';
import { themeManager } from './src/ui/themes/theme-manager.js';
import { mockInkSpinner } from './src/test-utils/mockSpinner.js';
import { cleanup } from './src/test-utils/render.js';

// Globally mock ink-spinner to prevent non-deterministic snapshot/act flakes.
mockInkSpinner();

(
  global as typeof global & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// Increase max listeners to avoid warnings in large test suites
coreEvents.setMaxListeners(0);
uiTelemetryService.setMaxListeners(0);
process.setMaxListeners(0);

import './src/test-utils/customMatchers.js';

const noiseStrings = [
  'was not wrapped in act(...)',
  'The current testing environment is not configured to support act(...)',
  'Warning: React does not recognize',
  'Loading ignore patterns from',
  "Can't find node-pty",
  'Skipping inaccessible workspace folder',
];

// PROXY CONSOLE TO FILTER NOISE WITHOUT BREAKING SPIES
const createNoiseFilter = (method: keyof Console) => {
  const original = console[method];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (console as any)[method] = new Proxy(original, {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    apply(target: Function, thisArg: unknown, argArray: unknown[]) {
      const firstArg = String(argArray[0]);
      if (noiseStrings.some((s) => firstArg.includes(s))) {
        return;
      }
      return Reflect.apply(target, thisArg, argArray);
    },
  });
};

['log', 'info', 'warn', 'error', 'debug'].forEach((m) =>
  createNoiseFilter(m as keyof Console),
);

// THE "HEALTHY FIX": Wrap telemetry events in act() automatically
const originalEmit = uiTelemetryService.emit;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
uiTelemetryService.emit = function (event: string | symbol, ...args: any[]) {
  let result: boolean = false;
  try {
    act(() => {
      result = originalEmit.apply(this, [event, ...args]);
    });
  } catch {
    // If act() is not available or fails, fall back to normal emit
    result = originalEmit.apply(this, [event, ...args]);
  }
  return result;
};

beforeEach(async () => {
  // Reset singletons to ensure test isolation
  themeManager.resetForTesting();
  uiTelemetryService.clear();
  // We do NOT remove all listeners here because it would break the
  // SessionContext subscription created during component mount.
  // Instead, we rely on individual tests to manage their specific listeners
  // or the clear() method to reset state.

  await resetBrowserSession();

  // Force specific env for test stability
  vi.stubEnv('FORCE_COLOR', '3');
  vi.stubEnv('FORCE_GENERIC_KEYBINDING_HINTS', 'true');
  vi.stubEnv('TERM_PROGRAM', 'generic');
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});
