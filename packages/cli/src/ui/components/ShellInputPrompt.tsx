/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { useKeypress, Key, keyToAnsi } from '../hooks/useKeypress.js';
import chalk from 'chalk';
import { type Config } from '@google/gemini-cli-core';

const CURSOR_BLINK_RATE_MS = 500;

export interface ShellInputPromptProps {
  config: Config;
  activeShellPtyId: number | null;
  focus?: boolean;
}

export const ShellInputPrompt: React.FC<ShellInputPromptProps> = ({
  config,
  activeShellPtyId,
  focus = true,
}) => {
  const [isCursorVisible, setIsCursorVisible] = useState(true);

  useEffect(() => {
    if (!focus) {
      setIsCursorVisible(true);
      return;
    }

    const blinker = setInterval(() => {
      setIsCursorVisible((prev) => !prev);
    }, CURSOR_BLINK_RATE_MS);
    return () => {
      clearInterval(blinker);
    };
  }, [focus]);

  const handleShellInputSubmit = useCallback(
    (input: string) => {
      if (activeShellPtyId) {
        config.getGeminiClient().writeToShell(activeShellPtyId, input);
      }
    },
    [activeShellPtyId, config],
  );

  const handleInput = useCallback(
    (key: Key) => {
      if (!focus) {
        return;
      }
      setIsCursorVisible(true);

      const ansiSequence = keyToAnsi(key);
      if (ansiSequence) {
        handleShellInputSubmit(ansiSequence);
      }
    },
    [focus, handleShellInputSubmit],
  );

  useKeypress(handleInput, { isActive: focus });

  const cursor = isCursorVisible ? chalk.inverse(' ') : ' ';

  return <Box>{focus && <Text>{cursor}</Text>}</Box>;
};
