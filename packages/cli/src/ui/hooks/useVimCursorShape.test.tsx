/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type React from 'react';
import { act } from 'react';
import { renderHook } from '../../test-utils/render.js';
import { useVimCursorShape } from './useVimCursorShape.js';
import type { VimMode } from './vim.js';

// ANSI escape sequences for cursor shapes
const CURSOR_RESET = '\x1b[0 q';
const CURSOR_STEADY_BLOCK = '\x1b[2 q';
const CURSOR_STEADY_BAR = '\x1b[6 q';

// Mock stdout
const mockStdout = {
  write: vi.fn(),
};

// Mock useStdout hook
vi.mock('ink', async () => {
  const actual = await vi.importActual('ink');
  return {
    ...actual,
    useStdout: () => ({ stdout: mockStdout }),
  };
});

// Mock the VimModeContext
const mockVimContext = {
  vimEnabled: false,
  vimMode: 'INSERT' as VimMode,
  toggleVimEnabled: vi.fn(),
  setVimMode: vi.fn(),
};

vi.mock('../contexts/VimModeContext.js', () => ({
  useVimMode: () => mockVimContext,
  VimModeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock the SettingsContext
const mockSettings = {
  merged: {
    general: {
      vimModeCursorShape: false,
    },
  },
};

vi.mock('../contexts/SettingsContext.js', () => ({
  useSettings: () => mockSettings,
}));

describe('useVimCursorShape', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Reset to default state
    mockVimContext.vimEnabled = false;
    mockVimContext.vimMode = 'INSERT';
    mockSettings.merged.general.vimModeCursorShape = false;
  });

  describe('when setting is disabled', () => {
    it('should not write any cursor sequences', () => {
      mockSettings.merged.general.vimModeCursorShape = false;
      mockVimContext.vimEnabled = true;
      mockVimContext.vimMode = 'NORMAL';

      renderHook(() => useVimCursorShape());

      expect(mockStdout.write).not.toHaveBeenCalled();
    });

    it('should not write cursor sequences when vim mode changes', () => {
      mockSettings.merged.general.vimModeCursorShape = false;
      mockVimContext.vimEnabled = true;
      mockVimContext.vimMode = 'NORMAL';

      const { rerender } = renderHook(() => useVimCursorShape());

      mockVimContext.vimMode = 'INSERT';
      rerender();

      expect(mockStdout.write).not.toHaveBeenCalled();
    });
  });

  describe('when setting is enabled', () => {
    beforeEach(() => {
      mockSettings.merged.general.vimModeCursorShape = true;
    });

    it('should set block cursor when vim is disabled', () => {
      mockVimContext.vimEnabled = false;

      renderHook(() => useVimCursorShape());

      expect(mockStdout.write).toHaveBeenCalledWith(CURSOR_STEADY_BLOCK);
    });

    it('should set bar cursor when in INSERT mode', () => {
      mockVimContext.vimEnabled = true;
      mockVimContext.vimMode = 'INSERT';

      renderHook(() => useVimCursorShape());

      expect(mockStdout.write).toHaveBeenCalledWith(CURSOR_STEADY_BAR);
    });

    it('should set block cursor when in NORMAL mode', () => {
      mockVimContext.vimEnabled = true;
      mockVimContext.vimMode = 'NORMAL';

      renderHook(() => useVimCursorShape());

      expect(mockStdout.write).toHaveBeenCalledWith(CURSOR_STEADY_BLOCK);
    });

    describe('mode transitions', () => {
      it('should change cursor from bar to block when switching INSERT to NORMAL', () => {
        mockVimContext.vimEnabled = true;
        mockVimContext.vimMode = 'INSERT';

        const { rerender } = renderHook(() => useVimCursorShape());

        expect(mockStdout.write).toHaveBeenLastCalledWith(CURSOR_STEADY_BAR);

        mockStdout.write.mockClear();
        mockVimContext.vimMode = 'NORMAL';
        rerender();

        // Should reset to block (cleanup) then set to block (new effect)
        expect(mockStdout.write).toHaveBeenCalledWith(CURSOR_STEADY_BLOCK);
        expect(mockStdout.write).toHaveBeenCalledTimes(2);
      });

      it('should change cursor from block to bar when switching NORMAL to INSERT', () => {
        mockVimContext.vimEnabled = true;
        mockVimContext.vimMode = 'NORMAL';

        const { rerender } = renderHook(() => useVimCursorShape());

        expect(mockStdout.write).toHaveBeenLastCalledWith(CURSOR_STEADY_BLOCK);

        mockStdout.write.mockClear();
        mockVimContext.vimMode = 'INSERT';
        rerender();

        // Should reset to block (cleanup) then set to bar (new effect)
        expect(mockStdout.write).toHaveBeenCalledWith(CURSOR_STEADY_BLOCK);
        expect(mockStdout.write).toHaveBeenCalledWith(CURSOR_STEADY_BAR);
        expect(mockStdout.write).toHaveBeenCalledTimes(2);
      });
    });

    describe('vim enabled/disabled transitions', () => {
      it('should reset to block when vim is disabled', () => {
        mockVimContext.vimEnabled = true;
        mockVimContext.vimMode = 'INSERT';

        const { rerender } = renderHook(() => useVimCursorShape());

        expect(mockStdout.write).toHaveBeenLastCalledWith(CURSOR_STEADY_BAR);

        mockStdout.write.mockClear();
        mockVimContext.vimEnabled = false;
        rerender();

        // Should reset to block (cleanup) then set to block because vim is disabled
        expect(mockStdout.write).toHaveBeenCalledWith(CURSOR_STEADY_BLOCK);
        expect(mockStdout.write).toHaveBeenCalledTimes(2);
      });

      it('should set appropriate cursor when vim is enabled', () => {
        mockVimContext.vimEnabled = false;

        const { rerender } = renderHook(() => useVimCursorShape());

        expect(mockStdout.write).toHaveBeenLastCalledWith(CURSOR_STEADY_BLOCK);

        mockStdout.write.mockClear();
        mockVimContext.vimEnabled = true;
        mockVimContext.vimMode = 'INSERT';
        rerender();

        // Should reset to block (cleanup) then set to bar (INSERT mode)
        expect(mockStdout.write).toHaveBeenCalledWith(CURSOR_STEADY_BLOCK);
        expect(mockStdout.write).toHaveBeenCalledWith(CURSOR_STEADY_BAR);
        expect(mockStdout.write).toHaveBeenCalledTimes(2);
      });
    });

    describe('runtime setting changes', () => {
      it('should stop writing cursor sequences when setting is disabled at runtime', () => {
        mockVimContext.vimEnabled = true;
        mockVimContext.vimMode = 'INSERT';

        const { rerender } = renderHook(() => useVimCursorShape());

        expect(mockStdout.write).toHaveBeenCalledWith(CURSOR_STEADY_BAR);

        mockStdout.write.mockClear();
        mockSettings.merged.general.vimModeCursorShape = false;
        rerender();

        // Should reset to block (cleanup) then not call again because setting is disabled
        expect(mockStdout.write).toHaveBeenCalledWith(CURSOR_STEADY_BLOCK);
        expect(mockStdout.write).toHaveBeenCalledTimes(1);
      });

      it('should start writing cursor sequences when setting is enabled at runtime', () => {
        mockSettings.merged.general.vimModeCursorShape = false;
        mockVimContext.vimEnabled = true;
        mockVimContext.vimMode = 'INSERT';

        const { rerender } = renderHook(() => useVimCursorShape());

        expect(mockStdout.write).not.toHaveBeenCalled();

        mockSettings.merged.general.vimModeCursorShape = true;
        rerender();

        expect(mockStdout.write).toHaveBeenCalledWith(CURSOR_STEADY_BAR);
      });
    });

    describe('cleanup', () => {
      it('should reset to block and then default cursor on unmount', () => {
        mockVimContext.vimEnabled = true;
        mockVimContext.vimMode = 'INSERT';

        const { unmount } = renderHook(() => useVimCursorShape());

        mockStdout.write.mockClear();

        act(() => {
          unmount();
        });

        // Should call both cleanup functions:
        // 1. First effect cleanup (reset to block)
        // 2. Final unmount cleanup (reset to default)
        expect(mockStdout.write).toHaveBeenCalledWith(CURSOR_STEADY_BLOCK);
        expect(mockStdout.write).toHaveBeenCalledWith(CURSOR_RESET);
        expect(mockStdout.write).toHaveBeenCalledTimes(2);
      });

      it('should reset to block cursor when effect dependencies change', () => {
        mockVimContext.vimEnabled = true;
        mockVimContext.vimMode = 'NORMAL';

        const { rerender } = renderHook(() => useVimCursorShape());

        expect(mockStdout.write).toHaveBeenCalledWith(CURSOR_STEADY_BLOCK);

        mockStdout.write.mockClear();
        mockVimContext.vimMode = 'INSERT';
        rerender();

        // First call is cleanup (reset to block), second is new effect (set to bar)
        const calls = mockStdout.write.mock.calls;
        expect(calls[0][0]).toBe(CURSOR_STEADY_BLOCK);
        expect(calls[1][0]).toBe(CURSOR_STEADY_BAR);
      });
    });

    describe('edge cases', () => {
      it('should handle vim disabled while setting is enabled', () => {
        mockVimContext.vimEnabled = false;
        mockVimContext.vimMode = 'INSERT';

        renderHook(() => useVimCursorShape());

        // Should set block cursor even though vim is disabled
        expect(mockStdout.write).toHaveBeenCalledWith(CURSOR_STEADY_BLOCK);
      });

      it('should handle multiple rapid mode changes', () => {
        mockVimContext.vimEnabled = true;
        mockVimContext.vimMode = 'INSERT';

        const { rerender } = renderHook(() => useVimCursorShape());

        mockStdout.write.mockClear();

        // Rapidly switch modes
        mockVimContext.vimMode = 'NORMAL';
        rerender();
        mockVimContext.vimMode = 'INSERT';
        rerender();
        mockVimContext.vimMode = 'NORMAL';
        rerender();

        // Each rerender triggers cleanup (block) + new effect
        // So we should see alternating block/block and block/bar patterns
        const lastCall =
          mockStdout.write.mock.calls[mockStdout.write.mock.calls.length - 1];
        expect(lastCall[0]).toBe(CURSOR_STEADY_BLOCK); // Last mode was NORMAL
      });

      it('should handle setting enabled with vim already in NORMAL mode', () => {
        mockSettings.merged.general.vimModeCursorShape = false;
        mockVimContext.vimEnabled = true;
        mockVimContext.vimMode = 'NORMAL';

        const { rerender } = renderHook(() => useVimCursorShape());

        expect(mockStdout.write).not.toHaveBeenCalled();

        mockSettings.merged.general.vimModeCursorShape = true;
        rerender();

        expect(mockStdout.write).toHaveBeenCalledWith(CURSOR_STEADY_BLOCK);
      });
    });
  });
});
