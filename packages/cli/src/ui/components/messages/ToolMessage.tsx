/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { IndividualToolCallDisplay, ToolCallStatus } from '../../types.js';
import { DiffRenderer } from './DiffRenderer.js';
import { Colors } from '../../colors.js';
import { MarkdownDisplay } from '../../utils/MarkdownDisplay.js';

export interface ToolMessageProps extends IndividualToolCallDisplay {
  availableTerminalHeight: number;
}

export const ToolMessage: React.FC<ToolMessageProps> = ({
  name,
  description,
  resultDisplay,
  status,
  availableTerminalHeight,
}) => {
  const statusIndicatorWidth = 3;
  const hasResult = resultDisplay && resultDisplay.toString().trim().length > 0;
  const staticHeight = /* Header */ 1;
  availableTerminalHeight -= staticHeight;

  let displayableResult = resultDisplay;
  let hiddenLines = 0;

  // Truncate the overall string content if it's too long.
  // MarkdownRenderer will handle specific truncation for code blocks within this content.
  if (typeof resultDisplay === 'string' && resultDisplay.length > 0) {
    const lines = resultDisplay.split('\n');
    // Estimate available height for this specific tool message content area
    // This is a rough estimate; ideally, we'd have a more precise measurement.
    const contentHeightEstimate = availableTerminalHeight - 5; // Subtracting lines for tool name, status, padding etc.
    if (lines.length > contentHeightEstimate && contentHeightEstimate > 0) {
      displayableResult = lines.slice(0, contentHeightEstimate).join('\n');
      hiddenLines = lines.length - contentHeightEstimate;
    }
  }

  return (
    <Box paddingX={1} paddingY={0} flexDirection="column">
      <Box minHeight={1}>
        {/* Status Indicator */}
        <Box minWidth={statusIndicatorWidth}>
          {(status === ToolCallStatus.Pending ||
            status === ToolCallStatus.Executing) && <Spinner type="dots" />}
          {status === ToolCallStatus.Success && (
            <Text color={Colors.AccentGreen}>✔</Text>
          )}
          {status === ToolCallStatus.Confirming && (
            <Text color={Colors.AccentYellow}>?</Text>
          )}
          {status === ToolCallStatus.Canceled && (
            <Text color={Colors.AccentYellow} bold>
              -
            </Text>
          )}
          {status === ToolCallStatus.Error && (
            <Text color={Colors.AccentRed} bold>
              x
            </Text>
          )}
        </Box>
        <Box>
          <Text
            wrap="truncate-end"
            strikethrough={status === ToolCallStatus.Canceled}
          >
            <Text bold>{name}</Text>{' '}
            <Text color={Colors.SubtleComment}>{description}</Text>
          </Text>
        </Box>
      </Box>
      {hasResult && (
        <Box paddingLeft={statusIndicatorWidth} width="100%">
          <Box flexDirection="column">
            {typeof displayableResult === 'string' && (
              <Box flexDirection="column">
                <MarkdownDisplay text={displayableResult} />
              </Box>
            )}
            {typeof displayableResult === 'object' && (
              <DiffRenderer diffContent={displayableResult.fileDiff} />
            )}
            {hiddenLines > 0 && (
              <Box>
                <Text color={Colors.SubtleComment}>
                  ... {hiddenLines} more line{hiddenLines === 1 ? '' : 's'}{' '}
                  hidden ...
                </Text>
              </Box>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
};
