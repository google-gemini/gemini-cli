/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { DiffRenderer } from './DiffRenderer.js';
import { MarkdownDisplay } from '../../utils/MarkdownDisplay.js';
import { AnsiOutputText, AnsiLineText } from '../AnsiOutput.js';
import { MaxSizedBox } from '../shared/MaxSizedBox.js';
import { theme } from '../../semantic-colors.js';
import type { AnsiOutput, AnsiLine } from '@google/gemini-cli-core';
import { useUIState } from '../../contexts/UIStateContext.js';
import { tryParseJSON } from '../../../utils/jsonoutput.js';
import { useAlternateBuffer } from '../../hooks/useAlternateBuffer.js';
import { Scrollable } from '../shared/Scrollable.js';
import { ScrollableList } from '../shared/ScrollableList.js';
import { SCROLL_TO_ITEM_END } from '../shared/VirtualizedList.js';
import { ACTIVE_SHELL_MAX_LINES } from '../../constants.js';

const STATIC_HEIGHT = 1;
const RESERVED_LINE_COUNT = 6; // for tool name, status, padding, and 'ShowMoreLines' hint
const MIN_LINES_SHOWN = 2; // show at least this many lines

// Large threshold to ensure we don't cause performance issues for very large
// outputs that will get truncated further MaxSizedBox anyway.
const MAXIMUM_RESULT_DISPLAY_CHARACTERS = 20000;

export interface ToolResultDisplayProps {
  resultDisplay: string | object | undefined;
  availableTerminalHeight?: number;
  terminalWidth: number;
  renderOutputAsMarkdown?: boolean;
  maxLines?: number;
  hasFocus?: boolean;
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
  maxLines,
  hasFocus = false,
}) => {
  const { renderMarkdown } = useUIState();
  const isAlternateBuffer = useAlternateBuffer();

  let availableHeight = availableTerminalHeight
    ? Math.max(
        availableTerminalHeight - STATIC_HEIGHT - RESERVED_LINE_COUNT,
        MIN_LINES_SHOWN + 1, // enforce minimum lines shown
      )
    : undefined;

  if (maxLines && availableHeight) {
    availableHeight = Math.min(availableHeight, maxLines);
  }

  const combinedPaddingAndBorderWidth = 4;
  const childWidth = terminalWidth - combinedPaddingAndBorderWidth;

  const keyExtractor = React.useCallback(
    (_: AnsiLine, index: number) => index.toString(),
    [],
  );

  const renderVirtualizedAnsiLine = React.useCallback(
    ({ item }: { item: AnsiLine }) => (
      <Box height={1} overflow="hidden">
        <AnsiLineText line={item} />
      </Box>
    ),
    [],
  );

  const truncatedResultDisplay = React.useMemo(() => {
    // Only truncate string output if not in alternate buffer mode to ensure
    // we can scroll through the full output.
    if (typeof resultDisplay === 'string' && !isAlternateBuffer) {
      let text = resultDisplay;
      if (text.length > MAXIMUM_RESULT_DISPLAY_CHARACTERS) {
        text = '...' + text.slice(-MAXIMUM_RESULT_DISPLAY_CHARACTERS);
      }
      if (maxLines) {
        const hasTrailingNewline = text.endsWith('\n');
        const contentText = hasTrailingNewline ? text.slice(0, -1) : text;
        const lines = contentText.split('\n');
        if (lines.length > maxLines) {
          text =
            lines.slice(-maxLines).join('\n') +
            (hasTrailingNewline ? '\n' : '');
        }
      }
      return text;
    }
    return resultDisplay;
  }, [resultDisplay, isAlternateBuffer, maxLines]);

  if (!truncatedResultDisplay) return null;

  // 1. Early return for background tools (Todos)
  if (
    typeof truncatedResultDisplay === 'object' &&
    'todos' in truncatedResultDisplay
  ) {
    // display nothing, as the TodoTray will handle rendering todos
    return null;
  }

  // 2. High-performance path: Virtualized ANSI in interactive mode
  if (isAlternateBuffer && Array.isArray(truncatedResultDisplay)) {
    // If availableHeight is undefined, fallback to a safe default to prevents infinite loop
    // where Container grows -> List renders more -> Container grows.
    const limit = maxLines ?? availableHeight ?? ACTIVE_SHELL_MAX_LINES;
    const listHeight = Math.min(
      (truncatedResultDisplay as AnsiOutput).length,
      limit,
    );

    return (
      <Box width={childWidth} flexDirection="column" maxHeight={listHeight}>
        <ScrollableList
          width={childWidth}
          data={truncatedResultDisplay as AnsiOutput}
          renderItem={renderVirtualizedAnsiLine}
          estimatedItemHeight={() => 1}
          keyExtractor={keyExtractor}
          initialScrollIndex={SCROLL_TO_ITEM_END}
          hasFocus={hasFocus}
        />
      </Box>
    );
  }

  // 3. Compute content node for non-virtualized paths
  // Check if string content is valid JSON and pretty-print it
  const prettyJSON =
    typeof truncatedResultDisplay === 'string'
      ? tryParseJSON(truncatedResultDisplay)
      : null;
  const formattedJSON = prettyJSON ? JSON.stringify(prettyJSON, null, 2) : null;

  let content: React.ReactNode;

  if (formattedJSON) {
    // Render pretty-printed JSON
    content = (
      <Text wrap="wrap" color={theme.text.primary}>
        {formattedJSON}
      </Text>
    );
  } else if (
    typeof truncatedResultDisplay === 'string' &&
    renderOutputAsMarkdown
  ) {
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
  } else {
    const shouldDisableTruncation =
      isAlternateBuffer ||
      (availableTerminalHeight === undefined && maxLines === undefined);

    content = (
      <AnsiOutputText
        data={truncatedResultDisplay as AnsiOutput}
        availableTerminalHeight={
          isAlternateBuffer ? undefined : availableHeight
        }
        width={childWidth}
        maxLines={isAlternateBuffer ? undefined : maxLines}
        disableTruncation={shouldDisableTruncation}
      />
    );
  }

  // 4. Final render based on session mode
  if (isAlternateBuffer) {
    return (
      <Scrollable
        width={childWidth}
        maxHeight={maxLines ?? availableHeight}
        hasFocus={hasFocus} // Allow scrolling via keyboard (Shift+Up/Down)
        scrollToBottom={true}
      >
        {content}
      </Scrollable>
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
