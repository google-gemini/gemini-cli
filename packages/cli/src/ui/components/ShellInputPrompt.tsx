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
import { useUIActions } from '../contexts/UIActionsContext.js';
import { formatCommand } from '../utils/keybindingUtils.js';

export interface ShellInputPromptProps {
  activeShellPtyId: number | null;
  focus?: boolean;
}

export const ShellInputPrompt: React.FC<ShellInputPromptProps> = ({
  activeShellPtyId,
  focus = true,
}) => {
  const { handleWarning } = useUIActions();
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

      // Allow unfocus to bubble up
      if (keyMatchers[Command.UNFOCUS_SHELL_INPUT](key)) {
        return false;
      }

      if (keyMatchers[Command.SHOW_SHELL_INPUT_UNFOCUS_WARNING](key)) {
        handleWarning(
          `Press ${formatCommand(Command.UNFOCUS_SHELL_INPUT)} to focus out.`,
        );
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
    [focus, handleShellInputSubmit, activeShellPtyId, handleWarning],
  );

  useKeypress(handleInput, { isActive: focus });

  return null;
};
