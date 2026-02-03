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
import { ACTIVE_SHELL_MAX_LINES } from '../constants.js';
import { Command, keyMatchers } from '../keyMatchers.js';

export interface ShellInputPromptProps {
  activeShellPtyId: number | null;
  focus?: boolean;
  scrollPageSize?: number;
}

export const ShellInputPrompt: React.FC<ShellInputPromptProps> = ({
  activeShellPtyId,
  focus = true,
  scrollPageSize = ACTIVE_SHELL_MAX_LINES,
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

      // Allow Shift+Tab to bubble up for focus navigation
      if (keyMatchers[Command.SHELL_LEAVE_FOCUS](key)) {
        return false;
      }

      if (keyMatchers[Command.SHELL_SCROLL_UP](key)) {
        ShellExecutionService.scrollPty(activeShellPtyId, -1);
        return true;
      }
      if (keyMatchers[Command.SHELL_SCROLL_DOWN](key)) {
        ShellExecutionService.scrollPty(activeShellPtyId, 1);
        return true;
      }
      if (keyMatchers[Command.SHELL_SCROLL_PAGE_UP](key)) {
        ShellExecutionService.scrollPty(activeShellPtyId, -scrollPageSize);
        return true;
      }
      if (keyMatchers[Command.SHELL_SCROLL_PAGE_DOWN](key)) {
        ShellExecutionService.scrollPty(activeShellPtyId, scrollPageSize);
        return true;
      }

      const ansiSequence = keyToAnsi(key);
      if (ansiSequence) {
        handleShellInputSubmit(ansiSequence);
        return true;
      }

      return false;
    },
    [focus, handleShellInputSubmit, activeShellPtyId, scrollPageSize],
  );

  useKeypress(handleInput, { isActive: focus });

  return null;
};
