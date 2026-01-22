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
import { useUIState } from '../../contexts/UIStateContext.js';
import { useAlternateBuffer } from '../../hooks/useAlternateBuffer.js';

interface GeminiMessageProps {
  text: string;
  isPending: boolean;
  availableTerminalHeight?: number;
  terminalWidth: number;
  responseTime?: number; // Response time in seconds
}

export const GeminiMessage: React.FC<GeminiMessageProps> = ({
  text,
  isPending,
  availableTerminalHeight,
  terminalWidth,
  responseTime,
}) => {
  const { renderMarkdown } = useUIState();
  const prefix = '✦ ';
  const prefixWidth = prefix.length;

  const isAlternateBuffer = useAlternateBuffer();

  // Format response time for display
  const formatResponseTime = (seconds: number): string => {
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (remainingSeconds === 0) {
      return `${minutes}m`;
    }
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Box width={prefixWidth}>
          <Text
            color={theme.text.accent}
            aria-label={SCREEN_READER_MODEL_PREFIX}
          >
            {prefix}
          </Text>
        </Box>
        <Box flexGrow={1} flexDirection="column">
          <MarkdownDisplay
            text={text}
            isPending={isPending}
            availableTerminalHeight={
              isAlternateBuffer ? undefined : availableTerminalHeight
            }
            terminalWidth={terminalWidth}
            renderMarkdown={renderMarkdown}
          />
        </Box>
      </Box>
      {!isPending && responseTime !== undefined && responseTime > 0 && (
        <Box marginLeft={prefixWidth}>
          <Text dimColor>({formatResponseTime(responseTime)})</Text>
        </Box>
      )}
    </Box>
  );
};
