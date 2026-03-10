/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useLayoutEffect, type RefObject } from 'react';
import { useConfig } from '../contexts/ConfigContext.js';
import type { Config } from '@google/gemini-cli-core';
import { type DOMElement, measureElement } from 'ink';
import { useTerminalSize } from './useTerminalSize.js';

export const isAlternateBufferEnabled = (config: Config): boolean =>
  config.getUseAlternateBuffer();

// This is read from Config so that the UI reads the same value per application session
export const useAlternateBuffer = (): boolean => {
  const config = useConfig();
  return isAlternateBufferEnabled(config);
};

export const useLegacyNonAlternateBufferMode = (
  rootUiRef: RefObject<DOMElement | null>,
): boolean => {
  const isAlternateBuffer = useAlternateBuffer();
  const { rows: terminalHeight } = useTerminalSize();
  const [isOverflowing, setIsOverflowing] = useState(false);

  useLayoutEffect(() => {
    if (isAlternateBuffer || !rootUiRef.current) {
      if (isOverflowing) setIsOverflowing(false);
      return;
    }

    const measurement = measureElement(rootUiRef.current);
    // If the interactive UI is taller than the terminal height, we have a problem.
    const currentlyOverflowing = measurement.height >= terminalHeight;

    if (currentlyOverflowing !== isOverflowing) {
      setIsOverflowing(currentlyOverflowing);
    }
  }, [isAlternateBuffer, rootUiRef, terminalHeight, isOverflowing]);

  return !isAlternateBuffer && isOverflowing;
};
