/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Text, Box } from 'ink';
import { MarkdownDisplay } from '../../utils/MarkdownDisplay.js';
import { theme } from '../../semantic-colors.js';
import { SCREEN_READER_MODEL_PREFIX } from '../../textConstants.js';

interface GeminiMessageProps {
  text: string;
  isPending: boolean;
  availableTerminalHeight?: number;
  terminalWidth: number;
}

export const GeminiMessage: React.FC<GeminiMessageProps> = ({
  text,
  availableTerminalHeight,
  terminalWidth,
}) => {
  const prefix = '✦ ';
  const prefixWidth = prefix.length;

  return (
    <Box flexDirection="row">
      <Box width={prefixWidth}>
        <Text color={theme.text.accent} aria-label={SCREEN_READER_MODEL_PREFIX}>
          {prefix}
        </Text>
      </Box>
      <Box
        flexGrow={1}
        flexShrink={1}
        flexDirection="column"
        overflow-x="hidden"
        overflowY="scroll"
        scrollbarThumbColor={theme.text.secondary}
        scrollTop={Number.MAX_SAFE_INTEGER}
        maxHeight={availableTerminalHeight}
      >
        <Box flexShrink={0} flexDirection="column">
          <MarkdownDisplay text={text} terminalWidth={terminalWidth} />
        </Box>
      </Box>
    </Box>
  );
};
