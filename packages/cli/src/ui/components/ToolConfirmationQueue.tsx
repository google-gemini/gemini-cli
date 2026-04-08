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
import {
  isShellTool,
  ToolStatusIndicator,
  ToolInfo,
} from './messages/ToolShared.js';
import { useUIState } from '../contexts/UIStateContext.js';
import type { ConfirmingToolState } from '../hooks/useConfirmingTool.js';
import { StickyHeader } from './StickyHeader.js';
import type { SerializableConfirmationDetails } from '@google/gemini-cli-core';
import { useUIActions } from '../contexts/UIActionsContext.js';

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

function getConfirmationLabel(
  toolName: string,
  details: SerializableConfirmationDetails | undefined,
): string {
  if (details?.type === 'ask_user') return 'Questions';
  if (details?.type === 'exit_plan_mode') return 'Implementation';
  if (isShellTool(toolName)) return 'Shell';
  return toolName;
}

interface ToolConfirmationQueueProps {
  confirmingTool: ConfirmingToolState;
}

export const ToolConfirmationQueue: React.FC<ToolConfirmationQueueProps> = ({
  confirmingTool,
}) => {
  const config = useConfig();
  const { getPreferredEditor } = useUIActions();
  const {
    mainAreaWidth,
    terminalHeight,
    constrainHeight,
    availableTerminalHeight: uiAvailableHeight,
  } = useUIState();
  const { tool, index, total } = confirmingTool;

  // Safety check: ToolConfirmationMessage requires confirmationDetails
  if (!tool.confirmationDetails) return null;

  // Render up to 100% of the available terminal height
  // to maximize space for diffs and other content.
  const maxHeight =
    uiAvailableHeight !== undefined
      ? Math.max(uiAvailableHeight, 4)
      : Math.floor(terminalHeight * 0.5);

  const isShell = isShellTool(tool.name);
  const isEdit = tool.confirmationDetails?.type === 'edit';

  if (isShell || isEdit) {
    // Use the new simplified layout for Shell and Edit tools
    const borderColor = theme.border.default;
    const availableContentHeight = constrainHeight
      ? Math.max(maxHeight - 3, 4)
      : undefined;

    const toolLabel = getConfirmationLabel(tool.name, tool.confirmationDetails);

    return (
      <Box
        flexDirection="column"
        width={mainAreaWidth}
        flexShrink={0}
        borderStyle="round"
        borderColor={borderColor}
        paddingX={1}
      >
        {/* Header Line */}
        <Box justifyContent="space-between" marginBottom={0}>
          <Box flexDirection="row" flexShrink={1} overflow="hidden">
            <Text color={theme.status.warning} bold>
              ? {toolLabel}
              {!!tool.description && '  '}
            </Text>
            {!!tool.description && (
              <Box flexShrink={1} overflow="hidden">
                <Text color={theme.text.primary} wrap="truncate-end">
                  {tool.description}
                </Text>
              </Box>
            )}
          </Box>
          {total > 1 && (
            <Text color={theme.text.secondary}>
              {index} of {total}
            </Text>
          )}
        </Box>

        {/* Interactive Area */}
        <Box flexDirection="column">
          <ToolConfirmationMessage
            callId={tool.callId}
            confirmationDetails={tool.confirmationDetails}
            config={config}
            getPreferredEditor={getPreferredEditor}
            terminalWidth={mainAreaWidth - 4} // Adjust for parent border/padding
            availableTerminalHeight={availableContentHeight}
            toolName={tool.name}
            isFocused={true}
          />
        </Box>
      </Box>
    );
  }

  // Restore original logic for other tools
  const isRoutine =
    tool.confirmationDetails?.type === 'ask_user' ||
    tool.confirmationDetails?.type === 'exit_plan_mode';
  const borderColor = isRoutine ? theme.status.success : theme.status.warning;
  const hideToolIdentity = isRoutine;

  const availableContentHeight = constrainHeight
    ? Math.max(maxHeight - (hideToolIdentity ? 4 : 6), 4)
    : undefined;

  return (
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
        <ToolConfirmationMessage
          callId={tool.callId}
          confirmationDetails={tool.confirmationDetails}
          config={config}
          getPreferredEditor={getPreferredEditor}
          terminalWidth={mainAreaWidth - 4} // Adjust for parent border/padding
          availableTerminalHeight={availableContentHeight}
          toolName={tool.name}
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
  );
};
