/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Unset NO_COLOR environment variable to ensure consistent theme behavior between local and CI test runs
if (process.env.NO_COLOR !== undefined) {
  delete process.env.NO_COLOR;
}

import { setSimulate429 } from './src/utils/testUtils.js';
import { vi, beforeEach, afterEach } from 'vitest';
import { coreEvents } from './src/utils/events.js';

// Increase max listeners to avoid warnings in large test suites
coreEvents.setMaxListeners(100);

// Disable 429 simulation globally for all tests
setSimulate429(false);

// Silence noisy console output from passing tests. Tests that intentionally
// test logging behavior should use vi.mocked(console.log) or similar.
// console.error is intentionally left unmocked so real errors are visible.
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'debug').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
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
