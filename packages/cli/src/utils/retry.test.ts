/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import { removeDirectoryWithRetry } from './retry.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    promises: {
      ...actual.promises,
      rm: vi.fn(),
    },
  };
});

describe('removeDirectoryWithRetry', () => {
  const mockedRm = vi.mocked(fs.promises.rm);

  beforeEach(() => {
    vi.useFakeTimers();
    mockedRm.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('removes the directory on the first attempt', async () => {
    mockedRm.mockResolvedValue(undefined);

    await removeDirectoryWithRetry('/test/path');

    expect(mockedRm).toHaveBeenCalledTimes(1);
    expect(mockedRm).toHaveBeenCalledWith('/test/path', {
      recursive: true,
      force: true,
    });
  });

  it.each(['EACCES', 'EBUSY', 'ENOTEMPTY', 'EPERM'])(
    'retries when rm fails with %s',
    async (errorCode) => {
      const error = Object.assign(new Error(errorCode), { code: errorCode });
      mockedRm
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValue(undefined);

      const removalPromise = removeDirectoryWithRetry('/test/path');
      await vi.runAllTimersAsync();
      await removalPromise;

      expect(mockedRm).toHaveBeenCalledTimes(3);
    },
  );

  it('throws after exhausting retry attempts', async () => {
    const error = Object.assign(new Error('EBUSY'), { code: 'EBUSY' });
    mockedRm.mockRejectedValue(error);

    const caughtErrorPromise = removeDirectoryWithRetry('/test/path').then(
      () => undefined,
      (caughtError: unknown) => caughtError,
    );

    await vi.runAllTimersAsync();

    await expect(caughtErrorPromise).resolves.toBe(error);
    expect(mockedRm).toHaveBeenCalledTimes(5);
  });

  it('throws immediately for non-retryable errors', async () => {
    mockedRm.mockRejectedValue(new Error('Some other error'));

    await expect(removeDirectoryWithRetry('/test/path')).rejects.toThrow(
      'Some other error',
    );
    expect(mockedRm).toHaveBeenCalledTimes(1);
  });
});
