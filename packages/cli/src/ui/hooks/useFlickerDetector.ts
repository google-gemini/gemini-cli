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

const FLICKER_CHECK_INTERVAL_MS = 250;

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

  useEffect(() => {
    const checkForFlicker = () => {
      if (rootUiRef.current) {
        const measurement = measureElement(rootUiRef.current);
        if (measurement.height > terminalHeight) {
          recordFlickerFrame(config);
          appEvents.emit(AppEvent.Flicker);
        }
      }
    };

    const intervalId = setInterval(checkForFlicker, FLICKER_CHECK_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [terminalHeight, rootUiRef, config]);
}
