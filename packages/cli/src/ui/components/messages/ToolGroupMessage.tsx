/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useMemo } from 'react';
import { Box, Text } from 'ink';
import type { IndividualToolCallDisplay } from '../../types.js';
import { ToolCallStatus } from '../../types.js';
import { ToolMessage } from './ToolMessage.js';
import { ShellToolMessage } from './ShellToolMessage.js';
import { ToolConfirmationMessage } from './ToolConfirmationMessage.js';
import { theme } from '../../semantic-colors.js';
import { useConfig } from '../../contexts/ConfigContext.js';
import { isShellTool, isThisShellFocused } from './ToolShared.js';
import { ASK_USER_DISPLAY_NAME } from '@google/gemini-cli-core';
import { ShowMoreLines } from '../ShowMoreLines.js';
import { useUIState } from '../../contexts/UIStateContext.js';

interface ToolGroupMessageProps {
  groupId: number;
  toolCalls: IndividualToolCallDisplay[];
  availableTerminalHeight?: number;
  terminalWidth: number;
  isFocused?: boolean;
  activeShellPtyId?: number | null;
  embeddedShellFocused?: boolean;
  onShellInputSubmit?: (input: string) => void;
  borderTop?: boolean;
  borderBottom?: boolean;
}

// Helper to identify Ask User tools that are in progress (have their own dialog UI)
const isAskUserInProgress = (t: IndividualToolCallDisplay): boolean =>
  t.name === ASK_USER_DISPLAY_NAME &&
  [
    ToolCallStatus.Pending,
    ToolCallStatus.Executing,
    ToolCallStatus.Confirming,
  ].includes(t.status);

// Main component renders the border and maps the tools using ToolMessage
const TOOL_MESSAGE_HORIZONTAL_MARGIN = 4;
const TOOL_CONFIRMATION_INTERNAL_PADDING = 4;

