/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import type { Mock } from 'vitest';
import readline from 'node:readline';
import process from 'node:process';
import { coreEvents } from './events.js';
import { getConsentForOauth } from './authConsent.js';
import { FatalAuthenticationError } from './errors.js';
import { writeToStdout } from './stdio.js';
import { isHeadlessMode } from './headless.js';

vi.mock('node:readline');
vi.mock('./headless.js', () => ({
  isHeadlessMode: vi.fn(),
}));
vi.mock('./stdio.js', () => ({
  writeToStdout: vi.fn(),
  createWorkingStdio: vi.fn(() => ({
    stdout: process.stdout,
    stderr: process.stderr,
  })),
}));

describe('getConsentForOauth', () => {
  it('should use coreEvents when listeners are present', async () => {
    vi.restoreAllMocks();
    const mockEmitConsentRequest = vi.spyOn(coreEvents, 'emitConsentRequest');
    const mockListenerCount = vi
      .spyOn(coreEvents, 'listenerCount')
      .mockReturnValue(1);

    mockEmitConsentRequest.mockImplementation((payload) => {
      payload.onConfirm(true);
    });

    const result = await getConsentForOauth('Login required.');

    expect(result).toBe(true);
    expect(mockEmitConsentRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(
          'Login required. Opening authentication page in your browser.',
        ),
      }),
    );

    mockListenerCount.mockRestore();
    mockEmitConsentRequest.mockRestore();
  });

  it('should use readline when no listeners are present and not headless', async () => {
    vi.restoreAllMocks();
    const mockListenerCount = vi
      .spyOn(coreEvents, 'listenerCount')
      .mockReturnValue(0);
    (isHeadlessMode as Mock).mockReturnValue(false);

    const mockReadline = {
      on: vi.fn((event, callback) => {
        if (event === 'line') {
          callback('y');
        }
      }),
      close: vi.fn(),
    };
    (readline.createInterface as Mock).mockReturnValue(mockReadline);

    const result = await getConsentForOauth('Login required.');

    expect(result).toBe(true);
    expect(readline.createInterface).toHaveBeenCalled();
    expect(writeToStdout).toHaveBeenCalledWith(
      expect.stringContaining(
        'Login required. Opening authentication page in your browser.',
      ),
    );

    mockListenerCount.mockRestore();
  });

  it('should throw FatalAuthenticationError when no listeners and headless', async () => {
    vi.restoreAllMocks();
    const mockListenerCount = vi
      .spyOn(coreEvents, 'listenerCount')
      .mockReturnValue(0);
    (isHeadlessMode as Mock).mockReturnValue(true);

    await expect(getConsentForOauth('Login required.')).rejects.toThrow(
      FatalAuthenticationError,
    );

    mockListenerCount.mockRestore();
  });
});
