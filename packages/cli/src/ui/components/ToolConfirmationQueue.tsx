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
import type { SerializableConfirmationDetails } from '@google/gemini-cli-core';

function getConfirmationHeader(
  details: SerializableConfirmationDetails | undefined,
): string {
  const headers: Partial<
    Record<SerializableConfirmationDetails['type'], string>
  > = {
    ask_user: 'Answer Questions',
    exit_plan_mode: 'Ready to start implementation?',
  };
  if (!details?.type) {
    return 'Action Required';
  }
  return headers[details.type] ?? 'Action Required';
}

interface ToolConfirmationQueueProps {
  confirmingTool: ConfirmingToolState;
}

export const ToolConfirmationQueue: React.FC<ToolConfirmationQueueProps> = ({
  confirmingTool,
}) => {
  const config = useConfig();
  const isAlternateBuffer = useAlternateBuffer();
  const {
    mainAreaWidth,
    terminalHeight,
    constrainHeight,
    availableTerminalHeight: uiAvailableHeight,
  } = useUIState();
  const { tool, index, total } = confirmingTool;

  // Safety check: ToolConfirmationMessage requires confirmationDetails
  if (!tool.confirmationDetails) return null;

  // Render up to 100% of the available terminal height (minus 1 line for safety)
  // to maximize space for diffs and other content.
  const maxHeight =
    uiAvailableHeight !== undefined
      ? Math.max(uiAvailableHeight - 1, 4)
      : Math.floor(terminalHeight * 0.5);

  const isRoutine =
    tool.confirmationDetails?.type === 'ask_user' ||
    tool.confirmationDetails?.type === 'exit_plan_mode';
  const borderColor = isRoutine ? theme.status.success : theme.status.warning;
  const hideToolIdentity = isRoutine;

  // ToolConfirmationMessage needs to know the height available for its OWN content.
  // We subtract the lines used by the Queue wrapper:
  // - 2 lines for the rounded border
  // - 2 lines for the Header (text + margin)
  // - 2 lines for Tool Identity (text + margin)
  const availableContentHeight = constrainHeight
    ? Math.max(maxHeight - (hideToolIdentity ? 4 : 6), 4)
    : undefined;

  const content = (
    <>
      <Box flexDirection="column" width={mainAreaWidth} flexShrink={0}>
        <StickyHeader
          width={mainAreaWidth}
          isFirst={true}
          borderColor={borderColor}
          borderDimColor={false}
        >
          <Box flexDirection="column" width={mainAreaWidth - 4}>
            {/* Header */}
            <Box
              marginBottom={hideToolIdentity ? 0 : 1}
              justifyContent="space-between"
            >
              <Text color={borderColor} bold>
                {getConfirmationHeader(tool.confirmationDetails)}
              </Text>
              {total > 1 && (
                <Text color={theme.text.secondary}>
                  {index} of {total}
                </Text>
              )}
            </Box>

            {!hideToolIdentity && (
              <Box>
                <ToolStatusIndicator status={tool.status} name={tool.name} />
                <ToolInfo
                  name={tool.name}
                  status={tool.status}
                  description={tool.description}
                  emphasis="high"
                />
              </Box>
            )}
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
          height={1}
          width={mainAreaWidth}
          borderLeft={true}
          borderRight={true}
          borderTop={false}
          borderBottom={true}
          borderColor={borderColor}
          borderStyle="round"
        />
      </Box>
      <ShowMoreLines constrainHeight={constrainHeight} />
    </>
  );

  return isAlternateBuffer ? (
    /* Shadow the global provider to maintain isolation in ASB mode. */
    <OverflowProvider>{content}</OverflowProvider>
  ) : (
    content
  );
};
