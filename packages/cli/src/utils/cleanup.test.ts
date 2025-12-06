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
}));

vi.mock('node:fs', () => ({
  promises: {
    rm: vi.fn(),
  },
}));

describe('cleanup', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    // No need to re-assign, we can use the imported functions directly
    // because we are using vi.resetModules() and re-importing if necessary,
    // but actually, since we are mocking dependencies, we might not need to re-import cleanup.js
    // unless it has internal state that needs resetting. It does (cleanupFunctions array).
    // So we DO need to re-import it to get fresh state.
  });

  it('should run a registered synchronous function', async () => {
    const cleanupModule = await import('./cleanup.js');
    const cleanupFn = vi.fn();
    cleanupModule.registerCleanup(cleanupFn);

    await cleanupModule.runExitCleanup();

    expect(cleanupFn).toHaveBeenCalledTimes(1);
  });

  it('should run a registered asynchronous function', async () => {
    const cleanupModule = await import('./cleanup.js');
    const cleanupFn = vi.fn().mockResolvedValue(undefined);
    cleanupModule.registerCleanup(cleanupFn);

    await cleanupModule.runExitCleanup();

    expect(cleanupFn).toHaveBeenCalledTimes(1);
  });

  it('should run multiple registered functions', async () => {
    const cleanupModule = await import('./cleanup.js');
    const syncFn = vi.fn();
    const asyncFn = vi.fn().mockResolvedValue(undefined);

    cleanupModule.registerCleanup(syncFn);
    cleanupModule.registerCleanup(asyncFn);

    await cleanupModule.runExitCleanup();

    expect(syncFn).toHaveBeenCalledTimes(1);
    expect(asyncFn).toHaveBeenCalledTimes(1);
  });

  it('should continue running cleanup functions even if one throws an error', async () => {
    const cleanupModule = await import('./cleanup.js');
    const errorFn = vi.fn().mockImplementation(() => {
      throw new Error('test error');
    });
    const successFn = vi.fn();
    cleanupModule.registerCleanup(errorFn);
    cleanupModule.registerCleanup(successFn);

    await expect(cleanupModule.runExitCleanup()).resolves.not.toThrow();

    expect(errorFn).toHaveBeenCalledTimes(1);
    expect(successFn).toHaveBeenCalledTimes(1);
  });

  describe('sync cleanup', () => {
    it('should run registered sync functions', async () => {
      const cleanupModule = await import('./cleanup.js');
      const syncFn = vi.fn();
      cleanupModule.registerSyncCleanup(syncFn);
      cleanupModule.runSyncCleanup();
      expect(syncFn).toHaveBeenCalledTimes(1);
    });

    it('should continue running sync cleanup functions even if one throws', async () => {
      const cleanupModule = await import('./cleanup.js');
      const errorFn = vi.fn().mockImplementation(() => {
        throw new Error('test error');
      });
      const successFn = vi.fn();
      cleanupModule.registerSyncCleanup(errorFn);
      cleanupModule.registerSyncCleanup(successFn);

      expect(() => cleanupModule.runSyncCleanup()).not.toThrow();
      expect(errorFn).toHaveBeenCalledTimes(1);
      expect(successFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('cleanupCheckpoints', () => {
    it('should remove checkpoints directory', async () => {
      const cleanupModule = await import('./cleanup.js');
      await cleanupModule.cleanupCheckpoints();
      expect(fs.rm).toHaveBeenCalledWith(
        path.join('/tmp/project', 'checkpoints'),
        {
          recursive: true,
          force: true,
        },
      );
    });

    it('should ignore errors during checkpoint removal', async () => {
      const cleanupModule = await import('./cleanup.js');
      vi.mocked(fs.rm).mockRejectedValue(new Error('Failed to remove'));
      await expect(cleanupModule.cleanupCheckpoints()).resolves.not.toThrow();
    });
  });
});
