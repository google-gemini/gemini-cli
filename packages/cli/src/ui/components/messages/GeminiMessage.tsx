/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Text, Box, useInput } from 'ink';
import { MarkdownDisplay } from '../../utils/MarkdownDisplay.js';
import { Colors } from '../../colors.js';

interface GeminiMessageProps {
  text: string;
  isPending: boolean;
  availableTerminalHeight?: number;
  terminalWidth: number;
}

export const GeminiMessage: React.FC<GeminiMessageProps> = ({
  text,
  isPending,
  availableTerminalHeight,
  terminalWidth,
}) => {
  const [isRawMode, setIsRawMode] = useState(false);
  const prefix = '✦ ';
  const prefixWidth = prefix.length;

  useInput((input) => {
    if (input.toLowerCase() === 'r') {
      setIsRawMode((prev) => !prev);
    }
  });

  return (
    <Box flexDirection="row">
      <Box width={prefixWidth}>
        <Text color={Colors.AccentPurple}>{prefix}</Text>
      </Box>
      <Box flexGrow={1} flexDirection="column">
        <Box alignSelf="flex-end">
          <Text dimColor>
            {isRawMode ? 'Press `r` to see rendered' : 'Press `r` to see raw'}
          </Text>
        </Box>
        <MarkdownDisplay
          text={text}
          isPending={isPending}
          availableTerminalHeight={availableTerminalHeight}
          terminalWidth={terminalWidth}
          isRawMode={isRawMode}
        />
      </Box>
    </Box>
  );
};
