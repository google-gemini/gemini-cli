/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { renderHook } from '../../test-utils/render.js';
import { useTabbedNavigation } from './useTabbedNavigation.js';
import { useKeypress } from './useKeypress.js';
import type { Key, KeypressHandler } from '../contexts/KeypressContext.js';

vi.mock('./useKeypress.js', () => ({
  useKeypress: vi.fn(),
}));

const createKey = (partial: Partial<Key>): Key => ({
  name: partial.name || '',
  sequence: partial.sequence || '',
  shift: partial.shift || false,
  alt: partial.alt || false,
  ctrl: partial.ctrl || false,
  cmd: partial.cmd || false,
  insertable: partial.insertable || false,
  ...partial,
});

vi.mock('../keyMatchers.js', () => ({
  keyMatchers: {
    'cursor.left': vi.fn((key) => key.name === 'left'),
    'cursor.right': vi.fn((key) => key.name === 'right'),
    'dialog.next': vi.fn((key) => key.name === 'tab' && !key.shift),
    'dialog.previous': vi.fn((key) => key.name === 'tab' && key.shift),
  },
  Command: {
    MOVE_LEFT: 'cursor.left',
    MOVE_RIGHT: 'cursor.right',
    DIALOG_NEXT: 'dialog.next',
    DIALOG_PREV: 'dialog.previous',
  },
}));