export const ToolGroupMessage: React.FC<ToolGroupMessageProps> = ({
  toolCalls: allToolCalls,
  availableTerminalHeight,
  terminalWidth,
  isFocused = true,
  activeShellPtyId,
  embeddedShellFocused,
  borderTop: borderTopOverride,
  borderBottom: borderBottomOverride,
}) => {
  // Filter out in-progress Ask User tools (they have their own AskUserDialog UI)
  const toolCalls = useMemo(
    () => allToolCalls.filter((t) => !isAskUserInProgress(t)),
    [allToolCalls],
  );

  const config = useConfig();
  const { constrainHeight } = useUIState();

  const isEventDriven = config.isEventDrivenSchedulerEnabled();

  // If Event-Driven Scheduler is enabled, we HIDE tools that are still in
  // pre-execution states (Confirming, Pending) from the History log.
  // They live in the Global Queue or wait for their turn.
  const visibleToolCalls = useMemo(() => {
    if (!isEventDriven) {
      return toolCalls;
    }
    // Only show tools that are actually running or finished.
    // We explicitly exclude Pending and Confirming to ensure they only
    // appear in the Global Queue until they are approved and start executing.
    return toolCalls.filter(
      (t) =>
        t.status !== ToolCallStatus.Pending &&
        t.status !== ToolCallStatus.Confirming,
    );
  }, [toolCalls, isEventDriven]);

  const isEmbeddedShellFocused = visibleToolCalls.some((t) =>
    isThisShellFocused(
      t.name,
      t.status,
      t.ptyId,
      activeShellPtyId,
      embeddedShellFocused,
    ),
  );

  const hasPending = !visibleToolCalls.every(
    (t) => t.status === ToolCallStatus.Success,
  );

  const isShellCommand = toolCalls.some((t) => isShellTool(t.name));
  const borderColor =
    (isShellCommand && hasPending) || isEmbeddedShellFocused
      ? theme.ui.symbol
      : hasPending
        ? theme.status.warning
        : theme.border.default;

  const borderDimColor =
    hasPending && (!isShellCommand || !isEmbeddedShellFocused);

  const staticHeight = /* border */ 2 + /* marginBottom */ 1;

  // Inline confirmations are ONLY used when the Global Queue is disabled.
  const toolAwaitingApproval = useMemo(
    () =>
      isEventDriven
        ? undefined
        : toolCalls.find((tc) => tc.status === ToolCallStatus.Confirming),
    [toolCalls, isEventDriven],
  );

  // If all tools are filtered out (e.g., in-progress AskUser tools, confirming tools
  // in event-driven mode), only render if we need to close a border from previous
  // tool groups. borderBottomOverride=true means we must render the closing border;
  // undefined or false means there's nothing to display.
  if (visibleToolCalls.length === 0 && borderBottomOverride !== true) {
    return null;
  }

  let countToolCallsWithResults = 0;
  for (const tool of visibleToolCalls) {
    if (tool.resultDisplay !== undefined && tool.resultDisplay !== '') {
      countToolCallsWithResults++;
    }
  }
  const countOneLineToolCalls =
    visibleToolCalls.length - countToolCallsWithResults;
  const availableTerminalHeightPerToolMessage = availableTerminalHeight
    ? Math.max(
        Math.floor(
          (availableTerminalHeight - staticHeight - countOneLineToolCalls) /
            Math.max(1, countToolCallsWithResults),
        ),
        1,
      )
    : undefined;

  const contentWidth = terminalWidth - TOOL_MESSAGE_HORIZONTAL_MARGIN;

  return (
    // This box doesn't have a border even though it conceptually does because
    // we need to allow the sticky headers to render the borders themselves so
    // that the top border can be sticky.
    <Box
      flexDirection="column"
      /*
        This width constraint is highly important and protects us from an Ink rendering bug.
        Since the ToolGroup can typically change rendering states frequently, it can cause
        Ink to render the border of the box incorrectly and span multiple lines and even
        cause tearing.
      */
      width={terminalWidth}
      paddingRight={TOOL_MESSAGE_HORIZONTAL_MARGIN}
    >
      {visibleToolCalls.map((tool, index) => {
        const isConfirming = toolAwaitingApproval?.callId === tool.callId;
        const isFirst = index === 0;
        const isShellToolCall = isShellTool(tool.name);

        const commonProps = {
          ...tool,
          availableTerminalHeight: availableTerminalHeightPerToolMessage,
          terminalWidth: contentWidth,
          emphasis: isConfirming
            ? ('high' as const)
            : toolAwaitingApproval
              ? ('low' as const)
              : ('medium' as const),
          isFirst:
            borderTopOverride !== undefined
              ? borderTopOverride && isFirst
              : isFirst,
          borderColor,
          borderDimColor,
        };

        return (
          <Box
            key={tool.callId}
            flexDirection="column"
            minHeight={1}
            width={contentWidth}
          >
            {isShellToolCall ? (
              <ShellToolMessage
                {...commonProps}
                activeShellPtyId={activeShellPtyId}
                embeddedShellFocused={embeddedShellFocused}
                config={config}
              />
            ) : (
              <ToolMessage {...commonProps} />
            )}
            <Box
              borderLeft={true}
              borderRight={true}
              borderTop={false}
              borderBottom={false}
              borderColor={borderColor}
              borderDimColor={borderDimColor}
              flexDirection="column"
              borderStyle="round"
              paddingLeft={1}
              paddingRight={1}
            >
              {tool.status === ToolCallStatus.Confirming &&
                isConfirming &&
                tool.confirmationDetails && (
                  <ToolConfirmationMessage
                    callId={tool.callId}
                    confirmationDetails={tool.confirmationDetails}
                    config={config}
                    isFocused={isFocused}
                    availableTerminalHeight={
                      availableTerminalHeightPerToolMessage
                    }
                    terminalWidth={
                      contentWidth - TOOL_CONFIRMATION_INTERNAL_PADDING
                    }
                  />
                )}
              {tool.outputFile && (
                <Box>
                  <Text color={theme.text.primary}>
                    Output too long and was saved to: {tool.outputFile}
                  </Text>
                </Box>
              )}
            </Box>
          </Box>
        );
      })}
      {
        /*
              We have to keep the bottom border separate so it doesn't get
              drawn over by the sticky header directly inside it.
             */
        (visibleToolCalls.length > 0 || borderBottomOverride !== undefined) && (
          <Box
            height={0}
            width={contentWidth}
            borderLeft={true}
            borderRight={true}
            borderTop={false}
            borderBottom={borderBottomOverride ?? true}
            borderColor={borderColor}
            borderDimColor={borderDimColor}
            borderStyle="round"
          />
        )
      }
      {(borderBottomOverride ?? true) && visibleToolCalls.length > 0 && (
        <Box paddingX={1}>
          <ShowMoreLines constrainHeight={constrainHeight} />
        </Box>
      )}
    </Box>
  );
};
