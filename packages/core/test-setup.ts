/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Unset NO_COLOR environment variable to ensure consistent theme behavior between local and CI test runs
if (process.env['NO_COLOR'] !== undefined) {
  delete process.env['NO_COLOR'];
}

import { setSimulate429 } from './src/utils/testUtils.js';
import { vi, beforeEach, afterEach } from 'vitest';
import { coreEvents } from './src/utils/events.js';

// Increase max listeners to avoid warnings in large test suites
coreEvents.setMaxListeners(100);

// Disable 429 simulation globally for all tests
setSimulate429(false);

// Known expected console messages that are safe to suppress.
// These appear during normal test execution of error-handling paths.
const EXPECTED_WARN_PATTERNS = [
  'deprecated',
  'ExperimentalWarning',
  'punycode',
];

const EXPECTED_ERROR_PATTERNS = [
  'API key not valid',
  'PERMISSION_DENIED',
  'fetch failed',
  'ECONNREFUSED',
  'socket hang up',
  'RetryError',
];

let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
const originalWarn = console.warn;
const originalError = console.error;

beforeEach(() => {
  consoleWarnSpy = vi
    .spyOn(console, 'warn')
    .mockImplementation((...args: unknown[]) => {
      const message = args.map(String).join(' ');
      const isExpected = EXPECTED_WARN_PATTERNS.some((pattern) =>
        message.includes(pattern),
      );
      if (!isExpected) {
        // Pass through unexpected warnings so they remain visible for debugging
        originalWarn.apply(console, args);
      }
    });

  consoleErrorSpy = vi
    .spyOn(console, 'error')
    .mockImplementation((...args: unknown[]) => {
      const message = args.map(String).join(' ');
      const isExpected = EXPECTED_ERROR_PATTERNS.some((pattern) =>
        message.includes(pattern),
      );
      if (!isExpected) {
        // Pass through unexpected errors so they remain visible for debugging
        originalError.apply(console, args);
      }
    });
});

afterEach(() => {
  consoleWarnSpy?.mockRestore();
  consoleErrorSpy?.mockRestore();
  vi.unstubAllEnvs();
});

// Default mocks for Storage and ProjectRegistry to prevent disk access in most tests.
// These can be overridden in specific tests using vi.unmock().

vi.mock('./src/config/projectRegistry.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('./src/config/projectRegistry.js')>();
  actual.ProjectRegistry.prototype.initialize = vi.fn(() =>
    Promise.resolve(undefined),
  );
  actual.ProjectRegistry.prototype.getShortId = vi.fn(() =>
    Promise.resolve('project-slug'),
  );
  return actual;
});

vi.mock('./src/config/storageMigration.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('./src/config/storageMigration.js')>();
  actual.StorageMigration.migrateDirectory = vi.fn(() =>
    Promise.resolve(undefined),
  );
  return actual;
});

vi.mock('./src/config/storage.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('./src/config/storage.js')>();
  actual.Storage.prototype.initialize = vi.fn(() => Promise.resolve(undefined));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (actual.Storage.prototype as any).getProjectIdentifier = vi.fn(
    () => 'project-slug',
  );
  return actual;
});
