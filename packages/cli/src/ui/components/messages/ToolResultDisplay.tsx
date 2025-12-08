/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box } from 'ink';
import { DiffRenderer } from './DiffRenderer.js';
import { MarkdownDisplay } from '../../utils/MarkdownDisplay.js';
import { AnsiOutputText } from '../AnsiOutput.js';
import { theme } from '../../semantic-colors.js';
import { LinkifiedText } from '../shared/LinkifiedText.js';
import type { AnsiOutput } from '@google/gemini-cli-core';
import { useUIState } from '../../contexts/UIStateContext.js';
import { useAlternateBuffer } from '../../hooks/useAlternateBuffer.js';

const STATIC_HEIGHT = 1;
const RESERVED_LINE_COUNT = 5; // for tool name, status, padding etc.
const MINIMUM_MAX_HEIGHT = 2; // mimicked from MaxSizedBox

// Large threshold to ensure we don't cause performance issues for very large
// outputs that will get truncated further anyway.
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
        MINIMUM_MAX_HEIGHT + 1, // enforce minimum lines shown
      )
    : undefined;

  // Long tool call response in MarkdownDisplay doesn't respect availableTerminalHeight properly,
  // so if we aren't using alternate buffer mode, we're forcing it to not render as markdown when the response is too long, it will fallback
  // to render as plain text.
  if (availableHeight && !isAlternateBuffer) {
    renderOutputAsMarkdown = false;
  }

  const combinedPaddingAndBorderWidth = 4;
  const childWidth = terminalWidth - combinedPaddingAndBorderWidth;

  const truncatedResultDisplay = React.useMemo(() => {
    if (typeof resultDisplay === 'string') {
      let text = resultDisplay;
      if (text.length > MAXIMUM_RESULT_DISPLAY_CHARACTERS) {
        text = '...' + text.slice(-MAXIMUM_RESULT_DISPLAY_CHARACTERS);
      }

      // If we are not continuously rendering (alternate buffer) and have a height limit,
      // we manually truncate lines to respect available height since MaxSizedBox
      // does not support LinkifiedText (Link components).
      if (availableHeight && !isAlternateBuffer) {
        const lines = text.split('\n');
        let currentHeight = 0;
        let startIndex = lines.length;

        // Iterate backwards to find how many lines fit from the end
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i];
          // Approximate visual height accounting for wrapping.
          // Empty line takes 1 row.
          const lineVisualHeight = Math.ceil(
            Math.max(1, line.length) / childWidth,
          );

          if (currentHeight + lineVisualHeight > availableHeight) {
            break;
          }

          currentHeight += lineVisualHeight;
          startIndex = i;
        }

        if (startIndex > 0) {
          text = '...\n' + lines.slice(startIndex).join('\n');
        }
      }
      return text;
    }
    return resultDisplay;
  }, [resultDisplay, availableHeight, isAlternateBuffer, childWidth]);

  if (!truncatedResultDisplay) return null;

  return (
    <Box width={childWidth} flexDirection="column">
      <Box flexDirection="column">
        {typeof truncatedResultDisplay === 'string' &&
        renderOutputAsMarkdown ? (
          <Box flexDirection="column">
            <MarkdownDisplay
              text={truncatedResultDisplay}
              terminalWidth={childWidth}
              renderMarkdown={renderMarkdown}
              isPending={false}
            />
          </Box>
        ) : typeof truncatedResultDisplay === 'string' &&
          !renderOutputAsMarkdown ? (
          <Box flexDirection="column" width={childWidth}>
            <LinkifiedText wrap="wrap" color={theme.text.primary}>
              {truncatedResultDisplay}
            </LinkifiedText>
          </Box>
        ) : typeof truncatedResultDisplay === 'object' &&
          'fileDiff' in truncatedResultDisplay ? (
          <DiffRenderer
            diffContent={(truncatedResultDisplay as FileDiffResult).fileDiff}
            filename={(truncatedResultDisplay as FileDiffResult).fileName}
            availableTerminalHeight={availableHeight}
            terminalWidth={childWidth}
          />
        ) : typeof truncatedResultDisplay === 'object' &&
          'todos' in truncatedResultDisplay ? (
          // display nothing, as the TodoTray will handle rendering todos
          <></>
        ) : (
          <AnsiOutputText
            data={truncatedResultDisplay as AnsiOutput}
            availableTerminalHeight={availableHeight}
            width={childWidth}
          />
        )}
      </Box>
    </Box>
  );
};
