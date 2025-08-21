/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { MarkdownDisplay } from '../../utils/MarkdownDisplay.js';

interface GeminiMessageContentProps {
  text: string;
  isPending: boolean;
  availableTerminalHeight?: number;
  terminalWidth: number;
}

/*
 * Gemini message content is a semi-hacked component. The intention is to represent a partial
 * of GeminiMessage and is only used when a response gets too long. In that instance messages
 * are split into multiple GeminiMessageContent's to enable the root <Static> component in
 * App.tsx to be as performant as humanly possible.
 */
export const GeminiMessageContent: React.FC<GeminiMessageContentProps> = ({
  text,
  isPending,
  availableTerminalHeight,
  terminalWidth,
}) => {
  const [isRawMode, setIsRawMode] = useState(false);
  const originalPrefix = '✦ ';
  const prefixWidth = originalPrefix.length;

  useInput((input) => {
    if (input.toLowerCase() === 'r') {
      setIsRawMode((prev) => !prev);
    }
  });

  return (
    <Box flexDirection="column" paddingLeft={prefixWidth}>
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
  );
};
