/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type DOMElement, measureElement } from 'ink';
import { useEffect } from 'react';
import { useConfig } from '../contexts/ConfigContext.js';
import { recordFlickerFrame } from '@google/gemini-cli-core';
import { appEvents, AppEvent } from '../../utils/events.js';
import { useUIState } from '../contexts/UIStateContext.js';

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

  useEffect(() => {
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
