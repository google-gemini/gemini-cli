/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useReducer, useCallback, useEffect, useRef } from 'react';
import { useKeypress, type Key } from './useKeypress.js';
import { keyMatchers, Command } from '../keyMatchers.js';

/**
 * Options for the useTabbedNavigation hook.
 */
export interface UseTabbedNavigationOptions {
  /** Total number of tabs */
  tabCount: number;
  /** Initial tab index (default: 0) */
  initialIndex?: number;
  /** Allow wrapping from last to first and vice versa (default: false) */
  wrapAround?: boolean;
  /** Whether left/right arrows navigate tabs (default: true) */
  enableArrowNavigation?: boolean;
  /** Whether Tab key advances to next tab (default: true) */
  enableTabKey?: boolean;
  /** Callback to determine if navigation is blocked (e.g., during text input) */
  isNavigationBlocked?: () => boolean;
  /** Whether the hook is active and should respond to keyboard input */
  isActive?: boolean;
  /** Callback when the active tab changes */
  onTabChange?: (index: number) => void;
}

/**
 * Result of the useTabbedNavigation hook.
 */
export interface UseTabbedNavigationResult {
  /** Current tab index */
  currentIndex: number;
  /** Set the current tab index directly */
  setCurrentIndex: (index: number) => void;
  /** Move to the next tab (respecting bounds) */
  goToNextTab: () => void;
  /** Move to the previous tab (respecting bounds) */
  goToPrevTab: () => void;
  /** Whether currently at first tab */
  isFirstTab: boolean;
  /** Whether currently at last tab */
  isLastTab: boolean;
}

interface TabbedNavigationState {
  currentIndex: number;
  tabCount: number;
  wrapAround: boolean;
  pendingTabChange: boolean;
}

type TabbedNavigationAction =
  | { type: 'NEXT_TAB' }
  | { type: 'PREV_TAB' }
  | { type: 'SET_INDEX'; payload: { index: number } }
  | {
      type: 'INITIALIZE';
      payload: { tabCount: number; initialIndex: number; wrapAround: boolean };
    }
  | { type: 'CLEAR_PENDING' };

function tabbedNavigationReducer(
  state: TabbedNavigationState,
  action: TabbedNavigationAction,
): TabbedNavigationState {
  switch (action.type) {
    case 'NEXT_TAB': {
      const { tabCount, wrapAround, currentIndex } = state;
      if (tabCount === 0) return state;

      let nextIndex = currentIndex + 1;
      if (nextIndex >= tabCount) {
        nextIndex = wrapAround ? 0 : tabCount - 1;
      }

      if (nextIndex === currentIndex) return state;
      return { ...state, currentIndex: nextIndex, pendingTabChange: true };
    }

    case 'PREV_TAB': {
      const { tabCount, wrapAround, currentIndex } = state;
      if (tabCount === 0) return state;

      let nextIndex = currentIndex - 1;
      if (nextIndex < 0) {
        nextIndex = wrapAround ? tabCount - 1 : 0;
      }

      if (nextIndex === currentIndex) return state;
      return { ...state, currentIndex: nextIndex, pendingTabChange: true };
    }

    case 'SET_INDEX': {
      const { index } = action.payload;
      const { tabCount, currentIndex } = state;

      if (index === currentIndex) return state;
      if (index < 0 || index >= tabCount) return state;

      return { ...state, currentIndex: index, pendingTabChange: true };
    }

    case 'INITIALIZE': {
      const { tabCount, initialIndex, wrapAround } = action.payload;
      const validIndex = Math.max(0, Math.min(initialIndex, tabCount - 1));
      return {
        ...state,
        tabCount,
        wrapAround,
        currentIndex: tabCount > 0 ? validIndex : 0,
        pendingTabChange: false,
      };
    }

    case 'CLEAR_PENDING': {
      return { ...state, pendingTabChange: false };
    }

    default: {
      return state;
    }
  }
}

/**
 * A headless hook that provides keyboard navigation for tabbed interfaces.
 *
 * Features:
 * - Keyboard navigation with left/right arrows
 * - Optional Tab key navigation
 * - Optional wrap-around navigation
 * - Navigation blocking callback (for text input scenarios)
 */
export function useTabbedNavigation({
  tabCount,
  initialIndex = 0,
  wrapAround = false,
  enableArrowNavigation = true,
  enableTabKey = true,
  isNavigationBlocked,
  isActive = true,
  onTabChange,
}: UseTabbedNavigationOptions): UseTabbedNavigationResult {
  const [state, dispatch] = useReducer(tabbedNavigationReducer, {
    currentIndex: Math.max(0, Math.min(initialIndex, tabCount - 1)),
    tabCount,
    wrapAround,
    pendingTabChange: false,
  });

  const prevTabCountRef = useRef(tabCount);
  const prevInitialIndexRef = useRef(initialIndex);
  const prevWrapAroundRef = useRef(wrapAround);

  useEffect(() => {
    const tabCountChanged = prevTabCountRef.current !== tabCount;
    const initialIndexChanged = prevInitialIndexRef.current !== initialIndex;
    const wrapAroundChanged = prevWrapAroundRef.current !== wrapAround;

    if (tabCountChanged || initialIndexChanged || wrapAroundChanged) {
      dispatch({
        type: 'INITIALIZE',
        payload: { tabCount, initialIndex, wrapAround },
      });
      prevTabCountRef.current = tabCount;
      prevInitialIndexRef.current = initialIndex;
      prevWrapAroundRef.current = wrapAround;
    }
  }, [tabCount, initialIndex, wrapAround]);

  useEffect(() => {
    if (state.pendingTabChange) {
      onTabChange?.(state.currentIndex);
      dispatch({ type: 'CLEAR_PENDING' });
    }
  }, [state.pendingTabChange, state.currentIndex, onTabChange]);

  const goToNextTab = useCallback(() => {
    if (isNavigationBlocked?.()) return;
    dispatch({ type: 'NEXT_TAB' });
  }, [isNavigationBlocked]);

  const goToPrevTab = useCallback(() => {
    if (isNavigationBlocked?.()) return;
    dispatch({ type: 'PREV_TAB' });
  }, [isNavigationBlocked]);

  const setCurrentIndex = useCallback(
    (index: number) => {
      if (isNavigationBlocked?.()) return;
      dispatch({ type: 'SET_INDEX', payload: { index } });
    },
    [isNavigationBlocked],
  );

  const handleKeypress = useCallback(
    (key: Key) => {
      if (isNavigationBlocked?.()) return;

      if (enableArrowNavigation) {
        if (keyMatchers[Command.MOVE_RIGHT](key)) {
          goToNextTab();
          return;
        }
        if (keyMatchers[Command.MOVE_LEFT](key)) {
          goToPrevTab();
          return;
        }
      }

      if (enableTabKey) {
        if (keyMatchers[Command.DIALOG_NEXT](key)) {
          goToNextTab();
          return;
        }
        if (keyMatchers[Command.DIALOG_PREV](key)) {
          goToPrevTab();
          return;
        }
      }
    },
    [
      enableArrowNavigation,
      enableTabKey,
      goToNextTab,
      goToPrevTab,
      isNavigationBlocked,
    ],
  );

  useKeypress(handleKeypress, { isActive: isActive && tabCount > 1 });

  return {
    currentIndex: state.currentIndex,
    setCurrentIndex,
    goToNextTab,
    goToPrevTab,
    isFirstTab: state.currentIndex === 0,
    isLastTab: state.currentIndex === tabCount - 1,
  };
}
