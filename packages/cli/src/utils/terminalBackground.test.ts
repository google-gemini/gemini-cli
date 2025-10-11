/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectTerminalBackground } from './terminalBackground.js';
import { EventEmitter } from 'node:events';

describe('detectTerminalBackground', () => {
  let mockStdin: EventEmitter & {
    isTTY: boolean;
    setRawMode: ReturnType<typeof vi.fn>;
    resume: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
  };
  let mockStdout: { isTTY: boolean; write: ReturnType<typeof vi.fn> };
  let originalStdin: typeof process.stdin;
  let originalStdout: typeof process.stdout;

  beforeEach(() => {
    // Save originals
    originalStdin = process.stdin;
    originalStdout = process.stdout;

    // Create mock stdin
    mockStdin = Object.assign(new EventEmitter(), {
      isTTY: true,
      setRawMode: vi.fn().mockReturnValue(mockStdin),
      resume: vi.fn().mockReturnValue(mockStdin),
      pause: vi.fn().mockReturnValue(mockStdin),
      off: vi.fn(),
    });

    // Create mock stdout
    mockStdout = {
      isTTY: true,
      write: vi.fn().mockReturnValue(true),
    };

    // Replace process streams
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
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    mockStdin.removeAllListeners();

    // Restore originals
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
  });

  describe('TTY detection', () => {
    it('should return "unknown" when stdin is not a TTY', async () => {
      mockStdin.isTTY = false;

      const result = await detectTerminalBackground();

      expect(result).toBe('unknown');
      expect(mockStdout.write).not.toHaveBeenCalled();
    });

    it('should return "unknown" when stdout is not a TTY', async () => {
      mockStdout.isTTY = false;

      const result = await detectTerminalBackground();

      expect(result).toBe('unknown');
      expect(mockStdout.write).not.toHaveBeenCalled();
    });

    it('should return "unknown" when both are not TTY', async () => {
      mockStdin.isTTY = false;
      mockStdout.isTTY = false;

      const result = await detectTerminalBackground();

      expect(result).toBe('unknown');
    });
  });

  describe('OSC 11 query', () => {
    it('should send OSC 11 query to terminal', async () => {
      const promise = detectTerminalBackground();

      // Emit response before timeout
      setTimeout(() => {
        mockStdin.emit('data', Buffer.from('\x1b]11;rgb:ffff/ffff/ffff\x1b\\'));
      }, 10);

      await promise;

      expect(mockStdout.write).toHaveBeenCalledWith('\x1b]11;?\x1b\\');
      expect(mockStdin.setRawMode).toHaveBeenCalledWith(true);
      expect(mockStdin.resume).toHaveBeenCalled();
    });

    it('should enable raw mode on stdin', async () => {
      const promise = detectTerminalBackground();

      setTimeout(() => {
        mockStdin.emit('data', Buffer.from('\x1b]11;rgb:0000/0000/0000\x1b\\'));
      }, 10);

      await promise;

      expect(mockStdin.setRawMode).toHaveBeenCalledWith(true);
    });
  });

  describe('Light background detection', () => {
    it('should detect white background (ffff/ffff/ffff) as light', async () => {
      const promise = detectTerminalBackground();

      setTimeout(() => {
        mockStdin.emit('data', Buffer.from('\x1b]11;rgb:ffff/ffff/ffff\x1b\\'));
      }, 10);

      const result = await promise;
      expect(result).toBe('light');
    });

    it('should detect light gray background (cccc/cccc/cccc) as light', async () => {
      const promise = detectTerminalBackground();

      setTimeout(() => {
        mockStdin.emit('data', Buffer.from('\x1b]11;rgb:cccc/cccc/cccc\x1b\\'));
      }, 10);

      const result = await promise;
      expect(result).toBe('light');
    });

    it('should detect medium gray background (8888/8888/8888) as light', async () => {
      const promise = detectTerminalBackground();

      setTimeout(() => {
        mockStdin.emit('data', Buffer.from('\x1b]11;rgb:8888/8888/8888\x1b\\'));
      }, 10);

      const result = await promise;
      expect(result).toBe('light');
    });

    it('should detect light blue background as light', async () => {
      const promise = detectTerminalBackground();

      setTimeout(() => {
        mockStdin.emit('data', Buffer.from('\x1b]11;rgb:aaaa/bbbb/ffff\x1b\\'));
      }, 10);

      const result = await promise;
      expect(result).toBe('light');
    });
  });

  describe('Dark background detection', () => {
    it('should detect black background (0000/0000/0000) as dark', async () => {
      const promise = detectTerminalBackground();

      setTimeout(() => {
        mockStdin.emit('data', Buffer.from('\x1b]11;rgb:0000/0000/0000\x1b\\'));
      }, 10);

      const result = await promise;
      expect(result).toBe('dark');
    });

    it('should detect dark gray background (3333/3333/3333) as dark', async () => {
      const promise = detectTerminalBackground();

      setTimeout(() => {
        mockStdin.emit('data', Buffer.from('\x1b]11;rgb:3333/3333/3333\x1b\\'));
      }, 10);

      const result = await promise;
      expect(result).toBe('dark');
    });

    it('should detect dark blue background as dark', async () => {
      const promise = detectTerminalBackground();

      setTimeout(() => {
        mockStdin.emit('data', Buffer.from('\x1b]11;rgb:1111/2222/3333\x1b\\'));
      }, 10);

      const result = await promise;
      expect(result).toBe('dark');
    });
  });

  describe('OSC 11 response formats', () => {
    it('should parse response with backslash terminator (ESC \\)', async () => {
      const promise = detectTerminalBackground();

      setTimeout(() => {
        mockStdin.emit('data', Buffer.from('\x1b]11;rgb:ffff/ffff/ffff\x1b\\'));
      }, 10);

      const result = await promise;
      expect(result).toBe('light');
    });

    it('should parse response with BEL terminator (\\x07)', async () => {
      const promise = detectTerminalBackground();

      setTimeout(() => {
        mockStdin.emit('data', Buffer.from('\x1b]11;rgb:0000/0000/0000\x07'));
      }, 10);

      const result = await promise;
      expect(result).toBe('dark');
    });

    it('should parse response with 2-digit hex values', async () => {
      const promise = detectTerminalBackground();

      setTimeout(() => {
        mockStdin.emit('data', Buffer.from('\x1b]11;rgb:ff/ff/ff\x1b\\'));
      }, 10);

      const result = await promise;
      expect(result).toBe('light');
    });

    it('should parse response with 4-digit hex values', async () => {
      const promise = detectTerminalBackground();

      setTimeout(() => {
        mockStdin.emit('data', Buffer.from('\x1b]11;rgb:ffff/ffff/ffff\x1b\\'));
      }, 10);

      const result = await promise;
      expect(result).toBe('light');
    });

    it('should parse response with mixed case hex values', async () => {
      const promise = detectTerminalBackground();

      setTimeout(() => {
        mockStdin.emit('data', Buffer.from('\x1b]11;rgb:FFFF/FFFF/FFFF\x1b\\'));
      }, 10);

      const result = await promise;
      expect(result).toBe('light');
    });

    it('should handle partial responses across multiple data events', async () => {
      const promise = detectTerminalBackground();

      setTimeout(() => {
        mockStdin.emit('data', Buffer.from('\x1b]11;rgb:'));
        setTimeout(() => {
          mockStdin.emit('data', Buffer.from('ffff/ffff/ffff\x1b\\'));
        }, 5);
      }, 10);

      const result = await promise;
      expect(result).toBe('light');
    });
  });

  describe('Timeout handling', () => {
    it('should timeout after default 100ms and return "unknown"', async () => {
      vi.useFakeTimers();

      const promise = detectTerminalBackground();

      // Advance time past the timeout
      vi.advanceTimersByTime(100);

      const result = await promise;
      expect(result).toBe('unknown');
    });

    it('should timeout after custom timeout value', async () => {
      vi.useFakeTimers();

      const promise = detectTerminalBackground(200);

      // Should not timeout at 100ms
      vi.advanceTimersByTime(100);
      await Promise.resolve(); // Let microtasks run

      // Should timeout at 200ms
      vi.advanceTimersByTime(100);

      const result = await promise;
      expect(result).toBe('unknown');
    });

    it('should not timeout if response arrives in time', async () => {
      vi.useFakeTimers();

      const promise = detectTerminalBackground(100);

      // Send response before timeout
      vi.advanceTimersByTime(50);
      mockStdin.emit('data', Buffer.from('\x1b]11;rgb:ffff/ffff/ffff\x1b\\'));

      const result = await promise;
      expect(result).toBe('light');
    });
  });

  describe('Cleanup behavior', () => {
    it('should restore stdin to non-raw mode after success', async () => {
      const promise = detectTerminalBackground();

      setTimeout(() => {
        mockStdin.emit('data', Buffer.from('\x1b]11;rgb:ffff/ffff/ffff\x1b\\'));
      }, 10);

      await promise;

      expect(mockStdin.setRawMode).toHaveBeenCalledWith(false);
      expect(mockStdin.pause).toHaveBeenCalled();
    });

    it('should restore stdin to non-raw mode after timeout', async () => {
      vi.useFakeTimers();

      const promise = detectTerminalBackground();
      vi.advanceTimersByTime(100);

      await promise;

      expect(mockStdin.setRawMode).toHaveBeenCalledWith(false);
      expect(mockStdin.pause).toHaveBeenCalled();
    });

    it('should remove data event listener after success', async () => {
      const promise = detectTerminalBackground();

      setTimeout(() => {
        mockStdin.emit('data', Buffer.from('\x1b]11;rgb:ffff/ffff/ffff\x1b\\'));
      }, 10);

      await promise;

      expect(mockStdin.off).toHaveBeenCalledWith('data', expect.any(Function));
    });

    it('should remove data event listener after timeout', async () => {
      vi.useFakeTimers();

      const promise = detectTerminalBackground();
      vi.advanceTimersByTime(100);

      await promise;

      expect(mockStdin.off).toHaveBeenCalledWith('data', expect.any(Function));
    });
  });

  describe('Race condition prevention', () => {
    it('should only resolve once even if data arrives after timeout', async () => {
      vi.useFakeTimers();

      const promise = detectTerminalBackground(50);

      // Timeout first
      vi.advanceTimersByTime(50);
      await Promise.resolve();

      // Then emit data (should be ignored)
      mockStdin.emit('data', Buffer.from('\x1b]11;rgb:ffff/ffff/ffff\x1b\\'));

      const result = await promise;
      expect(result).toBe('unknown'); // Should still be 'unknown' from timeout
    });

    it('should ignore data events after successful resolution', async () => {
      const promise = detectTerminalBackground();

      setTimeout(() => {
        // First valid response
        mockStdin.emit('data', Buffer.from('\x1b]11;rgb:0000/0000/0000\x1b\\'));

        // Second response (should be ignored due to resolved flag)
        setTimeout(() => {
          mockStdin.emit(
            'data',
            Buffer.from('\x1b]11;rgb:ffff/ffff/ffff\x1b\\'),
          );
        }, 5);
      }, 10);

      const result = await promise;
      expect(result).toBe('dark'); // First response wins
    });

    it('should clear timeout when data arrives before timeout', async () => {
      vi.useFakeTimers();
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      const promise = detectTerminalBackground(100);

      // Emit data before timeout
      vi.advanceTimersByTime(50);
      mockStdin.emit('data', Buffer.from('\x1b]11;rgb:ffff/ffff/ffff\x1b\\'));

      await promise;

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should return "unknown" if setRawMode throws', async () => {
      // Mock setRawMode to throw only on the first call (during setup)
      // but succeed on the second call (during cleanup)
      let callCount = 0;
      mockStdin.setRawMode.mockImplementation((mode) => {
        callCount++;
        if (callCount === 1 && mode === true) {
          throw new Error('setRawMode failed');
        }
        return mockStdin;
      });

      const result = await detectTerminalBackground();

      expect(result).toBe('unknown');
    });

    it('should return "unknown" if write throws', async () => {
      mockStdout.write.mockImplementation(() => {
        throw new Error('write failed');
      });

      const result = await detectTerminalBackground();

      expect(result).toBe('unknown');
    });

    it('should handle malformed responses gracefully', async () => {
      vi.useFakeTimers();

      const promise = detectTerminalBackground();

      // Send malformed data
      vi.advanceTimersByTime(10);
      mockStdin.emit('data', Buffer.from('garbage data'));

      // Should timeout since regex won't match
      vi.advanceTimersByTime(90);

      const result = await promise;
      expect(result).toBe('unknown');
    });

    it('should handle incomplete OSC sequences', async () => {
      vi.useFakeTimers();

      const promise = detectTerminalBackground();

      // Send incomplete sequence
      vi.advanceTimersByTime(10);
      mockStdin.emit('data', Buffer.from('\x1b]11;rgb:ff'));

      // Should timeout
      vi.advanceTimersByTime(90);

      const result = await promise;
      expect(result).toBe('unknown');
    });
  });

  describe('WCAG luminance calculation', () => {
    // NOTE: These tests verify WCAG luminance calculation formula
    // Formula: (0.299*R + 0.587*G + 0.114*B) / 255
    // Threshold: > 0.5 is light, <= 0.5 is dark

    it('should correctly apply WCAG luminance formula', async () => {
      vi.useRealTimers();
      const promise = detectTerminalBackground();

      await new Promise((resolve) => setTimeout(resolve, 5));
      // Medium gray: 0x80 = 128
      // Luminance: (0.299*128 + 0.587*128 + 0.114*128) / 255 ≈ 0.502 (light)
      mockStdin.emit('data', Buffer.from('\x1b]11;rgb:8080/8080/8080\x1b\\'));

      const result = await promise;
      // Verification: This is above the 0.5 threshold
      expect(result).toBe('light');
    });
  });

  describe('Edge cases', () => {
    beforeEach(() => {
      vi.useRealTimers();
    });

    it('should handle RGB values with leading zeros', async () => {
      const promise = detectTerminalBackground();

      setTimeout(() => {
        mockStdin.emit('data', Buffer.from('\x1b]11;rgb:0001/0002/0003\x1b\\'));
      }, 10);

      const result = await promise;
      expect(result).toBe('dark');
    });

    it('should handle very long hex values (only use first 2 chars)', async () => {
      const promise = detectTerminalBackground();

      setTimeout(() => {
        // Hex values where first 2 chars are low (dark)
        // First 2 chars: 0x12 = 18, 0x23 = 35, 0x34 = 52
        // Luminance: (0.299*18 + 0.587*35 + 0.114*52) / 255 ≈ 0.11 < 0.5 (dark)
        mockStdin.emit(
          'data',
          Buffer.from('\x1b]11;rgb:1234ffff/2345ffff/3456ffff\x1b\\'),
        );
      }, 10);

      const result = await promise;
      expect(result).toBe('dark'); // First 2 chars determine darkness
    });

    it('should handle empty stdin data events', async () => {
      vi.useFakeTimers();

      const promise = detectTerminalBackground();

      // Send empty buffer
      vi.advanceTimersByTime(10);
      mockStdin.emit('data', Buffer.from(''));

      // Should timeout
      vi.advanceTimersByTime(90);

      const result = await promise;
      expect(result).toBe('unknown');
    });

    it('should handle multiple incomplete chunks building up to valid response', async () => {
      vi.useRealTimers();
      const promise = detectTerminalBackground();

      await new Promise((resolve) => setTimeout(resolve, 5));
      // Send in multiple chunks
      mockStdin.emit('data', Buffer.from('\x1b'));
      await new Promise((resolve) => setTimeout(resolve, 2));
      mockStdin.emit('data', Buffer.from(']11;'));
      await new Promise((resolve) => setTimeout(resolve, 2));
      mockStdin.emit('data', Buffer.from('rgb:ff'));
      await new Promise((resolve) => setTimeout(resolve, 2));
      mockStdin.emit('data', Buffer.from('ff/ffff/ffff\x1b\\'));

      const result = await promise;
      expect(result).toBe('light');
    });
  });
});
