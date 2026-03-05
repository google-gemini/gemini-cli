/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { persistentState } from '../../utils/persistentState.js';

export const APPROVAL_MODE_REVEAL_DURATION_MS = 1200;
const FOCUS_UI_ENABLED_STATE_KEY = 'focusUiEnabled';

export function useVisibilityToggle() {
  const [focusUiEnabledByDefault] = useState(
    () => persistentState.get(FOCUS_UI_ENABLED_STATE_KEY) === true,
  );
  const [cleanUiDetailsVisible, setCleanUiDetailsVisibleState] = useState(
    !focusUiEnabledByDefault,
  );
  const modeRevealTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cleanUiDetailsPinnedRef = useRef(!focusUiEnabledByDefault);

  const clearModeRevealTimeout = useCallback(() => {
    if (modeRevealTimeoutRef.current) {
      clearTimeout(modeRevealTimeoutRef.current);
      modeRevealTimeoutRef.current = null;
    }
  }, []);

  const persistFocusUiPreference = useCallback((isFullUiVisible: boolean) => {
    persistentState.set(FOCUS_UI_ENABLED_STATE_KEY, !isFullUiVisible);
  }, []);

  const setCleanUiDetailsVisible = useCallback(
    (visible: boolean) => {
      clearModeRevealTimeout();
      cleanUiDetailsPinnedRef.current = visible;
      setCleanUiDetailsVisibleState(visible);
      persistFocusUiPreference(visible);
    },
    [clearModeRevealTimeout, persistFocusUiPreference],
  );

  const toggleCleanUiDetailsVisible = useCallback(() => {
    clearModeRevealTimeout();
    setCleanUiDetailsVisibleState((visible) => {
      const nextVisible = !visible;
      cleanUiDetailsPinnedRef.current = nextVisible;
      persistFocusUiPreference(nextVisible);
      return nextVisible;
    });
  }, [clearModeRevealTimeout, persistFocusUiPreference]);

  const revealCleanUiDetailsTemporarily = useCallback(
    (durationMs: number = APPROVAL_MODE_REVEAL_DURATION_MS) => {
      if (cleanUiDetailsPinnedRef.current) {
        return;
      }
      clearModeRevealTimeout();
      setCleanUiDetailsVisibleState(true);
      modeRevealTimeoutRef.current = setTimeout(() => {
        if (!cleanUiDetailsPinnedRef.current) {
          setCleanUiDetailsVisibleState(false);
        }
        modeRevealTimeoutRef.current = null;
      }, durationMs);
    },
    [clearModeRevealTimeout],
  );

  useEffect(() => () => clearModeRevealTimeout(), [clearModeRevealTimeout]);

  return {
    cleanUiDetailsVisible,
    setCleanUiDetailsVisible,
    toggleCleanUiDetailsVisible,
    revealCleanUiDetailsTemporarily,
  };
}