describe('useTabbedNavigation', () => {
  let capturedHandler: KeypressHandler;

  beforeEach(() => {
    vi.mocked(useKeypress).mockImplementation((handler) => {
      capturedHandler = handler;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('keyboard navigation', () => {
    it('moves to next tab on Right arrow', () => {
      const { result } = renderHook(() =>
        useTabbedNavigation({ tabCount: 3, enableArrowNavigation: true }),
      );

      act(() => {
        capturedHandler(createKey({ name: 'right' }));
      });

      expect(result.current.currentIndex).toBe(1);
    });

    it('moves to previous tab on Left arrow', () => {
      const { result } = renderHook(() =>
        useTabbedNavigation({
          tabCount: 3,
          initialIndex: 1,
          enableArrowNavigation: true,
        }),
      );

      act(() => {
        capturedHandler(createKey({ name: 'left' }));
      });

      expect(result.current.currentIndex).toBe(0);
    });

    it('moves to next tab on Tab key', () => {
      const { result } = renderHook(() =>
        useTabbedNavigation({ tabCount: 3, enableTabKey: true }),
      );

      act(() => {
        capturedHandler(createKey({ name: 'tab', shift: false }));
      });

      expect(result.current.currentIndex).toBe(1);
    });

    it('moves to previous tab on Shift+Tab key', () => {
      const { result } = renderHook(() =>
        useTabbedNavigation({
          tabCount: 3,
          initialIndex: 1,
          enableTabKey: true,
        }),
      );

      act(() => {
        capturedHandler(createKey({ name: 'tab', shift: true }));
      });

      expect(result.current.currentIndex).toBe(0);
    });

    it('does not navigate when isNavigationBlocked returns true', () => {
      const { result } = renderHook(() =>
        useTabbedNavigation({
          tabCount: 3,
          enableArrowNavigation: true,
          isNavigationBlocked: () => true,
        }),
      );

      act(() => {
        capturedHandler(createKey({ name: 'right' }));
      });

      expect(result.current.currentIndex).toBe(0);
    });
  });

  describe('initialization', () => {
    it('returns initial index of 0 by default', () => {
      const { result } = renderHook(() => useTabbedNavigation({ tabCount: 3 }));
      expect(result.current.currentIndex).toBe(0);
    });

    it('returns specified initial index', () => {
      const { result } = renderHook(() =>
        useTabbedNavigation({ tabCount: 3, initialIndex: 2 }),
      );
      expect(result.current.currentIndex).toBe(2);
    });

    it('clamps initial index to valid range', () => {
      const { result: high } = renderHook(() =>
        useTabbedNavigation({ tabCount: 3, initialIndex: 10 }),
      );
      expect(high.current.currentIndex).toBe(2);

      const { result: negative } = renderHook(() =>
        useTabbedNavigation({ tabCount: 3, initialIndex: -1 }),
      );
      expect(negative.current.currentIndex).toBe(0);
    });
  });

  describe('goToNextTab', () => {
    it('advances to next tab', () => {
      const { result } = renderHook(() => useTabbedNavigation({ tabCount: 3 }));

      act(() => {
        result.current.goToNextTab();
      });

      expect(result.current.currentIndex).toBe(1);
    });

    it('stops at last tab when wrapAround is false', () => {
      const { result } = renderHook(() =>
        useTabbedNavigation({
          tabCount: 3,
          initialIndex: 2,
          wrapAround: false,
        }),
      );

      act(() => {
        result.current.goToNextTab();
      });

      expect(result.current.currentIndex).toBe(2);
    });

    it('wraps to first tab when wrapAround is true', () => {
      const { result } = renderHook(() =>
        useTabbedNavigation({ tabCount: 3, initialIndex: 2, wrapAround: true }),
      );

      act(() => {
        result.current.goToNextTab();
      });

      expect(result.current.currentIndex).toBe(0);
    });
  });

  describe('goToPrevTab', () => {
    it('moves to previous tab', () => {
      const { result } = renderHook(() =>
        useTabbedNavigation({ tabCount: 3, initialIndex: 2 }),
      );

      act(() => {
        result.current.goToPrevTab();
      });

      expect(result.current.currentIndex).toBe(1);
    });

    it('stops at first tab when wrapAround is false', () => {
      const { result } = renderHook(() =>
        useTabbedNavigation({
          tabCount: 3,
          initialIndex: 0,
          wrapAround: false,
        }),
      );

      act(() => {
        result.current.goToPrevTab();
      });

      expect(result.current.currentIndex).toBe(0);
    });

    it('wraps to last tab when wrapAround is true', () => {
      const { result } = renderHook(() =>
        useTabbedNavigation({ tabCount: 3, initialIndex: 0, wrapAround: true }),
      );

      act(() => {
        result.current.goToPrevTab();
      });

      expect(result.current.currentIndex).toBe(2);
    });
  });

  describe('setCurrentIndex', () => {
    it('sets index directly', () => {
      const { result } = renderHook(() => useTabbedNavigation({ tabCount: 3 }));

      act(() => {
        result.current.setCurrentIndex(2);
      });

      expect(result.current.currentIndex).toBe(2);
    });

    it('ignores out-of-bounds index', () => {
      const { result } = renderHook(() =>
        useTabbedNavigation({ tabCount: 3, initialIndex: 1 }),
      );

      act(() => {
        result.current.setCurrentIndex(10);
      });
      expect(result.current.currentIndex).toBe(1);

      act(() => {
        result.current.setCurrentIndex(-1);
      });
      expect(result.current.currentIndex).toBe(1);
    });
  });

  describe('isNavigationBlocked', () => {
    it('blocks navigation when callback returns true', () => {
      const isNavigationBlocked = vi.fn(() => true);
      const { result } = renderHook(() =>
        useTabbedNavigation({ tabCount: 3, isNavigationBlocked }),
      );

      act(() => {
        result.current.goToNextTab();
      });

      expect(result.current.currentIndex).toBe(0);
      expect(isNavigationBlocked).toHaveBeenCalled();
    });

    it('allows navigation when callback returns false', () => {
      const isNavigationBlocked = vi.fn(() => false);
      const { result } = renderHook(() =>
        useTabbedNavigation({ tabCount: 3, isNavigationBlocked }),
      );

      act(() => {
        result.current.goToNextTab();
      });

      expect(result.current.currentIndex).toBe(1);
    });
  });

  describe('onTabChange callback', () => {
    it('calls onTabChange when tab changes via goToNextTab', () => {
      const onTabChange = vi.fn();
      const { result } = renderHook(() =>
        useTabbedNavigation({ tabCount: 3, onTabChange }),
      );

      act(() => {
        result.current.goToNextTab();
      });

      expect(onTabChange).toHaveBeenCalledWith(1);
    });

    it('calls onTabChange when tab changes via setCurrentIndex', () => {
      const onTabChange = vi.fn();
      const { result } = renderHook(() =>
        useTabbedNavigation({ tabCount: 3, onTabChange }),
      );

      act(() => {
        result.current.setCurrentIndex(2);
      });

      expect(onTabChange).toHaveBeenCalledWith(2);
    });

    it('does not call onTabChange when tab does not change', () => {
      const onTabChange = vi.fn();
      const { result } = renderHook(() =>
        useTabbedNavigation({ tabCount: 3, onTabChange }),
      );

      act(() => {
        result.current.setCurrentIndex(0);
      });

      expect(onTabChange).not.toHaveBeenCalled();
    });
  });

  describe('isFirstTab and isLastTab', () => {
    it('returns correct boundary flags based on position', () => {
      const { result: first } = renderHook(() =>
        useTabbedNavigation({ tabCount: 3, initialIndex: 0 }),
      );
      expect(first.current.isFirstTab).toBe(true);
      expect(first.current.isLastTab).toBe(false);

      const { result: last } = renderHook(() =>
        useTabbedNavigation({ tabCount: 3, initialIndex: 2 }),
      );
      expect(last.current.isFirstTab).toBe(false);
      expect(last.current.isLastTab).toBe(true);

      const { result: middle } = renderHook(() =>
        useTabbedNavigation({ tabCount: 3, initialIndex: 1 }),
      );
      expect(middle.current.isFirstTab).toBe(false);
      expect(middle.current.isLastTab).toBe(false);
    });
  });

  describe('tabCount changes', () => {
    it('reinitializes when tabCount changes', () => {
      let tabCount = 5;
      const { result, rerender } = renderHook(() =>
        useTabbedNavigation({ tabCount, initialIndex: 4 }),
      );

      expect(result.current.currentIndex).toBe(4);

      tabCount = 3;
      rerender();

      // Should clamp to valid range
      expect(result.current.currentIndex).toBe(2);
    });
  });
});
