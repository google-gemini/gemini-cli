/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useUIState } from '../contexts/UIStateContext.js';
import type { Config } from '@google/gemini-cli-core';

// This method is intentionally misleading while we migrate.
// Once getUseTerminalBuffer() is always enabled we will refactor to remove
// all instances of this method making it the only path.
// Right now this is convenient as it allows us to special case terminalBuffer
// rendering like we special case alternateBuffer rendering.
export const isAlternateBufferEnabled = (config: Config): boolean =>
  config.getUseAlternateBuffer() || config.getUseTerminalBuffer();

export const useAlternateBuffer = (): boolean => {
  const uiState = useUIState();
  return uiState.isAlternateBuffer;
};
