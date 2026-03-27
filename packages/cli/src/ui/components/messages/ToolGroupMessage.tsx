/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useMemo } from 'react';
import { Box, Text } from 'ink';
import type {
  HistoryItem,
  HistoryItemWithoutId,
  IndividualToolCallDisplay,
} from '../../types.js';
import { ToolCallStatus, mapCoreStatusToDisplayStatus } from '../../types.js';
import { ToolMessage } from './ToolMessage.js';
import { ShellToolMessage } from './ShellToolMessage.js';
import { SubagentGroupDisplay } from './SubagentGroupDisplay.js';
import { theme } from '../../semantic-colors.js';
import { useConfig } from '../../contexts/ConfigContext.js';
import { isShellTool } from './ToolShared.js';
import {
  shouldHideToolCall,
  CoreToolCallStatus,
  Kind,
} from '@google/gemini-cli-core';
import { useUIState } from '../../contexts/UIStateContext.js';
import { getToolGroupBorderAppearance } from '../../utils/borderStyles.js';
import { useSettings } from '../../contexts/SettingsContext.js';

interface ToolGroupMessageProps {
  item: HistoryItem | HistoryItemWithoutId;
  toolCalls: IndividualToolCallDisplay[];
  availableTerminalHeight?: number;
  terminalWidth: number;
  onShellInputSubmit?: (input: string) => void;
  borderTop?: boolean;
  borderBottom?: boolean;
  isExpandable?: boolean;
}

// Main component renders the border and maps the tools using ToolMessage
const TOOL_MESSAGE_HORIZONTAL_MARGIN = 4;

export const ToolGroupMessage: React.FC<ToolGroupMessageProps> = ({
  item,
  toolCalls: allToolCalls,
  availableTerminalHeight,
  terminalWidth,
  borderTop: borderTopOverride,
  borderBottom: borderBottomOverride,
  isExpandable,
}) => {
  const settings = useSettings();
  const isLowErrorVerbosity = settings.merged.ui?.errorVerbosity !== 'full';

  // Filter out tool calls that should be hidden (e.g. in-progress Ask User, or Plan Mode operations).
  const toolCalls = useMemo(
    () =>
      allToolCalls.filter((t) => {
        if (
          isLowErrorVerbosity &&
          t.status === CoreToolCallStatus.Error &&
          !t.isClientInitiated
        ) {
          return false;
        }

        return !shouldHideToolCall({
          displayName: t.name,
          status: t.status,
          approvalMode: t.approvalMode,
          hasResultDisplay: !!t.resultDisplay,
          parentCallId: t.parentCallId,
        });
      }),
    [allToolCalls, isLowErrorVerbosity],
  );

  const config = useConfig();
  const {
    activePtyId,
    embeddedShellFocused,
    backgroundShells,
    pendingHistoryItems,
  } = useUIState();

  const { borderColor, borderDimColor } = useMemo(
    () =>
      getToolGroupBorderAppearance(
        item,
        activePtyId,
        embeddedShellFocused,
        pendingHistoryItems,
        backgroundShells,
      ),
    [
      item,
      activePtyId,
      embeddedShellFocused,
      pendingHistoryItems,
      backgroundShells,
    ],
  );

  // We HIDE tools that are still in pre-execution states (Confirming, Pending)
  // from the History log. They live in the Global Queue or wait for their turn.
  // Only show tools that are actually running or finished.
  // We explicitly exclude Pending and Confirming to ensure they only
  // appear in the Global Queue until they are approved and start executing.
  const visibleToolCalls = useMemo(
    () =>
      toolCalls.filter((t) => {
        const displayStatus = mapCoreStatusToDisplayStatus(t.status);
        // We hide Confirming tools from the history log because they are
        // currently being rendered in the interactive ToolConfirmationQueue.
        // We show everything else, including Pending (waiting to run) and
        // Canceled (rejected by user), to ensure the history is complete
        // and to avoid tools "vanishing" after approval.
        return displayStatus !== ToolCallStatus.Confirming;
      }),

    [toolCalls],
  );

  const staticHeight = /* border */ 2;

  let countToolCallsWithResults = 0;
  for (const tool of visibleToolCalls) {
    if (
      tool.kind !== Kind.Agent &&
      tool.resultDisplay !== undefined &&
      tool.resultDisplay !== ''
    ) {
      countToolCallsWithResults++;
    }
  }
  const countOneLineToolCalls =
    visibleToolCalls.filter((t) => t.kind !== Kind.Agent).length -
    countToolCallsWithResults;
  const groupedTools = useMemo(() => {
    const groups: Array<
      IndividualToolCallDisplay | IndividualToolCallDisplay[]
    > = [];
    for (const tool of visibleToolCalls) {
      if (tool.kind === Kind.Agent) {
        const lastGroup = groups[groups.length - 1];
        if (Array.isArray(lastGroup)) {
          lastGroup.push(tool);
        } else {
          groups.push([tool]);
        }
      } else {
        groups.push(tool);
      }
    }
    return groups;
  }, [visibleToolCalls]);

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

  // If all tools are filtered out (e.g., in-progress AskUser tools, low-verbosity
  // internal errors, plan-mode hidden write/edit), we should not emit standalone
  // border fragments. The only case where an empty group should render is the
  // explicit "closing slice" (tools: []) used to bridge static/pending sections,
  // and only if it's actually continuing an open box from above.
  const isExplicitClosingSlice = allToolCalls.length === 0;
  if (visibleToolCalls.length === 0 && !isExplicitClosingSlice) {
    return null;
  }

  const content = (
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
      {groupedTools.map((group, index) => {
        const isFirst = index === 0;
        const resolvedIsFirst =
          borderTopOverride !== undefined
            ? borderTopOverride && isFirst
            : isFirst;

        if (Array.isArray(group)) {
          return (
            <SubagentGroupDisplay
              key={group[0].callId}
              toolCalls={group}
              availableTerminalHeight={availableTerminalHeight}
              terminalWidth={contentWidth}
              borderColor={borderColor}
              borderDimColor={borderDimColor}
              isFirst={resolvedIsFirst}
              isExpandable={isExpandable}
            />
          );
        }

        const tool = group;
        const isShellToolCall = isShellTool(tool.name);

        const commonProps = {
          ...tool,
          availableTerminalHeight: availableTerminalHeightPerToolMessage,
          terminalWidth: contentWidth,
          emphasis: 'medium' as const,
          isFirst: resolvedIsFirst,
          borderColor,
          borderDimColor,
          isExpandable,
        };

        return (
          <Box
            key={tool.callId}
            flexDirection="column"
            minHeight={1}
            width={contentWidth}
          >
            {isShellToolCall ? (
              <ShellToolMessage {...commonProps} config={config} />
            ) : (
              <ToolMessage {...commonProps} />
            )}
            {tool.outputFile && (
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
                <Box>
                  <Text color={theme.text.primary}>
                    Output too long and was saved to: {tool.outputFile}
                  </Text>
                </Box>
              </Box>
            )}
          </Box>
        );
      })}
      {
        /*
            We have to keep the bottom border separate so it doesn't get
            drawn over by the sticky header directly inside it.
           */
        (visibleToolCalls.length > 0 || borderBottomOverride !== undefined) &&
          borderBottomOverride !== false && (
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
    </Box>
  );

  return content;
};
