/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

vi.mock('@google/gemini-cli-core', () => ({
  Storage: vi.fn().mockImplementation(() => ({
    getProjectTempDir: vi.fn().mockReturnValue('/tmp/project'),
  })),
  shutdownTelemetry: vi.fn(),
  isTelemetrySdkInitialized: vi.fn().mockReturnValue(false),
}));

vi.mock('node:fs', () => ({
  promises: {
    rm: vi.fn(),
  },
}));

import {
  registerCleanup,
  runExitCleanup,
  registerSyncCleanup,
  runSyncCleanup,
  cleanupCheckpoints,
  resetCleanupForTesting,
} from './cleanup.js';

describe('cleanup', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    resetCleanupForTesting();
  });

  it('should run a registered synchronous function', async () => {
    const cleanupFn = vi.fn();
    registerCleanup(cleanupFn);

    await runExitCleanup();

    expect(cleanupFn).toHaveBeenCalledTimes(1);
  });

  it('should run a registered asynchronous function', async () => {
    const cleanupFn = vi.fn().mockResolvedValue(undefined);
    registerCleanup(cleanupFn);

    await runExitCleanup();

    expect(cleanupFn).toHaveBeenCalledTimes(1);
  });

  it('should run multiple registered functions', async () => {
    const syncFn = vi.fn();
    const asyncFn = vi.fn().mockResolvedValue(undefined);

    registerCleanup(syncFn);
    registerCleanup(asyncFn);

    await runExitCleanup();

    expect(syncFn).toHaveBeenCalledTimes(1);
    expect(asyncFn).toHaveBeenCalledTimes(1);
  });

  it('should continue running cleanup functions even if one throws an error', async () => {
    const errorFn = vi.fn().mockImplementation(() => {
      throw new Error('test error');
    });
    const successFn = vi.fn();
    registerCleanup(errorFn);
    registerCleanup(successFn);

    await expect(runExitCleanup()).resolves.not.toThrow();

    expect(errorFn).toHaveBeenCalledTimes(1);
    expect(successFn).toHaveBeenCalledTimes(1);
  });

  describe('sync cleanup', () => {
    it('should run registered sync functions', async () => {
      const syncFn = vi.fn();
      registerSyncCleanup(syncFn);
      runSyncCleanup();
      expect(syncFn).toHaveBeenCalledTimes(1);
    });

    it('should continue running sync cleanup functions even if one throws', async () => {
      const errorFn = vi.fn().mockImplementation(() => {
        throw new Error('test error');
      });
      const successFn = vi.fn();
      registerSyncCleanup(errorFn);
      registerSyncCleanup(successFn);

      expect(() => runSyncCleanup()).not.toThrow();
      expect(errorFn).toHaveBeenCalledTimes(1);
      expect(successFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('cleanupCheckpoints', () => {
    it('should remove checkpoints directory', async () => {
      await cleanupCheckpoints();
      expect(fs.rm).toHaveBeenCalledWith(
        path.join('/tmp/project', 'checkpoints'),
        {
          recursive: true,
          force: true,
        },
      );
    });

    it('should ignore errors during checkpoint removal', async () => {
      vi.mocked(fs.rm).mockRejectedValue(new Error('Failed to remove'));
      await expect(cleanupCheckpoints()).resolves.not.toThrow();
    });
  });
});
