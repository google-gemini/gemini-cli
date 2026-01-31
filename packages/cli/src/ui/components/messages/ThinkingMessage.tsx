/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import type { ThoughtSummary } from '@google/gemini-cli-core';
import { MaxSizedBox, MINIMUM_MAX_HEIGHT } from '../shared/MaxSizedBox.js';

interface ThinkingMessageProps {
  thoughts: ThoughtSummary[];
  terminalWidth: number;
  availableTerminalHeight?: number;
}

export const ThinkingMessage: React.FC<ThinkingMessageProps> = ({
  thoughts,
  terminalWidth,
  availableTerminalHeight,
}) => {
  const contentMaxHeight =
    availableTerminalHeight !== undefined
      ? Math.max(availableTerminalHeight - 4, MINIMUM_MAX_HEIGHT)
      : undefined;

  return (
    <Box
      borderStyle="round"
      borderColor="magenta"
      width={terminalWidth}
      paddingX={1}
      marginBottom={1}
      flexDirection="column"
    >
      <Box>
        <Text color="magenta">◆ </Text>
        <Text bold color="magenta">
          Thinking
        </Text>
        <Text dimColor> ({thoughts.length})</Text>
      </Box>
      <MaxSizedBox
        maxHeight={contentMaxHeight}
        maxWidth={terminalWidth - 2}
        overflowDirection="top"
      >
        {thoughts.map((thought, index) => (
          <Box key={index} marginTop={1} flexDirection="column">
            {thought.subject && (
              <Text bold color="magenta">
                {thought.subject}
              </Text>
            )}
            <Text>{thought.description || ' '}</Text>
          </Box>
        ))}
      </MaxSizedBox>
    </Box>
  );
};
