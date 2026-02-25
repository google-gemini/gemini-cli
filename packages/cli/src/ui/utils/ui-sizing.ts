/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '@google/gemini-cli-core';
import { isAlternateBufferEnabled } from '../hooks/useAlternateBuffer.js';

export const calculateMainAreaWidth = (
  terminalWidth: number,
  config: Config,
): number => {
  if (isAlternateBufferEnabled(config)) {
    return terminalWidth - 1;
  }
  return terminalWidth;
};
