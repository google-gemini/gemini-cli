/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Text, Box } from 'ink';
import { MarkdownDisplay } from '../../utils/MarkdownDisplay.js';
import { ShowMoreLines } from '../ShowMoreLines.js';
import { theme } from '../../semantic-colors.js';
import { SCREEN_READER_MODEL_PREFIX } from '../../textConstants.js';
import { useUIState } from '../../contexts/UIStateContext.js';
import { useAlternateBuffer } from '../../hooks/useAlternateBuffer.js';
import { OverflowProvider } from '../../contexts/OverflowContext.js';

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
  const { renderMarkdown } = useUIState();
  const prefix = '✦ ';
  const prefixWidth = prefix.length;

  const isAlternateBuffer = useAlternateBuffer();
  const content = (
    <Box flexDirection="row">
      <Box width={prefixWidth}>
        <Text color={theme.text.accent} aria-label={SCREEN_READER_MODEL_PREFIX}>
          {prefix}
        </Text>
      </Box>
      <Box flexGrow={1} flexDirection="column">
        <MarkdownDisplay
          text={text}
          isPending={isPending}
          availableTerminalHeight={
            isAlternateBuffer || availableTerminalHeight === undefined
              ? undefined
              : Math.max(availableTerminalHeight - 1, 1)
          }
          terminalWidth={Math.max(terminalWidth - prefixWidth, 0)}
          renderMarkdown={renderMarkdown}
        />
        <Box
          marginTop={isAlternateBuffer ? 0 : 1}
          marginBottom={isAlternateBuffer ? 1 : 0}
        >
          <ShowMoreLines
            constrainHeight={availableTerminalHeight !== undefined}
          />
        </Box>
      </Box>
    </Box>
  );

  return isAlternateBuffer ? (
    /* Shadow the global provider to maintain isolation in ASB mode. */
    <OverflowProvider>{content}</OverflowProvider>
  ) : (
    content
  );
};
