/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback } from 'react';
import type React from 'react';
import { useKeypress } from '../hooks/useKeypress.js';
import { ShellExecutionService } from '@google/gemini-cli-core';
import { keyToAnsi, type Key } from '../hooks/keyToAnsi.js';
import { Command, keyMatchers } from '../keyMatchers.js';

export interface ShellInputPromptProps {
  activeShellPtyId: number | null;
  focus?: boolean;
}

export const ShellInputPrompt: React.FC<ShellInputPromptProps> = ({
  activeShellPtyId,
  focus = true,
}) => {
  const handleShellInputSubmit = useCallback(
    (input: string) => {
      if (activeShellPtyId) {
        ShellExecutionService.writeToPty(activeShellPtyId, input);
      }
    },
    [activeShellPtyId],
  );

  const handleInput = useCallback(
    (key: Key) => {
      if (!focus || !activeShellPtyId) {
        return false;
      }

      // Allow background shell toggle to bubble up
      if (keyMatchers[Command.TOGGLE_BACKGROUND_SHELL](key)) {
        return false;
      }

      if (key.ctrl && key.shift && key.name === 'up') {
        ShellExecutionService.scrollPty(activeShellPtyId, -1);
        return true;
      }

      if (key.ctrl && key.shift && key.name === 'down') {
        ShellExecutionService.scrollPty(activeShellPtyId, 1);
        return true;
      }

      const ansiSequence = keyToAnsi(key);
      if (ansiSequence) {
        handleShellInputSubmit(ansiSequence);
        return true;
      }

      return false;
    },
    [focus, handleShellInputSubmit, activeShellPtyId],
  );

  useKeypress(handleInput, { isActive: focus });

  return null;
};
