/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';

// On Windows, temp directories like os.tmpdir() use NTFS 8.3 short names (SFNs, e.g. RUNNER~1).
// Since our secure production path resolution canonicalizes these to long names using native Win32 APIs,
// we globally wrap fs.realpathSync and fs.promises.realpath on Windows during tests.
// This ensures that tests using raw fs.realpathSync(fs.mkdtempSync(...)) also receive canonical long paths,
// preventing path mismatch failures.
if (process.platform === 'win32') {
  const originalRealpathSync = fs.realpathSync;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const customRealpathSync = (p: fs.PathLike, options?: any) => {
    if (typeof p === 'string') {
      try {
        const nativeFn = originalRealpathSync.native || originalRealpathSync;
        let resolved = nativeFn(p, options);
        if (typeof resolved === 'string') {
          if (resolved.slice(0, 8).toUpperCase() === '\\\\?\\UNC\\') {
            resolved = '\\\\' + resolved.slice(8);
          } else if (resolved.startsWith('\\\\?\\')) {
            resolved = resolved.slice(4);
          }
          return resolved;
        }
        return resolved;
      } catch {
        return originalRealpathSync(p, options);
      }
    }
    return originalRealpathSync(p, options);
  };
  customRealpathSync.native = originalRealpathSync.native || originalRealpathSync;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fs.realpathSync = customRealpathSync as any;

  const originalRealpathPromise = fs.promises.realpath;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const customRealpathPromise = async (p: fs.PathLike, options?: any) => {
    if (typeof p === 'string') {
      try {
        return customRealpathSync(p, options);
      } catch {
        return originalRealpathPromise(p, options);
      }
    }
    return originalRealpathPromise(p, options);
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fs.promises.realpath = customRealpathPromise as any;
}

// Unset NO_COLOR environment variable to ensure consistent theme behavior between local and CI test runs
if (process.env.NO_COLOR !== undefined) {
  delete process.env.NO_COLOR;
}

import { setSimulate429 } from './src/utils/testUtils.js';
import { vi, afterEach } from 'vitest';
import { coreEvents } from './src/utils/events.js';

// Increase max listeners to avoid warnings in large test suites
coreEvents.setMaxListeners(100);

// Disable 429 simulation globally for all tests
setSimulate429(false);

afterEach(() => {
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
