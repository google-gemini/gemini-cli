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

const STATIC_HEIGHT = 1;
const RESERVED_LINE_COUNT = 5; // for tool name, status, padding etc.
const MIN_LINES_SHOWN = 2; // show at least this many lines

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

  const availableHeight = availableTerminalHeight
    ? Math.max(
        availableTerminalHeight - STATIC_HEIGHT - RESERVED_LINE_COUNT,
        MIN_LINES_SHOWN + 1, // enforce minimum lines shown
      )
    : undefined;

  const combinedPaddingAndBorderWidth = 4;
  const childWidth = terminalWidth - combinedPaddingAndBorderWidth;

  const truncatedResultDisplay = React.useMemo(() => {
    if (typeof resultDisplay === 'string') {
      if (resultDisplay.length > MAXIMUM_RESULT_DISPLAY_CHARACTERS) {
        return '...' + resultDisplay.slice(-MAXIMUM_RESULT_DISPLAY_CHARACTERS);
      }
    }
    return resultDisplay;
  }, [resultDisplay]);

  if (!truncatedResultDisplay) return null;

  let content: React.ReactNode;

  if (typeof truncatedResultDisplay === 'string' && renderOutputAsMarkdown) {
    content = (
      <MarkdownDisplay
        text={truncatedResultDisplay}
        terminalWidth={childWidth}
        renderMarkdown={renderMarkdown}
        isPending={false}
      />
    );
  } else if (
    typeof truncatedResultDisplay === 'string' &&
    !renderOutputAsMarkdown
  ) {
    content = (
      <Text wrap="wrap" color={theme.text.primary}>
        {truncatedResultDisplay}
      </Text>
    );
  } else if (
    typeof truncatedResultDisplay === 'object' &&
    'fileDiff' in truncatedResultDisplay
  ) {
    content = (
      <DiffRenderer
        diffContent={(truncatedResultDisplay as FileDiffResult).fileDiff}
        filename={(truncatedResultDisplay as FileDiffResult).fileName}
        availableTerminalHeight={availableHeight}
        terminalWidth={childWidth}
      />
    );
  } else if (
    typeof truncatedResultDisplay === 'object' &&
    'todos' in truncatedResultDisplay
  ) {
    // display nothing, as the TodoTray will handle rendering todos
    return null;
  } else {
    content = (
      <AnsiOutputText
        data={truncatedResultDisplay as AnsiOutput}
        availableTerminalHeight={availableHeight}
        width={childWidth}
      />
    );
  }

  return (
    <Box width={childWidth} flexDirection="column">
      <MaxSizedBox maxHeight={availableHeight} maxWidth={childWidth}>
        {content}
      </MaxSizedBox>
    </Box>
  );
};
