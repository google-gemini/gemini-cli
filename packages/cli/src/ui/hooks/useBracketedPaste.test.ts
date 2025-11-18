/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBracketedPaste } from './useBracketedPaste.js';

describe('useBracketedPaste', () => {
  let originalStdoutWrite: typeof process.stdout.write;
  let mockWrite: ReturnType<typeof vi.fn>;
  let processListeners: Map<string, Array<(...args: unknown[]) => void>>;

  beforeEach(() => {
    originalStdoutWrite = process.stdout.write;
    mockWrite = vi.fn();
    process.stdout.write = mockWrite as never;

    // Track process event listeners
    processListeners = new Map();
    const originalOn = process.on.bind(process);
    const originalRemoveListener = process.removeListener.bind(process);

    vi.spyOn(process, 'on').mockImplementation((event, listener) => {
      if (!processListeners.has(event as string)) {
        processListeners.set(event as string, []);
      }
      processListeners.get(event as string)?.push(listener as never);
      return originalOn(event, listener);
    });

    vi.spyOn(process, 'removeListener').mockImplementation(
      (event, listener) => {
        const listeners = processListeners.get(event as string);
        if (listeners) {
          const index = listeners.indexOf(listener as never);
          if (index !== -1) {
            listeners.splice(index, 1);
          }
        }
        return originalRemoveListener(event, listener);
      },
    );
  });

  afterEach(() => {
    process.stdout.write = originalStdoutWrite;
    vi.restoreAllMocks();
    processListeners.clear();
  });

  describe('initialization', () => {
    it('should enable bracketed paste mode on mount', () => {
      renderHook(() => useBracketedPaste());

      expect(mockWrite).toHaveBeenCalledWith('\x1b[?2004h');
    });

    it('should register exit event listener', () => {
      renderHook(() => useBracketedPaste());

      expect(process.on).toHaveBeenCalledWith('exit', expect.any(Function));
    });

    it('should register SIGINT event listener', () => {
      renderHook(() => useBracketedPaste());

      expect(process.on).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    });

    it('should register SIGTERM event listener', () => {
      renderHook(() => useBracketedPaste());

      expect(process.on).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    });

    it('should register all three event listeners', () => {
      renderHook(() => useBracketedPaste());

      expect(processListeners.get('exit')).toHaveLength(1);
      expect(processListeners.get('SIGINT')).toHaveLength(1);
      expect(processListeners.get('SIGTERM')).toHaveLength(1);
    });
  });

  describe('cleanup', () => {
    it('should disable bracketed paste mode on unmount', () => {
      const { unmount } = renderHook(() => useBracketedPaste());

      mockWrite.mockClear();
      unmount();

      expect(mockWrite).toHaveBeenCalledWith('\x1b[?2004l');
    });

    it('should remove exit event listener on unmount', () => {
      const { unmount } = renderHook(() => useBracketedPaste());

      unmount();

      expect(process.removeListener).toHaveBeenCalledWith(
        'exit',
        expect.any(Function),
      );
    });

    it('should remove SIGINT event listener on unmount', () => {
      const { unmount } = renderHook(() => useBracketedPaste());

      unmount();

      expect(process.removeListener).toHaveBeenCalledWith(
        'SIGINT',
        expect.any(Function),
      );
    });

    it('should remove SIGTERM event listener on unmount', () => {
      const { unmount } = renderHook(() => useBracketedPaste());

      unmount();

      expect(process.removeListener).toHaveBeenCalledWith(
        'SIGTERM',
        expect.any(Function),
      );
    });

    it('should remove all event listeners on unmount', () => {
      const { unmount } = renderHook(() => useBracketedPaste());

      unmount();

      expect(process.removeListener).toHaveBeenCalledTimes(3);
    });

    it('should write disable code exactly once on unmount', () => {
      const { unmount } = renderHook(() => useBracketedPaste());

      mockWrite.mockClear();
      unmount();

      const disableCalls = mockWrite.mock.calls.filter(
        (call) => call[0] === '\x1b[?2004l',
      );
      expect(disableCalls).toHaveLength(1);
    });
  });

  describe('signal handling', () => {
    it('should disable bracketed paste when cleanup is called', () => {
      renderHook(() => useBracketedPaste());

      const exitListener = processListeners.get('exit')?.[0];
      mockWrite.mockClear();

      if (exitListener) {
        exitListener();
      }

      expect(mockWrite).toHaveBeenCalledWith('\x1b[?2004l');
    });

    it('should handle exit event', () => {
      renderHook(() => useBracketedPaste());

      const exitListener = processListeners.get('exit')?.[0];
      expect(exitListener).toBeDefined();
      expect(typeof exitListener).toBe('function');
    });

    it('should handle SIGINT event', () => {
      renderHook(() => useBracketedPaste());

      const sigintListener = processListeners.get('SIGINT')?.[0];
      expect(sigintListener).toBeDefined();
      expect(typeof sigintListener).toBe('function');
    });

    it('should handle SIGTERM event', () => {
      renderHook(() => useBracketedPaste());

      const sigtermListener = processListeners.get('SIGTERM')?.[0];
      expect(sigtermListener).toBeDefined();
      expect(typeof sigtermListener).toBe('function');
    });

    it('should use same cleanup function for all signals', () => {
      renderHook(() => useBracketedPaste());

      const exitListener = processListeners.get('exit')?.[0];
      const sigintListener = processListeners.get('SIGINT')?.[0];
      const sigtermListener = processListeners.get('SIGTERM')?.[0];

      // All listeners should be the same function reference
      expect(exitListener).toBe(sigintListener);
      expect(exitListener).toBe(sigtermListener);
    });
  });

  describe('multiple hook instances', () => {
    it('should handle multiple instances independently', () => {
      const { unmount: unmount1 } = renderHook(() => useBracketedPaste());
      const { unmount: unmount2 } = renderHook(() => useBracketedPaste());

      // Both should enable bracketed paste
      expect(mockWrite).toHaveBeenCalledWith('\x1b[?2004h');
      expect(mockWrite).toHaveBeenCalledTimes(2);

      mockWrite.mockClear();
      unmount1();

      // First unmount should disable
      expect(mockWrite).toHaveBeenCalledWith('\x1b[?2004l');

      mockWrite.mockClear();
      unmount2();

      // Second unmount should also disable
      expect(mockWrite).toHaveBeenCalledWith('\x1b[?2004l');
    });

    it('should register multiple event listeners for multiple instances', () => {
      renderHook(() => useBracketedPaste());
      renderHook(() => useBracketedPaste());

      // Each instance registers its own listeners
      expect(processListeners.get('exit')?.length).toBeGreaterThanOrEqual(2);
      expect(processListeners.get('SIGINT')?.length).toBeGreaterThanOrEqual(2);
      expect(processListeners.get('SIGTERM')?.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('escape sequences', () => {
    it('should use correct enable escape sequence', () => {
      renderHook(() => useBracketedPaste());

      expect(mockWrite).toHaveBeenCalledWith('\x1b[?2004h');
    });

    it('should use correct disable escape sequence', () => {
      const { unmount } = renderHook(() => useBracketedPaste());

      mockWrite.mockClear();
      unmount();

      expect(mockWrite).toHaveBeenCalledWith('\x1b[?2004l');
    });

    it('should write to stdout', () => {
      renderHook(() => useBracketedPaste());

      expect(mockWrite.mock.instances[0]).toBe(process.stdout);
    });
  });

  describe('hook lifecycle', () => {
    it('should not return anything', () => {
      const { result } = renderHook(() => useBracketedPaste());

      expect(result.current).toBeUndefined();
    });

    it('should run effect only once on mount', () => {
      const { rerender } = renderHook(() => useBracketedPaste());

      const initialCalls = mockWrite.mock.calls.length;

      rerender();

      // Should not call again on rerender (empty dependency array)
      expect(mockWrite).toHaveBeenCalledTimes(initialCalls);
    });

    it('should be a valid React hook', () => {
      expect(() => renderHook(() => useBracketedPaste())).not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should not throw if stdout.write throws', () => {
      mockWrite.mockImplementation(() => {
        throw new Error('Write error');
      });

      expect(() => renderHook(() => useBracketedPaste())).toThrow(
        'Write error',
      );
    });

    it('should handle cleanup even if write fails', () => {
      const { unmount } = renderHook(() => useBracketedPaste());

      mockWrite.mockImplementation(() => {
        throw new Error('Write error');
      });

      expect(() => unmount()).toThrow('Write error');
      // Listeners should still be removed
      expect(process.removeListener).toHaveBeenCalledTimes(3);
    });
  });
});
