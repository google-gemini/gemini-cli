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
  thought: ThoughtSummary;
  terminalWidth: number;
  availableTerminalHeight?: number;
}

export const ThinkingMessage: React.FC<ThinkingMessageProps> = ({
  thought,
  terminalWidth,
  availableTerminalHeight,
}) => {
  const subject = thought.subject.trim();
  const description = thought.description.trim();
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
      </Box>
      <MaxSizedBox
        maxHeight={contentMaxHeight}
        maxWidth={terminalWidth - 2}
        overflowDirection="top"
      >
        {(subject || description) && (
          <Box marginTop={1} flexDirection="column">
            {subject && (
              <Text bold color="magenta">
                {subject}
              </Text>
            )}
            {description && <Text>{description}</Text>}
          </Box>
        )}
      </MaxSizedBox>
    </Box>
  );
};
