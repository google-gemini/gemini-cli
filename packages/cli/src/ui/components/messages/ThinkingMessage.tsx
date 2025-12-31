/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import type { ThoughtSummary } from '@google/gemini-cli-core';

interface ThinkingMessageProps {
  thoughts: ThoughtSummary[];
  terminalWidth: number;
}

export const ThinkingMessage: React.FC<ThinkingMessageProps> = ({
  thoughts,
  terminalWidth,
}) => (
  <Box
    borderStyle="round"
    borderColor="magenta"
    width={terminalWidth}
    paddingX={1}
    marginBottom={1}
  >
    <Text color="magenta">◆ </Text>
    <Text bold color="magenta">
      Thinking
    </Text>
    <Text dimColor> ({thoughts.length})</Text>
  </Box>
);
