/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { retryWithBackoff, removeDirectoryWithRetry } from './retry.js';

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

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    debugLogger: {
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
    },
  };
});

describe('retry utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('retryWithBackoff', () => {
    it('should succeed on the first attempt', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await retryWithBackoff(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry and succeed on a subsequent attempt', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');

      const promise = retryWithBackoff(fn, { initialDelay: 100 });

      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(200);

      const result = await promise;
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should fail after maxRetries', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('persistent fail'));

      const promise = retryWithBackoff(fn, {
        maxRetries: 3,
        initialDelay: 100,
      });

      await Promise.all([
        expect(promise).rejects.toThrow('persistent fail'),
        (async () => {
          await vi.advanceTimersByTimeAsync(100);
          await vi.advanceTimersByTimeAsync(200);
        })(),
      ]);
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should not retry if shouldRetry returns false', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fatal fail'));
      const shouldRetry = vi.fn().mockReturnValue(false);

      await expect(retryWithBackoff(fn, { shouldRetry })).rejects.toThrow(
        'fatal fail',
      );
      expect(fn).toHaveBeenCalledTimes(1);
      expect(shouldRetry).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should throw an error if maxRetries is zero or negative', async () => {
      const fn = vi.fn();
      await expect(retryWithBackoff(fn, { maxRetries: 0 })).rejects.toThrow(
        'maxRetries must be a positive number.',
      );
      await expect(retryWithBackoff(fn, { maxRetries: -1 })).rejects.toThrow(
        'maxRetries must be a positive number.',
      );
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('removeDirectoryWithRetry', () => {
    it('should retry on EBUSY, ENOTEMPTY, and EPERM', async () => {
      const ebusyError = Object.assign(new Error('EBUSY'), { code: 'EBUSY' });
      const enotemptyError = Object.assign(new Error('ENOTEMPTY'), {
        code: 'ENOTEMPTY',
      });
      const epermError = Object.assign(new Error('EPERM'), { code: 'EPERM' });

      vi.mocked(fs.promises.rm)
        .mockRejectedValueOnce(ebusyError)
        .mockRejectedValueOnce(enotemptyError)
        .mockRejectedValueOnce(epermError)
        .mockResolvedValue(undefined);

      const promise = removeDirectoryWithRetry('/some/path');

      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(200);
      await vi.advanceTimersByTimeAsync(400);

      await promise;
      expect(fs.promises.rm).toHaveBeenCalledTimes(4);
      expect(fs.promises.rm).toHaveBeenCalledWith('/some/path', {
        recursive: true,
        force: true,
      });
    });

    it('should not retry on other errors like EACCES', async () => {
      const eaccesError = Object.assign(new Error('EACCES'), {
        code: 'EACCES',
      });
      vi.mocked(fs.promises.rm).mockRejectedValue(eaccesError);

      await expect(removeDirectoryWithRetry('/some/path')).rejects.toThrow(
        'EACCES',
      );
      expect(fs.promises.rm).toHaveBeenCalledTimes(1);
    });

    it('should respect caller-supplied options while keeping defaults', async () => {
      const ebusyError = Object.assign(new Error('EBUSY'), { code: 'EBUSY' });
      vi.mocked(fs.promises.rm)
        .mockRejectedValueOnce(ebusyError)
        .mockRejectedValueOnce(ebusyError);

      const promise = removeDirectoryWithRetry('/some/path', {
        recursive: false,
        maxRetries: 2,
        initialDelay: 50,
      });

      await Promise.all([
        expect(promise).rejects.toThrow('EBUSY'),
        vi.advanceTimersByTimeAsync(50),
      ]);

      expect(fs.promises.rm).toHaveBeenCalledTimes(2);
      expect(fs.promises.rm).toHaveBeenCalledWith('/some/path', {
        recursive: false,
        force: true,
      });
    });
  });
});
