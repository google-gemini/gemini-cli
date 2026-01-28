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
import { OverflowProvider } from '../contexts/OverflowContext.js';
import { ShowMoreLines } from './ShowMoreLines.js';
import { StickyHeader } from './StickyHeader.js';
import { useAlternateBuffer } from '../hooks/useAlternateBuffer.js';

interface ToolConfirmationQueueProps {
  confirmingTool: ConfirmingToolState;
}

export const ToolConfirmationQueue: React.FC<ToolConfirmationQueueProps> = ({
  confirmingTool,
}) => {
  const config = useConfig();
  const isAlternateBuffer = useAlternateBuffer();
  const { mainAreaWidth, terminalHeight, constrainHeight } = useUIState();
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
  const availableContentHeight =
    constrainHeight && !isAlternateBuffer
      ? Math.max(maxHeight - 6, 4)
      : undefined;

  const borderColor = theme.status.warning;

  return (
    <OverflowProvider>
      <Box flexDirection="column" width={mainAreaWidth} flexShrink={0}>
        <StickyHeader
          width={mainAreaWidth}
          isFirst={true}
          borderColor={borderColor}
          borderDimColor={false}
        >
          <Box flexDirection="column" width={mainAreaWidth - 4}>
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
            <Box>
              <ToolStatusIndicator status={tool.status} name={tool.name} />
              <ToolInfo
                name={tool.name}
                status={tool.status}
                description={tool.description}
                emphasis="high"
              />
            </Box>
          </Box>
        </StickyHeader>

        <Box
          width={mainAreaWidth}
          borderStyle="round"
          borderColor={borderColor}
          borderTop={false}
          borderBottom={false}
          borderLeft={true}
          borderRight={true}
          paddingX={1}
          flexDirection="column"
        >
          {/* Interactive Area */}
          {/*
            Note: We force isFocused={true} because if this component is rendered,
            it effectively acts as a modal over the shell/composer.
          */}
          <ToolConfirmationMessage
            callId={tool.callId}
            confirmationDetails={tool.confirmationDetails}
            config={config}
            terminalWidth={mainAreaWidth - 4} // Adjust for parent border/padding
            availableTerminalHeight={availableContentHeight}
            isFocused={true}
          />
        </Box>
        <Box
          height={0}
          width={mainAreaWidth}
          borderLeft={true}
          borderRight={true}
          borderTop={false}
          borderBottom={true}
          borderColor={borderColor}
          borderStyle="round"
        />
      </Box>
      <Box paddingX={2} marginBottom={1}>
        <ShowMoreLines constrainHeight={constrainHeight} />
      </Box>
    </OverflowProvider>
  );
};
