/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useUIState } from '../contexts/UIStateContext.js';
import type { Config } from '@google/gemini-cli-core';

export const isAlternateBufferEnabled = (config: Config): boolean =>
  config.getUseAlternateBuffer();

// This is read from UIState so that the UI can toggle dynamically
export const useAlternateBuffer = (): boolean => {
  const uiState = useUIState();
  return uiState.isAlternateBuffer;
};
