/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  handleCopyKeyPress,
  temporarilyDisableMouseForCopy,
  reEnableMouseAfterCopy,
  cancelCopyHandler,
  isCopyInProgress,
} from './nativeSelection.js';

describe('nativeSelection', () => {
  let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    stdoutWriteSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true) as unknown as ReturnType<typeof vi.spyOn>;
  });

  afterEach(() => {
    // Cancel any pending timeouts to clean up module state
    cancelCopyHandler();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('temporarilyDisableMouseForCopy', () => {
    it('should write escape sequence to disable mouse events', () => {
      temporarilyDisableMouseForCopy();

      expect(stdoutWriteSpy).toHaveBeenCalledWith('\u001b[?1002l\u001b[?1006l');
    });
  });

  describe('reEnableMouseAfterCopy', () => {
    it('should write escape sequence to re-enable mouse events', () => {
      reEnableMouseAfterCopy();

      expect(stdoutWriteSpy).toHaveBeenCalledWith('\u001b[?1002h\u001b[?1006h');
    });
  });

  describe('handleCopyKeyPress', () => {
    it('should disable mouse events and set up re-enable timer', () => {
      const result = handleCopyKeyPress();

      expect(result).toBe(true);
      expect(stdoutWriteSpy).toHaveBeenCalledWith('\u001b[?1002l\u001b[?1006l');
      expect(isCopyInProgress()).toBe(true);

      // Fast-forward time to trigger re-enable
      vi.advanceTimersByTime(200);

      expect(stdoutWriteSpy).toHaveBeenCalledWith('\u001b[?1002h\u001b[?1006h');
      expect(isCopyInProgress()).toBe(false);
    });

    it('should return false if copy is already in progress', () => {
      const firstResult = handleCopyKeyPress();
      expect(firstResult).toBe(true);

      // Try to handle copy again before timeout
      const secondResult = handleCopyKeyPress();
      expect(secondResult).toBe(false);

      // Should only have called disable once
      expect(stdoutWriteSpy).toHaveBeenCalledTimes(1);
    });

    it('should allow new copy after timeout completes', () => {
      handleCopyKeyPress();
      expect(isCopyInProgress()).toBe(true);

      // Fast-forward past the timeout
      vi.advanceTimersByTime(200);
      expect(isCopyInProgress()).toBe(false);

      // Now should be able to handle copy again
      const result = handleCopyKeyPress();
      expect(result).toBe(true);
      expect(isCopyInProgress()).toBe(true);
    });
  });

  describe('cancelCopyHandler', () => {
    it('should cancel pending timeout and re-enable mouse events', () => {
      handleCopyKeyPress();
      expect(isCopyInProgress()).toBe(true);

      stdoutWriteSpy.mockClear();
      cancelCopyHandler();

      expect(isCopyInProgress()).toBe(false);
      expect(stdoutWriteSpy).toHaveBeenCalledWith('\u001b[?1002h\u001b[?1006h');

      // Advancing time should not trigger the original timeout
      vi.advanceTimersByTime(300);
      expect(stdoutWriteSpy).toHaveBeenCalledTimes(1); // Only the cancelCopyHandler call
    });

    it('should be safe to call when no copy is in progress', () => {
      expect(isCopyInProgress()).toBe(false);

      cancelCopyHandler();

      expect(isCopyInProgress()).toBe(false);
      expect(stdoutWriteSpy).not.toHaveBeenCalled();
    });
  });

  describe('isCopyInProgress', () => {
    it('should return false initially', () => {
      expect(isCopyInProgress()).toBe(false);
    });

    it('should return true when copy is in progress', () => {
      handleCopyKeyPress();
      expect(isCopyInProgress()).toBe(true);
    });

    it('should return false after timeout', () => {
      handleCopyKeyPress();
      vi.advanceTimersByTime(200);
      expect(isCopyInProgress()).toBe(false);
    });

    it('should return false after cancellation', () => {
      handleCopyKeyPress();
      cancelCopyHandler();
      expect(isCopyInProgress()).toBe(false);
    });
  });
});
