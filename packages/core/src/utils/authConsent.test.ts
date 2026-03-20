/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import readline from 'node:readline';
import process from 'node:process';
import { coreEvents } from './events.js';
import { getConsentForOauth } from './authConsent.js';
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
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('in interactive mode', () => {
    beforeEach(() => {
      (isHeadlessMode as Mock).mockReturnValue(false);
    });

    it('should emit consent request when UI listeners are present', async () => {
      const mockEmitConsentRequest = vi.spyOn(coreEvents, 'emitConsentRequest');
      vi.spyOn(coreEvents, 'listenerCount').mockReturnValue(1);

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
    });

    it('should handle empty prompt correctly', async () => {
      const mockEmitConsentRequest = vi.spyOn(coreEvents, 'emitConsentRequest');
      vi.spyOn(coreEvents, 'listenerCount').mockReturnValue(1);

      mockEmitConsentRequest.mockImplementation((payload) => {
        payload.onConfirm(true);
      });

      await getConsentForOauth('');

      expect(mockEmitConsentRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringMatching(
            /^Opening authentication page in your browser\./,
          ),
        }),
      );
    });

    it('should return false when user declines via UI', async () => {
      const mockEmitConsentRequest = vi.spyOn(coreEvents, 'emitConsentRequest');
      vi.spyOn(coreEvents, 'listenerCount').mockReturnValue(1);

      mockEmitConsentRequest.mockImplementation((payload) => {
        payload.onConfirm(false);
      });

      const result = await getConsentForOauth('Login required.');

      expect(result).toBe(false);
    });

    it('should emit consent request and wait even if no UI listeners are present (backlog)', async () => {
      vi.spyOn(coreEvents, 'listenerCount').mockReturnValue(0);
      const emitSpy = vi.spyOn(coreEvents, 'emitConsentRequest');

      const promise = getConsentForOauth('Login required.');

      expect(emitSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt:
            'Login required. Opening authentication page in your browser. \n\nDo you want to continue?',
        }),
      );

      // Simulate listener draining the backlog later and confirming
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload = emitSpy.mock.calls[0][0] as any;
      payload.onConfirm(true);

      expect(await promise).toBe(true);
    });
  });

  describe('in non-interactive mode', () => {
    beforeEach(() => {
      (isHeadlessMode as Mock).mockReturnValue(true);
    });

    it('should use readline to prompt for consent', async () => {
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
      expect(readline.createInterface).toHaveBeenCalledWith(
        expect.objectContaining({
          terminal: true,
        }),
      );
      expect(writeToStdout).toHaveBeenCalledWith(
        expect.stringContaining('Login required.'),
      );
    });

    it('should accept empty response as "yes"', async () => {
      const mockReadline = {
        on: vi.fn((event, callback) => {
          if (event === 'line') {
            callback('');
          }
        }),
        close: vi.fn(),
      };
      (readline.createInterface as Mock).mockReturnValue(mockReadline);

      const result = await getConsentForOauth('Login required.');

      expect(result).toBe(true);
    });

    it('should return false when user declines via readline', async () => {
      const mockReadline = {
        on: vi.fn((event, callback) => {
          if (event === 'line') {
            callback('n');
          }
        }),
        close: vi.fn(),
      };
      (readline.createInterface as Mock).mockReturnValue(mockReadline);

      const result = await getConsentForOauth('Login required.');

      expect(result).toBe(false);
    });
  });
});
