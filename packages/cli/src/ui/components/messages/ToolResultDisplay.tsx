/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { DiffRenderer } from './DiffRenderer.js';
import { MarkdownDisplay } from '../../utils/MarkdownDisplay.js';
import { AnsiOutputText } from '../AnsiOutput.js';
import { MaxSizedBox } from '../shared/MaxSizedBox.js';
import { theme } from '../../semantic-colors.js';
import type { AnsiOutput } from '@google/gemini-cli-core';
import { useUIState } from '../../contexts/UIStateContext.js';
import { useAlternateBuffer } from '../../hooks/useAlternateBuffer.js';

const STATIC_HEIGHT = 1;
const RESERVED_LINE_COUNT = 5; // for tool name, status, padding etc.
const MIN_LINES_SHOWN = 2; // show at least this many lines
const MAX_LINES = 20; // Maximum lines to show before truncation

// Large threshold to ensure we don't cause performance issues for very large
// outputs that will get truncated further MaxSizedBox anyway.
const MAXIMUM_RESULT_DISPLAY_CHARACTERS = 20000;

export interface ToolResultDisplayProps {
  resultDisplay: string | object | undefined;
  availableTerminalHeight?: number;
  terminalWidth: number;
  renderOutputAsMarkdown?: boolean;
}

interface FileDiffResult {
  fileDiff: string;
  fileName: string;
}

export const ToolResultDisplay: React.FC<ToolResultDisplayProps> = ({
  resultDisplay,
  availableTerminalHeight,
  terminalWidth,
  renderOutputAsMarkdown = true,
}) => {
  const { renderMarkdown } = useUIState();
  const isAlternateBuffer = useAlternateBuffer();

  const availableHeight = availableTerminalHeight
    ? Math.max(
        availableTerminalHeight - STATIC_HEIGHT - RESERVED_LINE_COUNT,
        MIN_LINES_SHOWN + 1, // enforce minimum lines shown
      )
    : undefined;

  // Long tool call response in MarkdownDisplay doesn't respect availableTerminalHeight properly,
  // so if we aren't using alternate buffer mode, we're forcing it to not render as markdown when the response is too long, it will fallback
  // to render as plain text, which is contained within the terminal using MaxSizedBox
  if (availableHeight && !isAlternateBuffer) {
    renderOutputAsMarkdown = false;
  }

  const combinedPaddingAndBorderWidth = 4;
  const childWidth = terminalWidth - combinedPaddingAndBorderWidth;

  const { displayContent, isTruncatedByLines, hiddenLineCount } =
    React.useMemo(() => {
      let content = resultDisplay;
      let isLineTruncated = false;
      let hiddenLines = 0;

      if (typeof resultDisplay === 'string') {
        const lines = resultDisplay.split('\n');
        if (lines.length > MAX_LINES) {
          content = lines.slice(0, MAX_LINES).join('\n');
          isLineTruncated = true;
          hiddenLines = lines.length - MAX_LINES;
        } else if (resultDisplay.length > MAXIMUM_RESULT_DISPLAY_CHARACTERS) {
          // Apply character truncation for very long outputs
          content =
            '...' + resultDisplay.slice(-MAXIMUM_RESULT_DISPLAY_CHARACTERS);
        }
      }
      return {
        displayContent: content,
        isTruncatedByLines: isLineTruncated,
        hiddenLineCount: hiddenLines,
      };
    }, [resultDisplay]);

  if (!displayContent) return null;

  return (
    <Box width={childWidth} flexDirection="column">
      <Box flexDirection="column">
        {typeof displayContent === 'string' && renderOutputAsMarkdown ? (
          <Box flexDirection="column">
            <MarkdownDisplay
              text={displayContent}
              terminalWidth={childWidth}
              renderMarkdown={renderMarkdown}
              isPending={false}
            />
          </Box>
        ) : typeof displayContent === 'string' && !renderOutputAsMarkdown ? (
          isAlternateBuffer ? (
            <Box flexDirection="column" width={childWidth}>
              <Text wrap="wrap" color={theme.text.primary}>
                {displayContent}
              </Text>
            </Box>
          ) : (
            <MaxSizedBox maxHeight={availableHeight} maxWidth={childWidth}>
              <Box>
                <Text wrap="wrap" color={theme.text.primary}>
                  {displayContent}
                </Text>
              </Box>
            </MaxSizedBox>
          )
        ) : typeof displayContent === 'object' &&
          'fileDiff' in displayContent ? (
          <DiffRenderer
            diffContent={(displayContent as FileDiffResult).fileDiff}
            filename={(displayContent as FileDiffResult).fileName}
            availableTerminalHeight={availableHeight}
            terminalWidth={childWidth}
          />
        ) : typeof displayContent === 'object' && 'todos' in displayContent ? (
          // display nothing, as the TodoTray will handle rendering todos
          <></>
        ) : (
          <AnsiOutputText
            data={displayContent as AnsiOutput}
            availableTerminalHeight={availableHeight}
            width={childWidth}
          />
        )}
        {isTruncatedByLines && (
          <Text color="dimColor">... +{hiddenLineCount} lines</Text>
        )}
      </Box>
    </Box>
  );
};
