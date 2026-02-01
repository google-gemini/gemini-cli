/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import type { ThoughtSummary } from '@google/gemini-cli-core';
import { MaxSizedBox, MINIMUM_MAX_HEIGHT } from '../shared/MaxSizedBox.js';
import { IconText } from '../shared/IconText.js';

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
  const contentMaxWidth = Math.max(terminalWidth - 4, 1);
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
      <MaxSizedBox
        maxHeight={contentMaxHeight}
        maxWidth={contentMaxWidth}
        overflowDirection="top"
      >
        {headerText && (
          <Box flexDirection="column">
            <IconText
              icon="💬"
              fallbackIcon="◆"
              text={headerText}
              color="magenta"
              bold
            />
            {bodyText && <Text>{bodyText}</Text>}
          </Box>
        )}
      </MaxSizedBox>
    </Box>
  );
};
