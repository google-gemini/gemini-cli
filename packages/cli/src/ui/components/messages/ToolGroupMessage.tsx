/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box } from 'ink';
import { IndividualToolCallDisplay, ToolCallStatus } from '../../types.js';
import { ToolMessage } from './ToolMessage.js';
import { PartListUnion } from '@google/genai';
import { ToolConfirmationMessage } from './ToolConfirmationMessage.js';
import { Colors } from '../../colors.js';

interface ToolGroupMessageProps {
  groupId: number;
  toolCalls: IndividualToolCallDisplay[];
  onSubmit: (value: PartListUnion) => void;
}

// Main component renders the border and maps the tools using ToolMessage
export const ToolGroupMessage: React.FC<ToolGroupMessageProps> = ({
  groupId,
  toolCalls,
  onSubmit,
}) => {
  const hasPending = !toolCalls.every(
    (t) => t.status === ToolCallStatus.Success,
  );
  const borderColor = hasPending ? Colors.AccentYellow : Colors.AccentPurple;

  return (
    <Box
      key={groupId}
      flexDirection="column"
      borderStyle="round"
      /*
        This width constraint is highly important and protects us from an Ink rendering bug.
        Since the ToolGroup can typically change rendering states frequently, it can cause
        Ink to render the border of the box incorrectly and span multiple lines and even
        cause tearing.
      */
      width="100%"
      marginLeft={1}
      borderDimColor={hasPending}
      borderColor={borderColor}
      marginBottom={1}
    >
      {toolCalls.map((tool) => (
        <Box key={groupId + '-' + tool.callId} flexDirection="column">
          <ToolMessage
            key={tool.callId} // Use callId as the key
            callId={tool.callId} // Pass callId
            name={tool.name}
            description={tool.description}
            resultDisplay={tool.resultDisplay}
            status={tool.status}
            confirmationDetails={tool.confirmationDetails} // Pass confirmationDetails
          />
          {tool.status === ToolCallStatus.Confirming &&
            tool.confirmationDetails && (
              <ToolConfirmationMessage
                confirmationDetails={tool.confirmationDetails}
                onSubmit={onSubmit}
              ></ToolConfirmationMessage>
            )}
        </Box>
      ))}
    </Box>
  );
};
