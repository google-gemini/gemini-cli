/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { IndividualToolCallDisplay, ToolCallStatus } from '../../types.js';
import { DiffRenderer } from './DiffRenderer.js';
import { Colors } from '../../colors.js';
import { MarkdownDisplay } from '../../utils/MarkdownDisplay.js';
import { GeminiRespondingSpinner } from '../GeminiRespondingSpinner.js';

const STATIC_HEIGHT = 1;
const RESERVED_LINE_COUNT = 5; // for tool name, status, padding etc.
const STATUS_INDICATOR_WIDTH = 3;

export type TextEmphasis = 'high' | 'medium' | 'low';

export interface ToolMessageProps extends IndividualToolCallDisplay {
  availableTerminalHeight: number;
  emphasis?: TextEmphasis;
}

export const ToolMessage: React.FC<ToolMessageProps> = ({
  name,
  description,
  resultDisplay,
  status,
  availableTerminalHeight,
  emphasis = 'medium',
}) => {
  const contentHeightEstimate =
    availableTerminalHeight - STATIC_HEIGHT - RESERVED_LINE_COUNT;
  const resultIsString =
    typeof resultDisplay === 'string' && resultDisplay.trim().length > 0;
  const lines = React.useMemo(
    () => (resultIsString ? resultDisplay.split('\n') : []),
    [resultIsString, resultDisplay],
  );

  // Truncate the overall string content if it's too long.
  // MarkdownRenderer will handle specific truncation for code blocks within this content.
  // Estimate available height for this specific tool message content area
  // This is a rough estimate; ideally, we'd have a more precise measurement.
  const displayableResult = React.useMemo(
    () =>
      resultIsString
        ? lines.slice(0, contentHeightEstimate).join('\n')
        : resultDisplay,
    [lines, resultIsString, contentHeightEstimate, resultDisplay],
  );
  const hiddenLines = lines.length - contentHeightEstimate;

  return (
    <Box paddingX={1} paddingY={0} flexDirection="column">
      <Box minHeight={1}>
        <ToolStatusIndicator status={status} />
        <ToolInfo
          name={name}
          status={status}
          description={description}
          emphasis={emphasis}
        />
        {emphasis === 'high' && <TrailingIndicator />}
      </Box>
      {displayableResult && (
        <Box paddingLeft={STATUS_INDICATOR_WIDTH} width="100%">
          <Box flexDirection="column">
            {typeof displayableResult === 'string' && (
              <Box flexDirection="column">
                <MarkdownDisplay
                  text={displayableResult}
                  isPending={false}
                  availableTerminalHeight={availableTerminalHeight}
                />
              </Box>
            )}
            {typeof displayableResult !== 'string' && (
              <DiffRenderer
                diffContent={displayableResult.fileDiff}
                filename={displayableResult.fileName}
              />
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

type ToolStatusIndicatorProps = {
  status: ToolCallStatus;
};

const ToolStatusIndicator: React.FC<ToolStatusIndicatorProps> = ({
  status,
}) => (
  <Box minWidth={STATUS_INDICATOR_WIDTH}>
    {status === ToolCallStatus.Pending && (
      <Text color={Colors.AccentGreen}>o</Text>
    )}
    {status === ToolCallStatus.Executing && (
      <GeminiRespondingSpinner
        spinnerType="toggle"
        nonRespondingDisplay={'⊷'}
      />
    )}
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
);

type ToolInfo = {
  name: string;
  description: string;
  status: ToolCallStatus;
  emphasis: TextEmphasis;
};
const ToolInfo: React.FC<ToolInfo> = ({
  name,
  description,
  status,
  emphasis,
}) => {
  const nameColor = React.useMemo<string>(() => {
    switch (emphasis) {
      case 'high':
        return Colors.Foreground;
      case 'medium':
        return Colors.Foreground;
      case 'low':
        return Colors.SubtleComment;
      default: {
        const exhaustiveCheck: never = emphasis;
        return exhaustiveCheck;
      }
    }
  }, [emphasis]);
  return (
    <Box>
      <Text
        wrap="truncate-end"
        strikethrough={status === ToolCallStatus.Canceled}
      >
        <Text color={nameColor} bold>
          {name}
        </Text>{' '}
        <Text color={Colors.SubtleComment}>{description}</Text>
      </Text>
    </Box>
  );
};

const TrailingIndicator: React.FC = () => (
  <Text color={Colors.Foreground}> ←</Text>
);
