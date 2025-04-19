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

interface ToolGroupMessageProps {
  toolCalls: IndividualToolCallDisplay[];
  onSubmit: (value: PartListUnion) => void;
}

// Main component renders the border and maps the tools using ToolMessage
export const ToolGroupMessage: React.FC<ToolGroupMessageProps> = ({
  toolCalls,
  onSubmit,
}) => {
  const hasPending = toolCalls.some((t) => t.status === ToolCallStatus.Pending);
  const borderColor = hasPending ? 'yellow' : 'blue';

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={borderColor}>
      {toolCalls.map((tool) => (
        <React.Fragment key={tool.callId}>
          <ToolMessage
            key={tool.callId} // Use callId as the key
            name={tool.name}
            description={tool.description}
            resultDisplay={tool.resultDisplay}
            status={tool.status}
          />
          {tool.status === ToolCallStatus.Confirming &&
            tool.confirmationDetails && (
              <ToolConfirmationMessage
                confirmationDetails={tool.confirmationDetails}
                onSubmit={onSubmit}
              ></ToolConfirmationMessage>
            )}
        </React.Fragment>
      ))}
      {/* Optional: Add padding below the last item if needed,
                though ToolMessage already has some vertical space implicitly */}
      {/* {tools.length > 0 && <Box height={1} />} */}
    </Box>
  );
};
