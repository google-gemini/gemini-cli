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
import { FileDiff, ToolResultDisplay } from '../../../tools/tools.js';
import { Colors } from '../../colors.js';

export const ToolMessage: React.FC<IndividualToolCallDisplay> = ({
  callId,
  name,
  description,
  resultDisplay,
  status,
}) => {
  const typedResultDisplay = resultDisplay as ToolResultDisplay | undefined;

  let color = Colors.SubtleComment;
  let prefix = '';
  switch (status) {
    case ToolCallStatus.Pending:
      prefix = 'Pending:';
      break;
    case ToolCallStatus.Invoked:
      prefix = 'Executing:';
      break;
    case ToolCallStatus.Confirming:
      color = Colors.AccentYellow;
      prefix = 'Confirm:';
      break;
    case ToolCallStatus.Success:
      color = Colors.AccentGreen;
      prefix = 'Success:';
      break;
    case ToolCallStatus.Error:
      color = Colors.AccentRed;
      prefix = 'Error:';
      break;
    default:
      // Handle unexpected status if necessary, or just break
      break;
  }

  const title = `${prefix} ${name}`;

  return (
    <Box key={callId} flexDirection="column" paddingX={1}>
      <Box>
        {status === ToolCallStatus.Invoked && (
          <Box marginRight={1}>
            <Text color={Colors.AccentBlue}>
              <Spinner type="dots" />
            </Text>
          </Box>
        )}
        <Text bold color={color}>
          {title}
        </Text>
        <Text color={color}>
          {status === ToolCallStatus.Error && typedResultDisplay
            ? `: ${typedResultDisplay}`
            : ` - ${description}`}
        </Text>
      </Box>
      {status === ToolCallStatus.Success && typedResultDisplay && (
        <Box flexDirection="column" marginLeft={2}>
          {typeof typedResultDisplay === 'string' ? (
            <Text>{typedResultDisplay}</Text>
          ) : (
            <DiffRenderer
              diffContent={(typedResultDisplay as FileDiff).fileDiff}
            />
          )}
        </Box>
      )}
    </Box>
  );
};
