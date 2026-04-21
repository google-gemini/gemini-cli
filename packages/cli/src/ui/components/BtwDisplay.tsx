/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { MarkdownDisplay } from '../utils/MarkdownDisplay.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { CliSpinner } from './CliSpinner.js';

interface BtwDisplayProps {
  query: string;
  response: string;
  isStreaming: boolean;
  error: string | null;
  terminalWidth: number;
}

export const BtwDisplay: React.FC<BtwDisplayProps> = ({
  query,
  response,
  isStreaming,
  error,
  terminalWidth,
}) => {
  const { renderMarkdown } = useUIState();

  if (!query) return null;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.text.accent}
      paddingX={1}
      width={terminalWidth}
      marginBottom={1}
    >
      <Box flexDirection="row" justifyContent="space-between" marginBottom={1}>
        <Box>
          <Text color={theme.text.accent} bold>
            BY THE WAY
          </Text>
        </Box>
        <Box>
          <Text color={theme.text.secondary} italic>
            Press Esc, Enter or Space to dismiss
          </Text>
        </Box>
      </Box>

      <Box marginBottom={1}>
        <Text color={theme.text.secondary}>Q: </Text>
        <Text color={theme.text.secondary} italic>
          {query}
        </Text>
      </Box>

      <Box flexDirection="column">
        {error ? (
          <Text color={theme.status.error}>{error}</Text>
        ) : (
          <MarkdownDisplay
            text={response}
            isPending={isStreaming}
            terminalWidth={terminalWidth - 6}
            renderMarkdown={renderMarkdown}
          />
        )}
      </Box>

      {isStreaming && (
        <Box marginTop={1}>
          <Text color={theme.text.accent}>
            <CliSpinner type="dots" /> Answering...
          </Text>
        </Box>
      )}
    </Box>
  );
};
