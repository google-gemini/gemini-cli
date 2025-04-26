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
import { MarkdownRenderer } from '../../utils/MarkdownRenderer.js';

export const ToolMessage: React.FC<IndividualToolCallDisplay> = ({
  name,
  description,
  resultDisplay,
  status,
}) => {
  const statusIndicatorWidth = 3;
  const hasResult = resultDisplay && resultDisplay.toString().trim().length > 0;
  return (
    <Box paddingX={1} paddingY={0} flexDirection="column">
      <Box minHeight={1}>
        {/* Status Indicator */}
        <Box minWidth={statusIndicatorWidth}>
          {status === ToolCallStatus.Pending && <Spinner type="dots" />}
          {status === ToolCallStatus.Success && (
            <Text color={Colors.AccentGreen}>✔</Text>
          )}
          {status === ToolCallStatus.Confirming && (
            <Text color={Colors.AccentPurple}>?</Text>
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
          <Box flexDirection="row">
            {/* Use default text color (white) or gray instead of dimColor */}
            {typeof resultDisplay === 'string' && (
              <Box flexDirection="column">
                {MarkdownRenderer.render(resultDisplay)}
              </Box>
            )}
            {typeof resultDisplay === 'object' && (
              <DiffRenderer diffContent={resultDisplay.fileDiff} />
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
};
