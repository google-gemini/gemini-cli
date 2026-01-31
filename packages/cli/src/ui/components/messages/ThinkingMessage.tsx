/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import process from 'node:process';
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
  const headerText = subject || description;
  const bodyText = subject ? description : '';
  const contentMaxHeight =
    availableTerminalHeight !== undefined
      ? Math.max(availableTerminalHeight - 4, MINIMUM_MAX_HEIGHT)
      : undefined;
  const bubbleIcon = shouldUseEmojiBubble() ? '💬' : '◆';

  return (
    <Box
      borderStyle="round"
      borderColor="magenta"
      width={terminalWidth}
      paddingX={1}
      marginBottom={1}
      flexDirection="column"
    >
      <MaxSizedBox
        maxHeight={contentMaxHeight}
        maxWidth={terminalWidth - 2}
        overflowDirection="top"
      >
        {headerText && (
          <Box flexDirection="column">
            <Text bold color="magenta">
              {bubbleIcon} {headerText}
            </Text>
            {bodyText && <Text>{bodyText}</Text>}
          </Box>
        )}
      </MaxSizedBox>
    </Box>
  );
};

function shouldUseEmojiBubble(): boolean {
  const locale = (
    process.env['LC_ALL'] ||
    process.env['LC_CTYPE'] ||
    process.env['LANG'] ||
    ''
  ).toLowerCase();
  const supportsUtf8 = locale.includes('utf-8') || locale.includes('utf8');
  if (!supportsUtf8) {
    return false;
  }

  if (process.env['TERM'] === 'linux') {
    return false;
  }

  return true;
}
