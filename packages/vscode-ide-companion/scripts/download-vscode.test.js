/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import {
  downloadVSCodeWithRetry,
  isTransientNetworkError,
} from './download-vscode.js';

const networkError = (code) => Object.assign(new Error(code), { code });

describe('isTransientNetworkError', () => {
  it('recognises connection failures', () => {
    expect(isTransientNetworkError(networkError('ETIMEDOUT'))).toBe(true);
    expect(isTransientNetworkError(networkError('ECONNRESET'))).toBe(true);
  });

  it('recognises an AggregateError of connection failures', () => {
    // Node reports happy-eyeballs connect failures this way, as seen in the
    // failed nightly release.
    const err = new AggregateError(
      [networkError('ETIMEDOUT'), networkError('ENETUNREACH')],
      '',
    );
    err.code = 'ETIMEDOUT';
    expect(isTransientNetworkError(err)).toBe(true);
  });

  it('recognises test-electron request timeouts', () => {
    const err = new Error('API request timed out');
    err.name = 'TimeoutError';
    expect(isTransientNetworkError(err)).toBe(true);
  });

  it('does not treat other errors as transient', () => {
    expect(isTransientNetworkError(new Error('Invalid version 9.9.9'))).toBe(
      false,
    );
    expect(isTransientNetworkError(undefined)).toBe(false);
  });
});

describe('downloadVSCodeWithRetry', () => {
  const options = { extensionDevelopmentPath: '/ext' };

  it('retries transient network errors and returns the executable path', async () => {
    const download = vi
      .fn()
      .mockRejectedValueOnce(networkError('ETIMEDOUT'))
      .mockResolvedValueOnce('/vscode/code');
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      downloadVSCodeWithRetry(options, { download, sleep, log: () => {} }),
    ).resolves.toBe('/vscode/code');
    expect(download).toHaveBeenCalledTimes(2);
    expect(download).toHaveBeenCalledWith(options);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('gives up after the last attempt', async () => {
    const err = networkError('ETIMEDOUT');
    const download = vi.fn().mockRejectedValue(err);

    await expect(
      downloadVSCodeWithRetry(options, {
        download,
        sleep: async () => {},
        log: () => {},
        attempts: 3,
      }),
    ).rejects.toBe(err);
    expect(download).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-network errors', async () => {
    const err = new Error('Invalid version 9.9.9');
    const download = vi.fn().mockRejectedValue(err);

    await expect(
      downloadVSCodeWithRetry(options, {
        download,
        sleep: async () => {},
        log: () => {},
      }),
    ).rejects.toBe(err);
    expect(download).toHaveBeenCalledTimes(1);
  });
});
