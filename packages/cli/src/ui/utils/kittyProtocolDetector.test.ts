/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  detectAndEnableKittyProtocol,
  isKittyProtocolEnabled,
  isKittyProtocolSupported,
} from './kittyProtocolDetector.js';
import { EventEmitter } from 'node:events';

describe('kittyProtocolDetector', () => {
  let mockStdin: EventEmitter;
  let mockStdout: { write: ReturnType<typeof vi.fn> };
  let originalStdin: typeof process.stdin;
  let originalStdout: typeof process.stdout;
  let originalOn: typeof process.on;

  beforeEach(() => {
    // Reset module state by re-importing
    vi.resetModules();

    originalStdin = process.stdin;
    originalStdout = process.stdout;
    originalOn = process.on;

    mockStdin = new EventEmitter() as never;
    (mockStdin as never).isTTY = true;
    (mockStdin as never).isRaw = false;
    (mockStdin as never).setRawMode = vi.fn();
    (mockStdin as never).removeListener = vi.fn((event, handler) => {
      mockStdin.removeListener(event, handler);
    });

    mockStdout = {
      write: vi.fn(),
    };
    (mockStdout as never).isTTY = true;

    Object.defineProperty(process, 'stdin', {
      value: mockStdin,
      writable: true,
      configurable: true,
    });

    Object.defineProperty(process, 'stdout', {
      value: mockStdout,
      writable: true,
      configurable: true,
    });

    process.on = vi.fn() as never;

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(process, 'stdin', {
      value: originalStdin,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(process, 'stdout', {
      value: originalStdout,
      writable: true,
      configurable: true,
    });
    process.on = originalOn;
    vi.clearAllMocks();
  });

  describe('isKittyProtocolEnabled', () => {
    it('should return false initially', () => {
      expect(isKittyProtocolEnabled()).toBe(false);
    });
  });

  describe('isKittyProtocolSupported', () => {
    it('should return false initially', () => {
      expect(isKittyProtocolSupported()).toBe(false);
    });
  });

  describe('detectAndEnableKittyProtocol', () => {
    it('should return false when not in TTY', async () => {
      (mockStdin as never).isTTY = false;

      const promise = detectAndEnableKittyProtocol();
      const result = await promise;

      expect(result).toBe(false);
    });

    it('should return false when stdout is not TTY', async () => {
      (mockStdout as never).isTTY = false;

      const promise = detectAndEnableKittyProtocol();
      const result = await promise;

      expect(result).toBe(false);
    });

    it('should enable raw mode when not already raw', async () => {
      (mockStdin as never).isRaw = false;

      const _promise = detectAndEnableKittyProtocol();

      // Timeout to resolve
      await vi.advanceTimersByTimeAsync(300);

      expect((mockStdin as never).setRawMode).toHaveBeenCalledWith(true);
    });

    it('should not enable raw mode when already raw', async () => {
      (mockStdin as never).isRaw = true;

      const _promise = detectAndEnableKittyProtocol();

      // Timeout to resolve
      await vi.advanceTimersByTimeAsync(300);

      expect((mockStdin as never).setRawMode).not.toHaveBeenCalled();
    });

    it('should send protocol query sequences', async () => {
      const _promise = detectAndEnableKittyProtocol();

      expect(mockStdout.write).toHaveBeenCalledWith('\x1b[?u');
      expect(mockStdout.write).toHaveBeenCalledWith('\x1b[c');

      await vi.advanceTimersByTimeAsync(300);
    });

    it('should timeout after 200ms without response', async () => {
      const promise = detectAndEnableKittyProtocol();

      await vi.advanceTimersByTimeAsync(200);
      const result = await promise;

      expect(result).toBe(false);
    });

    it('should detect kitty protocol support', async () => {
      const promise = detectAndEnableKittyProtocol();

      // Simulate progressive enhancement response
      mockStdin.emit('data', Buffer.from('\x1b[?1u'));

      // Simulate device attributes response
      mockStdin.emit('data', Buffer.from('\x1b[?c'));

      await Promise.resolve();
      const result = await promise;

      expect(result).toBe(true);
    });

    it('should enable protocol when supported', async () => {
      const promise = detectAndEnableKittyProtocol();

      mockStdin.emit('data', Buffer.from('\x1b[?1u'));
      mockStdin.emit('data', Buffer.from('\x1b[?c'));

      await Promise.resolve();
      await promise;

      expect(mockStdout.write).toHaveBeenCalledWith('\x1b[>1u');
    });

    it('should register exit handlers when protocol enabled', async () => {
      const promise = detectAndEnableKittyProtocol();

      mockStdin.emit('data', Buffer.from('\x1b[?1u'));
      mockStdin.emit('data', Buffer.from('\x1b[?c'));

      await Promise.resolve();
      await promise;

      expect(process.on).toHaveBeenCalledWith('exit', expect.any(Function));
      expect(process.on).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    });

    it('should extend timeout when progressive enhancement received', async () => {
      const promise = detectAndEnableKittyProtocol();

      // Send progressive enhancement first
      mockStdin.emit('data', Buffer.from('\x1b[?1u'));

      // Fast forward 200ms (original timeout)
      await vi.advanceTimersByTimeAsync(200);

      // Should not have timed out yet (extended to 1000ms)
      expect(promise).toBeTruthy();

      // Send device attributes within extended timeout
      mockStdin.emit('data', Buffer.from('\x1b[?c'));

      await Promise.resolve();
      const result = await promise;

      expect(result).toBe(true);
    });

    it('should timeout after extended period with progressive enhancement', async () => {
      const promise = detectAndEnableKittyProtocol();

      mockStdin.emit('data', Buffer.from('\x1b[?1u'));

      await vi.advanceTimersByTimeAsync(1000);
      const result = await promise;

      expect(result).toBe(false);
    });

    it('should restore raw mode when detection complete', async () => {
      (mockStdin as never).isRaw = false;

      const promise = detectAndEnableKittyProtocol();

      mockStdin.emit('data', Buffer.from('\x1b[?1u'));
      mockStdin.emit('data', Buffer.from('\x1b[?c'));

      await Promise.resolve();
      await promise;

      expect((mockStdin as never).setRawMode).toHaveBeenCalledWith(false);
    });

    it('should not restore raw mode if was already raw', async () => {
      (mockStdin as never).isRaw = true;

      const promise = detectAndEnableKittyProtocol();

      mockStdin.emit('data', Buffer.from('\x1b[?1u'));
      mockStdin.emit('data', Buffer.from('\x1b[?c'));

      await Promise.resolve();
      await promise;

      // setRawMode should not have been called at all
      expect((mockStdin as never).setRawMode).not.toHaveBeenCalled();
    });

    it('should handle data received after timeout', async () => {
      const promise = detectAndEnableKittyProtocol();

      await vi.advanceTimersByTimeAsync(200);
      await promise;

      // Data arrives too late
      mockStdin.emit('data', Buffer.from('\x1b[?1u'));
      mockStdin.emit('data', Buffer.from('\x1b[?c'));

      // Should not crash
      expect(isKittyProtocolSupported()).toBe(false);
    });

    it('should return cached result on second call', async () => {
      // First call
      const promise1 = detectAndEnableKittyProtocol();

      mockStdin.emit('data', Buffer.from('\x1b[?1u'));
      mockStdin.emit('data', Buffer.from('\x1b[?c'));

      await Promise.resolve();
      const result1 = await promise1;

      expect(result1).toBe(true);

      // Reset mocks
      vi.clearAllMocks();

      // Second call should return cached result
      const result2 = await detectAndEnableKittyProtocol();

      expect(result2).toBe(true);
      // Should not send queries again
      expect(mockStdout.write).not.toHaveBeenCalled();
    });

    it('should handle partial responses', async () => {
      const promise = detectAndEnableKittyProtocol();

      // Partial progressive enhancement
      mockStdin.emit('data', Buffer.from('\x1b[?'));
      mockStdin.emit('data', Buffer.from('1'));
      mockStdin.emit('data', Buffer.from('u'));

      // Partial device attributes
      mockStdin.emit('data', Buffer.from('\x1b[?'));
      mockStdin.emit('data', Buffer.from('c'));

      await Promise.resolve();
      const result = await promise;

      expect(result).toBe(true);
    });

    it('should accumulate response buffer', async () => {
      const promise = detectAndEnableKittyProtocol();

      mockStdin.emit('data', Buffer.from('junk'));
      mockStdin.emit('data', Buffer.from('\x1b[?1u'));
      mockStdin.emit('data', Buffer.from('more junk'));
      mockStdin.emit('data', Buffer.from('\x1b[?c'));

      await Promise.resolve();
      const result = await promise;

      expect(result).toBe(true);
    });

    it('should not enable protocol without progressive enhancement', async () => {
      const promise = detectAndEnableKittyProtocol();

      // Only device attributes, no progressive enhancement
      mockStdin.emit('data', Buffer.from('\x1b[?c'));

      await Promise.resolve();
      const result = await promise;

      expect(result).toBe(false);
      expect(isKittyProtocolEnabled()).toBe(false);
    });

    it('should set isKittyProtocolSupported when detected', async () => {
      const promise = detectAndEnableKittyProtocol();

      mockStdin.emit('data', Buffer.from('\x1b[?1u'));
      mockStdin.emit('data', Buffer.from('\x1b[?c'));

      await Promise.resolve();
      await promise;

      expect(isKittyProtocolSupported()).toBe(true);
    });

    it('should set isKittyProtocolEnabled when protocol enabled', async () => {
      const promise = detectAndEnableKittyProtocol();

      mockStdin.emit('data', Buffer.from('\x1b[?1u'));
      mockStdin.emit('data', Buffer.from('\x1b[?c'));

      await Promise.resolve();
      await promise;

      expect(isKittyProtocolEnabled()).toBe(true);
    });

    it('should remove data listener on timeout', async () => {
      const promise = detectAndEnableKittyProtocol();

      const listenersBefore = mockStdin.listenerCount('data');

      await vi.advanceTimersByTimeAsync(200);
      await promise;

      const listenersAfter = mockStdin.listenerCount('data');

      expect(listenersAfter).toBeLessThan(listenersBefore);
    });

    it('should remove data listener on success', async () => {
      const promise = detectAndEnableKittyProtocol();

      const listenersBefore = mockStdin.listenerCount('data');

      mockStdin.emit('data', Buffer.from('\x1b[?1u'));
      mockStdin.emit('data', Buffer.from('\x1b[?c'));

      await Promise.resolve();
      await promise;

      const listenersAfter = mockStdin.listenerCount('data');

      expect(listenersAfter).toBeLessThan(listenersBefore);
    });

    it('should handle empty data buffers', async () => {
      const promise = detectAndEnableKittyProtocol();

      mockStdin.emit('data', Buffer.from(''));
      mockStdin.emit('data', Buffer.from('\x1b[?1u'));
      mockStdin.emit('data', Buffer.from(''));
      mockStdin.emit('data', Buffer.from('\x1b[?c'));

      await Promise.resolve();
      const result = await promise;

      expect(result).toBe(true);
    });
  });

  describe('concurrent detection calls', () => {
    it('should handle multiple concurrent calls', async () => {
      const promise1 = detectAndEnableKittyProtocol();
      const promise2 = detectAndEnableKittyProtocol();
      const promise3 = detectAndEnableKittyProtocol();

      // Only first call should proceed
      expect(promise1).toBe(promise2);
      expect(promise2).toBe(promise3);
    });
  });

  describe('edge cases', () => {
    it('should handle very long response buffers', async () => {
      const promise = detectAndEnableKittyProtocol();

      const longJunk = 'x'.repeat(10000);
      mockStdin.emit('data', Buffer.from(longJunk));
      mockStdin.emit('data', Buffer.from('\x1b[?1u'));
      mockStdin.emit('data', Buffer.from(longJunk));
      mockStdin.emit('data', Buffer.from('\x1b[?c'));

      await Promise.resolve();
      const result = await promise;

      expect(result).toBe(true);
    });

    it('should handle responses with special characters', async () => {
      const promise = detectAndEnableKittyProtocol();

      mockStdin.emit('data', Buffer.from('\x00\x01\x02'));
      mockStdin.emit('data', Buffer.from('\x1b[?1u'));
      mockStdin.emit('data', Buffer.from('\xff\xfe\xfd'));
      mockStdin.emit('data', Buffer.from('\x1b[?c'));

      await Promise.resolve();
      const result = await promise;

      expect(result).toBe(true);
    });

    it('should handle responses in single data event', async () => {
      const promise = detectAndEnableKittyProtocol();

      mockStdin.emit('data', Buffer.from('\x1b[?1u\x1b[?c'));

      await Promise.resolve();
      const result = await promise;

      expect(result).toBe(true);
    });
  });
});
