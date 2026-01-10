/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { recordFlickerFrame } from '@google/gemini-cli-core';
import { type DOMElement, measureElement } from 'ink';
import { useEffect, useRef } from 'react';
import { AppEvent, appEvents } from '../../utils/events.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { useUIState } from '../contexts/UIStateContext.js';

// Number of render frames to skip before detecting flickers
// This allows initial layout to settle during startup, authentication, and IDE connection
const STARTUP_GRACE_FRAMES = 50;

/**
 * A hook that detects when the UI flickers (renders taller than the terminal).
 * This is a sign of a rendering bug that should be fixed.
 *
 * @param rootUiRef A ref to the root UI element.
 * @param terminalHeight The height of the terminal.
 */
export function useFlickerDetector(
  rootUiRef: React.RefObject<DOMElement | null>,
  terminalHeight: number,
) {
  const config = useConfig();
  const { constrainHeight } = useUIState();
  const frameCountRef = useRef<number>(0);

  useEffect(() => {
    // Skip flicker detection during startup grace period to allow layout to settle
    frameCountRef.current++;
    if (frameCountRef.current <= STARTUP_GRACE_FRAMES) {
      return;
    }

    if (rootUiRef.current) {
      const measurement = measureElement(rootUiRef.current);
      if (measurement.height > terminalHeight) {
        // If we are not constraining the height, we are intentionally
        // overflowing the screen.
        if (!constrainHeight) {
          return;
        }

        recordFlickerFrame(config);
        appEvents.emit(AppEvent.Flicker);
      }
    }
  });
}
