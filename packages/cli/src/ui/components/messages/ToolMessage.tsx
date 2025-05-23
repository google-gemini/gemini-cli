/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import {
  IndividualToolCallDisplay,
  StreamingState,
  ToolCallStatus,
} from '../../types.js';
import { DiffRenderer } from './DiffRenderer.js';
import { Colors } from '../../colors.js';
import { MarkdownDisplay } from '../../utils/MarkdownDisplay.js';

const STATIC_HEIGHT = 1;
const RESERVED_LINE_COUNT = 5; // for tool name, status, padding etc.
const STATUS_INDICATOR_WIDTH = 3;

export type TextEmphasis = 'high' | 'medium' | 'low';

export interface ToolMessageProps extends IndividualToolCallDisplay {
  availableTerminalHeight: number;
  emphasis?: TextEmphasis;
  streamingState?: StreamingState;
}

export const ToolMessage: React.FC<ToolMessageProps> = ({
  name,
  description,
  resultDisplay,
  status,
  availableTerminalHeight,
  emphasis = 'medium',
  streamingState,
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
        {/* Status Indicator */}
        <ToolStatusIndicator status={status} streamingState={streamingState} />
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
  streamingState?: StreamingState;
};
const ToolStatusIndicator: React.FC<ToolStatusIndicatorProps> = ({
  status,
  streamingState,
}) => (
  <Box minWidth={STATUS_INDICATOR_WIDTH}>
    {status === ToolCallStatus.Pending && (
      <Text color={Colors.AccentGreen}>o</Text>
    )}
    {status === ToolCallStatus.Executing &&
      (streamingState === StreamingState.Responding ? (
        // If the tool is responding that means the user has already confirmed
        // this tool call, so we can show a checkmark. The call won't complete
        // executing until all confirmations are done. Showing a spinner would
        // be misleading as the task is not actually executing at the moment
        // and also has flickering issues due to Ink rendering limitations.
        // If this hack becomes a problem, we can always add an additional prop
        // indicating that the tool was indeed confirmed. If the tool was not
        // confirmed we could show a paused version of the spinner.
        <Text color={Colors.Gray}>✔</Text>
      ) : (
        <Spinner type="dots" />
      ))}
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
