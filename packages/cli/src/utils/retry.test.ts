/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { removeDirectoryWithRetry } from './retry.js';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
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
    mockedRm.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should succeed on first attempt', async () => {
    mockedRm.mockResolvedValue(undefined);

    await removeDirectoryWithRetry('/test/path');

    expect(mockedRm).toHaveBeenCalledTimes(1);
    expect(mockedRm).toHaveBeenCalledWith('/test/path', {
      recursive: true,
      force: true,
    });
  });

  it('should retry on EBUSY error', async () => {
    const ebusyError = Object.assign(new Error('EBUSY'), { code: 'EBUSY' });
    mockedRm
      .mockRejectedValueOnce(ebusyError)
      .mockRejectedValueOnce(ebusyError)
      .mockResolvedValue(undefined);

    await removeDirectoryWithRetry('/test/path');

    expect(mockedRm).toHaveBeenCalledTimes(3);
  });

  it('should retry on ENOTEMPTY error', async () => {
    const notEmptyError = Object.assign(new Error('ENOTEMPTY'), {
      code: 'ENOTEMPTY',
    });
    mockedRm.mockRejectedValueOnce(notEmptyError).mockResolvedValue(undefined);

    await removeDirectoryWithRetry('/test/path');

    expect(mockedRm).toHaveBeenCalledTimes(2);
  });

  it('should throw after max retries', async () => {
    const ebusyError = Object.assign(new Error('EBUSY'), { code: 'EBUSY' });
    mockedRm.mockRejectedValue(ebusyError);

    await expect(removeDirectoryWithRetry('/test/path')).rejects.toThrow(
      'EBUSY',
    );
    expect(mockedRm).toHaveBeenCalledTimes(5);
  });

  it('should throw immediately on non-retryable errors', async () => {
    const otherError = new Error('Some other error');
    mockedRm.mockRejectedValue(otherError);

    await expect(removeDirectoryWithRetry('/test/path')).rejects.toThrow(
      'Some other error',
    );
    expect(mockedRm).toHaveBeenCalledTimes(1);
  });
});
