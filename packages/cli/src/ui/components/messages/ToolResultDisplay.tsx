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
import { SlicingMaxSizedBox } from '../shared/SlicingMaxSizedBox.js';
import { theme } from '../../semantic-colors.js';
import {
  type AnsiOutput,
  type AnsiLine,
  isSubagentProgress,
  isStructuredToolResult,
} from '@google/gemini-cli-core';
import { useUIState } from '../../contexts/UIStateContext.js';
import { tryParseJSON } from '../../../utils/jsonoutput.js';
import { useAlternateBuffer } from '../../hooks/useAlternateBuffer.js';
import { Scrollable } from '../shared/Scrollable.js';
import { ScrollableList } from '../shared/ScrollableList.js';
import { SCROLL_TO_ITEM_END } from '../shared/VirtualizedList.js';
import { ACTIVE_SHELL_MAX_LINES } from '../../constants.js';
import { calculateToolContentMaxLines } from '../../utils/toolLayoutUtils.js';
import { SubagentProgressDisplay } from './SubagentProgressDisplay.js';

export interface ToolResultDisplayProps {
  resultDisplay: string | object | undefined;
  availableTerminalHeight?: number;
  terminalWidth: number;
  renderOutputAsMarkdown?: boolean;
  maxLines?: number;
  hasFocus?: boolean;
  overflowDirection?: 'top' | 'bottom';
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
  overflowDirection = 'top',
}) => {
  const { renderMarkdown } = useUIState();
  const isAlternateBuffer = useAlternateBuffer();

  const availableHeight = calculateToolContentMaxLines({
    availableTerminalHeight,
    isAlternateBuffer,
    maxLinesLimit: maxLines,
  });

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

  if (!resultDisplay) return null;

  // 1. Early return for background tools (Todos)
  if (typeof resultDisplay === 'object' && 'todos' in resultDisplay) {
    // display nothing, as the TodoTray will handle rendering todos
    return null;
  }

  const renderContent = (contentData: string | object | undefined) => {
    // Check if string content is valid JSON and pretty-print it
    const prettyJSON =
      typeof contentData === 'string' ? tryParseJSON(contentData) : null;
    const formattedJSON = prettyJSON
      ? JSON.stringify(prettyJSON, null, 2)
      : null;

    let content: React.ReactNode;

    if (formattedJSON) {
      // Render pretty-printed JSON
      content = (
        <Text wrap="wrap" color={theme.text.primary}>
          {formattedJSON}
        </Text>
      );
    } else if (isSubagentProgress(contentData)) {
      content = (
        <SubagentProgressDisplay
          progress={contentData}
          terminalWidth={childWidth}
        />
      );
    } else if (typeof contentData === 'string' && renderOutputAsMarkdown) {
      content = (
        <MarkdownDisplay
          text={contentData}
          terminalWidth={childWidth}
          renderMarkdown={renderMarkdown}
          isPending={false}
        />
      );
    } else if (typeof contentData === 'string' && !renderOutputAsMarkdown) {
      content = (
        <Text wrap="wrap" color={theme.text.primary}>
          {contentData}
        </Text>
      );
    } else if (isStructuredToolResult(contentData)) {
      if (renderOutputAsMarkdown) {
        content = (
          <MarkdownDisplay
            text={contentData.summary}
            terminalWidth={childWidth}
            renderMarkdown={renderMarkdown}
            isPending={false}
          />
        );
      } else {
        content = (
          <Text wrap="wrap" color={theme.text.primary}>
            {contentData.summary}
          </Text>
        );
      }
    } else if (
      typeof contentData === 'object' &&
      contentData !== null &&
      'fileDiff' in contentData
    ) {
      content = (
        <DiffRenderer
          diffContent={
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            (contentData as FileDiffResult).fileDiff
          }
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          filename={(contentData as FileDiffResult).fileName}
          availableTerminalHeight={availableHeight}
          terminalWidth={childWidth}
        />
      );
    } else if (Array.isArray(contentData)) {
      const shouldDisableTruncation =
        isAlternateBuffer ||
        (availableTerminalHeight === undefined && maxLines === undefined);

      content = (
        <AnsiOutputText
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          data={contentData as AnsiOutput}
          availableTerminalHeight={
            isAlternateBuffer ? undefined : availableHeight
          }
          width={childWidth}
          maxLines={isAlternateBuffer ? undefined : maxLines}
          disableTruncation={shouldDisableTruncation}
        />
      );
    } else if (typeof contentData === 'object' && contentData !== null) {
      // Render as JSON for other non-null objects
      content = (
        <Text wrap="wrap" color={theme.text.primary}>
          {JSON.stringify(contentData, null, 2)}
        </Text>
      );
    } else {
      content = null;
    }

    // Final render based on session mode
    if (isAlternateBuffer) {
      // Use maxLines if provided, otherwise fall back to the calculated available height
      const effectiveMaxHeight = maxLines ?? availableHeight;

      return (
        <Scrollable
          width={childWidth}
          maxHeight={effectiveMaxHeight}
          hasFocus={hasFocus} // Allow scrolling via keyboard (Shift+Up/Down)
          scrollToBottom={true}
          reportOverflow={true}
        >
          {content}
        </Scrollable>
      );
    }

    return content;
  };

  if (Array.isArray(resultDisplay)) {
    const limit = maxLines ?? availableHeight ?? ACTIVE_SHELL_MAX_LINES;
    const listHeight = Math.min(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      (resultDisplay as AnsiOutput).length,
      limit,
    );

    const initialScrollIndex =
      overflowDirection === 'bottom' ? 0 : SCROLL_TO_ITEM_END;

    return (
      <Box width={childWidth} flexDirection="column" maxHeight={listHeight}>
        <ScrollableList
          width={childWidth}
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          data={resultDisplay as AnsiOutput}
          renderItem={renderVirtualizedAnsiLine}
          estimatedItemHeight={() => 1}
          keyExtractor={keyExtractor}
          initialScrollIndex={initialScrollIndex}
          hasFocus={hasFocus}
          fixedItemHeight={true}
        />
      </Box>
    );
  }

  // ASB Mode Handling (Interactive/Fullscreen)
  if (isAlternateBuffer) {
    // Standard path for strings/diffs in ASB
    return (
      <Box width={childWidth} flexDirection="column">
        {renderContent(resultDisplay)}
      </Box>
    );
  }

  // Standard Mode Handling (History/Scrollback)
  // We use SlicingMaxSizedBox which includes MaxSizedBox for precision truncation + hidden labels
  return (
    <Box width={childWidth} flexDirection="column">
      <SlicingMaxSizedBox
        data={resultDisplay}
        maxLines={maxLines}
        isAlternateBuffer={isAlternateBuffer}
        maxHeight={availableHeight}
        maxWidth={childWidth}
        overflowDirection={overflowDirection}
      >
        {(truncatedResultDisplay) => renderContent(truncatedResultDisplay)}
      </SlicingMaxSizedBox>
    </Box>
  );
};
