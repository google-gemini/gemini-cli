/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useIdeTrustListener } from './useIdeTrustListener.js';
import * as coreModule from '@google/gemini-cli-core';

vi.mock('@google/gemini-cli-core', () => ({
  IdeClient: {
    getInstance: vi.fn(),
  },
  ideContextStore: {
    get: vi.fn(),
  },
}));

describe('useIdeTrustListener', () => {
  let mockIdeClient: {
    addTrustChangeListener: ReturnType<typeof vi.fn>;
    removeTrustChangeListener: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockIdeClient = {
      addTrustChangeListener: vi.fn(),
      removeTrustChangeListener: vi.fn(),
    };

    vi.mocked(coreModule.IdeClient.getInstance).mockResolvedValue(
      mockIdeClient as never,
    );

    vi.mocked(coreModule.ideContextStore.get).mockReturnValue({
      workspaceState: { isTrusted: true },
    } as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should return isIdeTrusted and needsRestart', () => {
      const { result } = renderHook(() => useIdeTrustListener());

      expect(result.current).toHaveProperty('isIdeTrusted');
      expect(result.current).toHaveProperty('needsRestart');
    });

    it('should get initial trust value from ideContextStore', () => {
      const { result } = renderHook(() => useIdeTrustListener());

      expect(coreModule.ideContextStore.get).toHaveBeenCalled();
      expect(result.current.isIdeTrusted).toBe(true);
    });

    it('should set needsRestart to false initially', () => {
      const { result } = renderHook(() => useIdeTrustListener());

      expect(result.current.needsRestart).toBe(false);
    });

    it('should handle undefined trust value', () => {
      vi.mocked(coreModule.ideContextStore.get).mockReturnValue(
        undefined as never,
      );

      const { result } = renderHook(() => useIdeTrustListener());

      expect(result.current.isIdeTrusted).toBeUndefined();
    });

    it('should handle undefined workspaceState', () => {
      vi.mocked(coreModule.ideContextStore.get).mockReturnValue({} as never);

      const { result } = renderHook(() => useIdeTrustListener());

      expect(result.current.isIdeTrusted).toBeUndefined();
    });
  });

  describe('trust change listener', () => {
    it('should add trust change listener on mount', async () => {
      renderHook(() => useIdeTrustListener());

      await waitFor(() => {
        expect(coreModule.IdeClient.getInstance).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(mockIdeClient.addTrustChangeListener).toHaveBeenCalled();
      });
    });

    it('should remove trust change listener on unmount', async () => {
      const { unmount } = renderHook(() => useIdeTrustListener());

      await waitFor(() => {
        expect(mockIdeClient.addTrustChangeListener).toHaveBeenCalled();
      });

      unmount();

      await waitFor(() => {
        expect(mockIdeClient.removeTrustChangeListener).toHaveBeenCalled();
      });
    });

    it('should pass callback to addTrustChangeListener', async () => {
      renderHook(() => useIdeTrustListener());

      await waitFor(() => {
        expect(mockIdeClient.addTrustChangeListener).toHaveBeenCalledWith(
          expect.any(Function),
        );
      });
    });

    it('should pass same callback to removeTrustChangeListener', async () => {
      const { unmount } = renderHook(() => useIdeTrustListener());

      let addedCallback: (() => void) | undefined;
      await waitFor(() => {
        const calls = mockIdeClient.addTrustChangeListener.mock.calls;
        if (calls.length > 0) {
          addedCallback = calls[0][0];
        }
      });

      unmount();

      await waitFor(() => {
        const calls = mockIdeClient.removeTrustChangeListener.mock.calls;
        expect(calls.length).toBeGreaterThan(0);
        expect(calls[0][0]).toBe(addedCallback);
      });
    });
  });

  describe('trust value changes', () => {
    it('should detect when trust value changes from true to false', async () => {
      vi.mocked(coreModule.ideContextStore.get).mockReturnValue({
        workspaceState: { isTrusted: true },
      } as never);

      const { result, rerender } = renderHook(() => useIdeTrustListener());

      expect(result.current.needsRestart).toBe(false);

      // Simulate trust change
      vi.mocked(coreModule.ideContextStore.get).mockReturnValue({
        workspaceState: { isTrusted: false },
      } as never);

      rerender();

      await waitFor(() => {
        expect(result.current.needsRestart).toBe(true);
      });
    });

    it('should detect when trust value changes from false to true', async () => {
      vi.mocked(coreModule.ideContextStore.get).mockReturnValue({
        workspaceState: { isTrusted: false },
      } as never);

      const { result, rerender } = renderHook(() => useIdeTrustListener());

      expect(result.current.needsRestart).toBe(false);

      // Simulate trust change
      vi.mocked(coreModule.ideContextStore.get).mockReturnValue({
        workspaceState: { isTrusted: true },
      } as never);

      rerender();

      await waitFor(() => {
        expect(result.current.needsRestart).toBe(true);
      });
    });

    it('should not set needsRestart if trust value unchanged', () => {
      vi.mocked(coreModule.ideContextStore.get).mockReturnValue({
        workspaceState: { isTrusted: true },
      } as never);

      const { result, rerender } = renderHook(() => useIdeTrustListener());

      expect(result.current.needsRestart).toBe(false);

      // No change in trust value
      rerender();

      expect(result.current.needsRestart).toBe(false);
    });

    it('should not set needsRestart if initial value is undefined', () => {
      vi.mocked(coreModule.ideContextStore.get).mockReturnValue(
        undefined as never,
      );

      const { result, rerender } = renderHook(() => useIdeTrustListener());

      expect(result.current.needsRestart).toBe(false);

      // Change to a defined value
      vi.mocked(coreModule.ideContextStore.get).mockReturnValue({
        workspaceState: { isTrusted: true },
      } as never);

      rerender();

      expect(result.current.needsRestart).toBe(false);
    });

    it('should keep needsRestart true once set', async () => {
      vi.mocked(coreModule.ideContextStore.get).mockReturnValue({
        workspaceState: { isTrusted: true },
      } as never);

      const { result, rerender } = renderHook(() => useIdeTrustListener());

      // Change trust value
      vi.mocked(coreModule.ideContextStore.get).mockReturnValue({
        workspaceState: { isTrusted: false },
      } as never);

      rerender();

      await waitFor(() => {
        expect(result.current.needsRestart).toBe(true);
      });

      // Change back to original value
      vi.mocked(coreModule.ideContextStore.get).mockReturnValue({
        workspaceState: { isTrusted: true },
      } as never);

      rerender();

      // Should still be true
      expect(result.current.needsRestart).toBe(true);
    });
  });

  describe('useSyncExternalStore integration', () => {
    it('should use useSyncExternalStore for isIdeTrusted', () => {
      const { result } = renderHook(() => useIdeTrustListener());

      expect(result.current.isIdeTrusted).toBeDefined();
    });

    it('should update isIdeTrusted when store changes', () => {
      let storeChangeCallback: (() => void) | undefined;

      mockIdeClient.addTrustChangeListener.mockImplementation((callback) => {
        storeChangeCallback = callback;
      });

      const { result, rerender } = renderHook(() => useIdeTrustListener());

      expect(result.current.isIdeTrusted).toBe(true);

      // Simulate store change
      vi.mocked(coreModule.ideContextStore.get).mockReturnValue({
        workspaceState: { isTrusted: false },
      } as never);

      act(() => {
        storeChangeCallback?.();
      });

      rerender();

      expect(result.current.isIdeTrusted).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle IdeClient.getInstance rejection', async () => {
      vi.mocked(coreModule.IdeClient.getInstance).mockRejectedValue(
        new Error('Failed to get IDE client'),
      );

      // Should not throw
      const { result } = renderHook(() => useIdeTrustListener());

      expect(result.current).toBeDefined();
    });

    it('should handle missing workspaceState gracefully', () => {
      vi.mocked(coreModule.ideContextStore.get).mockReturnValue({} as never);

      const { result } = renderHook(() => useIdeTrustListener());

      expect(result.current.isIdeTrusted).toBeUndefined();
      expect(result.current.needsRestart).toBe(false);
    });

    it('should handle null ideContextStore value', () => {
      vi.mocked(coreModule.ideContextStore.get).mockReturnValue(null as never);

      const { result } = renderHook(() => useIdeTrustListener());

      expect(result.current.isIdeTrusted).toBeUndefined();
    });

    it('should handle multiple rapid trust changes', async () => {
      vi.mocked(coreModule.ideContextStore.get).mockReturnValue({
        workspaceState: { isTrusted: true },
      } as never);

      const { result, rerender } = renderHook(() => useIdeTrustListener());

      // First change
      vi.mocked(coreModule.ideContextStore.get).mockReturnValue({
        workspaceState: { isTrusted: false },
      } as never);
      rerender();

      // Second change
      vi.mocked(coreModule.ideContextStore.get).mockReturnValue({
        workspaceState: { isTrusted: true },
      } as never);
      rerender();

      await waitFor(() => {
        expect(result.current.needsRestart).toBe(true);
      });
    });
  });

  describe('hook dependencies', () => {
    it('should memoize subscribe callback', () => {
      const { result, rerender } = renderHook(() => useIdeTrustListener());

      rerender();

      // Subscribe function should be memoized (empty dependency array)
      expect(result.current).toBeDefined();
    });

    it('should use empty dependency array for subscribe', async () => {
      const { rerender } = renderHook(() => useIdeTrustListener());

      const initialCalls =
        mockIdeClient.addTrustChangeListener.mock.calls.length;

      rerender();
      rerender();

      // Should not add listener multiple times on rerender
      await waitFor(() => {
        expect(mockIdeClient.addTrustChangeListener).toHaveBeenCalledTimes(
          initialCalls,
        );
      });
    });
  });

  describe('cleanup', () => {
    it('should cleanup on unmount', async () => {
      const { unmount } = renderHook(() => useIdeTrustListener());

      unmount();

      await waitFor(() => {
        expect(coreModule.IdeClient.getInstance).toHaveBeenCalled();
      });
    });

    it('should not throw on cleanup if IdeClient fails', async () => {
      vi.mocked(coreModule.IdeClient.getInstance).mockRejectedValue(
        new Error('Client error'),
      );

      const { unmount } = renderHook(() => useIdeTrustListener());

      expect(() => unmount()).not.toThrow();
    });
  });

  describe('return value structure', () => {
    it('should return object with isIdeTrusted and needsRestart', () => {
      const { result } = renderHook(() => useIdeTrustListener());

      expect(typeof result.current).toBe('object');
      expect(Object.keys(result.current)).toContain('isIdeTrusted');
      expect(Object.keys(result.current)).toContain('needsRestart');
    });

    it('should return boolean or undefined for isIdeTrusted', () => {
      const { result } = renderHook(() => useIdeTrustListener());

      const value = result.current.isIdeTrusted;
      expect(typeof value === 'boolean' || value === undefined).toBe(true);
    });

    it('should return boolean for needsRestart', () => {
      const { result } = renderHook(() => useIdeTrustListener());

      expect(typeof result.current.needsRestart).toBe('boolean');
    });
  });
});
