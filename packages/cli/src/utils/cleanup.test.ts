/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  vi,
  describe,
  it,
  expect,
  beforeEach,
  type MockInstance,
} from 'vitest';
import type * as Fs from 'node:fs'; // Import the full type
import {
  cleanupCheckpoints as cleanupCheckpointsImpl, // Import the implementation
} from './cleanup.js';
import type {
  cleanupCheckpoints,
  registerCleanup,
  runExitCleanup,
} from './cleanup.js';
import { join } from 'node:path';

vi.mock('node:fs', () => ({
  promises: {
    rm: vi.fn(),
  },
}));

const mockGetProjectTempDir = vi.fn();
vi.mock('@google/gemini-cli-core', () => ({
  Storage: class {
    getProjectTempDir = mockGetProjectTempDir;
  },
}));

type FsMock = {
  promises: {
    rm: MockInstance<typeof Fs.promises.rm>;
  };
};

describe('cleanup', () => {
  let register: typeof registerCleanup;
  let runExit: typeof runExitCleanup;

  beforeEach(async () => {
    vi.resetModules();
    const cleanupModule = await import('./cleanup.js');
    register = cleanupModule.registerCleanup;
    runExit = cleanupModule.runExitCleanup;
  });

  it('should run a registered synchronous function', async () => {
    const cleanupFn = vi.fn();
    register(cleanupFn);

    await runExit();

    expect(cleanupFn).toHaveBeenCalledTimes(1);
  });

  it('should run a registered asynchronous function', async () => {
    const cleanupFn = vi.fn().mockResolvedValue(undefined);
    register(cleanupFn);

    await runExit();

    expect(cleanupFn).toHaveBeenCalledTimes(1);
  });

  it('should run multiple registered functions', async () => {
    const syncFn = vi.fn();
    const asyncFn = vi.fn().mockResolvedValue(undefined);

    register(syncFn);
    register(asyncFn);

    await runExit();

    expect(syncFn).toHaveBeenCalledTimes(1);
    expect(asyncFn).toHaveBeenCalledTimes(1);
  });

  it('should continue running cleanup functions even if one throws an error', async () => {
    const errorFn = vi.fn().mockImplementation(() => {
      throw new Error('test error');
    });
    const successFn = vi.fn();
    register(errorFn);
    register(successFn);

    await expect(runExit()).resolves.not.toThrow();

    expect(errorFn).toHaveBeenCalledTimes(1);
    expect(successFn).toHaveBeenCalledTimes(1);
  });
});

describe('cleanupCheckpoints', () => {
  let cleanup: typeof cleanupCheckpoints;
  let fs: FsMock;

  beforeEach(async () => {
    vi.clearAllMocks();
    cleanup = cleanupCheckpointsImpl;
    fs = (await import('node:fs')) as unknown as FsMock;
  });

  it('should construct the correct path and call fs.rm', async () => {
    // Arrange
    const fakeTempDir = '/fake/project/root/.gemini/temp';
    mockGetProjectTempDir.mockReturnValue(fakeTempDir);
    const expectedPath = join(fakeTempDir, 'checkpoints');

    // Act
    await cleanup();

    // Assert
    expect(mockGetProjectTempDir).toHaveBeenCalledTimes(1);
    expect(fs.promises.rm).toHaveBeenCalledTimes(1);
    expect(fs.promises.rm).toHaveBeenCalledWith(expectedPath, {
      recursive: true,
      force: true,
    });
  });

  it('should ignore errors if fs.rm fails', async () => {
    // Arrange
    const fakeTempDir = '/fake/project/root/.gemini/temp';
    mockGetProjectTempDir.mockReturnValue(fakeTempDir);
    fs.promises.rm.mockRejectedValue(new Error('ENOENT')); // Simulate file not found

    // Act & Assert
    // Expect the function to resolve without throwing an error
    await expect(cleanup()).resolves.not.toThrow();
    expect(fs.promises.rm).toHaveBeenCalledTimes(1);
  });
});
