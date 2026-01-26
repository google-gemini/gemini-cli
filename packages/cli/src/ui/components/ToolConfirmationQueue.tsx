/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { ToolConfirmationMessage } from './messages/ToolConfirmationMessage.js';
import { ToolStatusIndicator, ToolInfo } from './messages/ToolShared.js';
import { useUIState } from '../contexts/UIStateContext.js';
import type { ConfirmingToolState } from '../hooks/useConfirmingTool.js';

interface ToolConfirmationQueueProps {
  confirmingTool: ConfirmingToolState;
}

export const ToolConfirmationQueue: React.FC<ToolConfirmationQueueProps> = ({
  confirmingTool,
}) => {
  const config = useConfig();
  const { terminalWidth, terminalHeight } = useUIState();
  const { tool, index, total } = confirmingTool;

  // Safety check: ToolConfirmationMessage requires confirmationDetails
  if (!tool.confirmationDetails) return null;

  // V1: Constrain the queue to at most 50% of the terminal height to ensure
  // some history is always visible and to prevent flickering.
  // We pass this to ToolConfirmationMessage so it can calculate internal
  // truncation while keeping buttons visible.
  const maxHeight = Math.floor(terminalHeight * 0.5);

  // ToolConfirmationMessage needs to know the height available for its OWN content.
  // We subtract the lines used by the Queue wrapper:
  // - 2 lines for the rounded border
  // - 2 lines for the Header (text + margin)
  // - 2 lines for Tool Identity (text + margin)
  const availableContentHeight = Math.max(maxHeight - 6, 4);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.status.warning}
      paddingX={1}
      // Matches existing layout spacing
      width={terminalWidth}
      flexShrink={0}
    >
      {/* Header */}
      <Box marginBottom={1} justifyContent="space-between">
        <Text color={theme.status.warning} bold>
          Action Required
        </Text>
        <Text color={theme.text.secondary}>
          {index} of {total}
        </Text>
      </Box>

      {/* Tool Identity (Context) */}
      <Box marginBottom={1}>
        <ToolStatusIndicator status={tool.status} name={tool.name} />
        <ToolInfo
          name={tool.name}
          status={tool.status}
          description={tool.description}
          emphasis="high"
        />
      </Box>

      {/* Interactive Area */}
      {/* 
        Note: We force isFocused={true} because if this component is rendered,
        it effectively acts as a modal over the shell/composer.
      */}
      <ToolConfirmationMessage
        callId={tool.callId}
        confirmationDetails={tool.confirmationDetails}
        config={config}
        terminalWidth={terminalWidth - 4} // Adjust for parent border/padding
        availableTerminalHeight={availableContentHeight}
        isFocused={true}
      />
    </Box>
  );
};
