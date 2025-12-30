/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useInput } from 'ink';
import { useUIState } from '../contexts/UIStateContext.js';
import { ShellExecutionService } from '@google/gemini-cli-core';

export const ShellBackgroundHandler = () => {
  const uiState = useUIState();
  const { activePtyId } = uiState;

  useInput((input, key) => {
    // CTRL+b is the shortcut for backgrounding
    if (input === '\u0002' || (key.ctrl && input === 'b')) {
      if (activePtyId) {
        ShellExecutionService.detach(activePtyId);
      }
    }
  });

  return null;
};
