/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useMemo, Fragment } from 'react';
import { Box, Text } from 'ink';
import type {
  HistoryItem,
  HistoryItemWithoutId,
  IndividualToolCallDisplay,
} from '../../types.js';
import { ToolCallStatus, mapCoreStatusToDisplayStatus } from '../../types.js';
import { ToolMessage } from './ToolMessage.js';
import { ShellToolMessage } from './ShellToolMessage.js';
import { TopicMessage, isTopicTool } from './TopicMessage.js';
import { SubagentGroupDisplay } from './SubagentGroupDisplay.js';
import { DenseToolMessage } from './DenseToolMessage.js';
import { theme } from '../../semantic-colors.js';
import { useConfig } from '../../contexts/ConfigContext.js';
import { isShellTool } from './ToolShared.js';
import {
  shouldHideToolCall,
  CoreToolCallStatus,
  Kind,
  EDIT_DISPLAY_NAME,
  GLOB_DISPLAY_NAME,
  WEB_SEARCH_DISPLAY_NAME,
  READ_FILE_DISPLAY_NAME,
  LS_DISPLAY_NAME,
  GREP_DISPLAY_NAME,
  WEB_FETCH_DISPLAY_NAME,
  WRITE_FILE_DISPLAY_NAME,
  READ_MANY_FILES_DISPLAY_NAME,
  isFileDiff,
} from '@google/gemini-cli-core';
import { useUIState } from '../../contexts/UIStateContext.js';
import { getToolGroupBorderAppearance } from '../../utils/borderStyles.js';
import { useSettings } from '../../contexts/SettingsContext.js';
import {
  TOOL_RESULT_STATIC_HEIGHT,
  TOOL_RESULT_STANDARD_RESERVED_LINE_COUNT,
} from '../../utils/toolLayoutUtils.js';

const COMPACT_OUTPUT_ALLOWLIST = new Set([
  EDIT_DISPLAY_NAME,
  GLOB_DISPLAY_NAME,
  WEB_SEARCH_DISPLAY_NAME,
  READ_FILE_DISPLAY_NAME,
  LS_DISPLAY_NAME,
  GREP_DISPLAY_NAME,
  WEB_FETCH_DISPLAY_NAME,
  WRITE_FILE_DISPLAY_NAME,
  READ_MANY_FILES_DISPLAY_NAME,
]);

// Helper to identify if a tool should use the compact view
export const isCompactTool = (
  tool: IndividualToolCallDisplay,
  isCompactModeEnabled: boolean,
): boolean => {
  const hasCompactOutputSupport = COMPACT_OUTPUT_ALLOWLIST.has(tool.name);
  const displayStatus = mapCoreStatusToDisplayStatus(tool.status);
  return (
    isCompactModeEnabled &&
    hasCompactOutputSupport &&
    displayStatus !== ToolCallStatus.Confirming
  );
};

// Helper to identify if a compact tool has a payload (diff, list, etc.)
export const hasDensePayload = (tool: IndividualToolCallDisplay): boolean => {
  if (tool.outputFile) return true;
  const res = tool.resultDisplay;
  if (!res) return false;

  // TODO(24053): Usage of type guards makes this class too aware of internals
  if (isFileDiff(res)) return true;
  if (tool.confirmationDetails?.type === 'edit') return true;

  // Generic summary/payload pattern
  if (
    typeof res === 'object' &&
    res !== null &&
    'summary' in res &&
    'payload' in res
  ) {
    return true;
  }

  return false;
};

interface ToolGroupMessageProps {
  item: HistoryItem | HistoryItemWithoutId;
  toolCalls: IndividualToolCallDisplay[];
  availableTerminalHeight?: number;
  terminalWidth: number;
  onShellInputSubmit?: (input: string) => void;
  borderTop?: boolean;
  borderBottom?: boolean;
  isExpandable?: boolean;
  isToolGroupBoundary?: boolean;
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
  isToolGroupBoundary,
}) => {
  const settings = useSettings();
  const isLowErrorVerbosity = settings.merged.ui?.errorVerbosity !== 'full';
  const isCompactModeEnabled = settings.merged.ui?.compactToolOutput === true;

  // Filter out tool calls that should be hidden (e.g. in-progress Ask User, or Plan Mode operations).
  const visibleToolCalls = useMemo(
    () =>
      allToolCalls.filter((t) => {
        // Hide internal errors unless full verbosity
        if (
          isLowErrorVerbosity &&
          t.status === CoreToolCallStatus.Error &&
          !t.isClientInitiated
        ) {
          return false;
        }
        // Standard hiding logic (e.g. Plan Mode internal edits)
        if (
          shouldHideToolCall({
            displayName: t.name,
            status: t.status,
            approvalMode: t.approvalMode,
            hasResultDisplay: !!t.resultDisplay,
            parentCallId: t.parentCallId,
          })
        ) {
          return false;
        }

        // We HIDE tools that are still in pre-execution states (Confirming, Pending)
        // from the History log. They live in the Global Queue or wait for their turn.
        // Only show tools that are actually running or finished.
        const displayStatus = mapCoreStatusToDisplayStatus(t.status);

        // We hide Confirming tools from the history log because they are
        // currently being rendered in the interactive ToolConfirmationQueue.
        // We show everything else, including Pending (waiting to run) and
        // Canceled (rejected by user), to ensure the history is complete
        // and to avoid tools "vanishing" after approval.
        return displayStatus !== ToolCallStatus.Confirming;
      }),
    [allToolCalls, isLowErrorVerbosity],
  );

  const {
    activePtyId,
    embeddedShellFocused,
    backgroundTasks,
    pendingHistoryItems,
  } = useUIState();

  const config = useConfig();

  const { borderColor, borderDimColor } = useMemo(
    () =>
      getToolGroupBorderAppearance(
        item,
        activePtyId,
        embeddedShellFocused,
        pendingHistoryItems,
        backgroundTasks,
      ),
    [
      item,
      activePtyId,
      embeddedShellFocused,
      pendingHistoryItems,
      backgroundTasks,
    ],
  );

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

  const staticHeight = useMemo(() => {
    let height = 0;

    for (let i = 0; i < groupedTools.length; i++) {
      const group = groupedTools[i];
      const isLast = i === groupedTools.length - 1;

      const prevGroup = i > 0 ? groupedTools[i - 1] : null;
      const prevIsCompact =
        prevGroup &&
        !Array.isArray(prevGroup) &&
        isCompactTool(prevGroup, isCompactModeEnabled);

      const nextGroup = !isLast ? groupedTools[i + 1] : null;
      const nextIsCompact =
        nextGroup &&
        !Array.isArray(nextGroup) &&
        isCompactTool(nextGroup, isCompactModeEnabled);

      const nextIsTopicToolCall =
        nextGroup && !Array.isArray(nextGroup) && isTopicTool(nextGroup.name);

      const isAgentGroup = Array.isArray(group);
      const isCompact =
        !isAgentGroup && isCompactTool(group, isCompactModeEnabled);
      const isTopicToolCall = !isAgentGroup && isTopicTool(group.name);

      // Align isFirst logic with rendering
      let isFirst = i === 0;
      if (!isFirst) {
        // Check if all previous tools were topics (matches rendering logic exactly)
        let allPreviousTopics = true;
        for (let j = 0; j < i; j++) {
          const prevGroupItem = groupedTools[j];
          if (
            Array.isArray(prevGroupItem) ||
            !isTopicTool(prevGroupItem.name)
          ) {
            allPreviousTopics = false;
            break;
          }
        }
        isFirst = allPreviousTopics;
      }

      const isFirstProp = !!(isFirst
        ? (borderTopOverride ?? true)
        : prevIsCompact);

      const showClosingBorder =
        !isCompact &&
        !isTopicToolCall &&
        (nextIsCompact || nextIsTopicToolCall || isLast);

      if (isAgentGroup) {
        // Agent Group Spacing Breakdown:
        // 1. Top Boundary (0 or 1): Only present via borderTop if isFirstProp is true.
        // 2. Header Content (1): The "≡ Running Agent..." status text.
        // 3. Agent List (group.length lines): One line per agent in the group.
        // 4. Closing Border (1): Added if transition logic (showClosingBorder) requires it.
        height +=
          (isFirstProp ? 1 : 0) +
          1 +
          group.length +
          (showClosingBorder ? 1 : 0);
      } else if (isTopicToolCall) {
        // Topic Message Spacing Breakdown:
        // 1. Top Margin (1): Present unless it's the very first item following a boundary.
        // 2. Topic Content (1).
        // 3. Bottom Margin (1): Always present around TopicMessage for breathing room.
        const hasTopMargin = !(isFirst && isToolGroupBoundary);
        height += (hasTopMargin ? 1 : 0) + 1 + 1;
      } else if (isCompact) {
        // Compact Tool: Always renders as a single dense line.
        height += 1;
      } else {
        // Standard Tool (ToolMessage / ShellToolMessage) Spacing Breakdown:
        // 1. TOOL_RESULT_STANDARD_RESERVED_LINE_COUNT (4) accounts for the top boundary,
        // internal separator, header padding, and the group closing border.
        // (Subtract 1 to isolate the group-level closing border.)
        // 2. Header Content (1): TOOL_RESULT_STATIC_HEIGHT (the tool name/status).
        // 3. Output File Message (1): (conditional) if outputFile is present.
        // 4. Group Closing Border (1): (conditional) if transition logic (showClosingBorder) requires it.
        height +=
          TOOL_RESULT_STANDARD_RESERVED_LINE_COUNT -
          1 +
          TOOL_RESULT_STATIC_HEIGHT +
          (group.outputFile ? 1 : 0) +
          (showClosingBorder ? 1 : 0);
      }
    }
    return height;
  }, [
    groupedTools,
    isCompactModeEnabled,
    borderTopOverride,
    isToolGroupBoundary,
  ]);

  let countToolCallsWithResults = 0;
  for (const tool of visibleToolCalls) {
    if (tool.kind !== Kind.Agent) {
      if (isCompactTool(tool, isCompactModeEnabled)) {
        if (hasDensePayload(tool)) {
          countToolCallsWithResults++;
        }
      } else if (
        tool.resultDisplay !== undefined &&
        tool.resultDisplay !== ''
      ) {
        countToolCallsWithResults++;
      }
    }
  }

  const availableTerminalHeightPerToolMessage = availableTerminalHeight
    ? Math.max(
        Math.floor(
          (availableTerminalHeight - staticHeight) /
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
  const shouldShowGroup =
    visibleToolCalls.length > 0 ||
    (isExplicitClosingSlice && borderBottomOverride === true);

  if (!shouldShowGroup) {
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
      marginBottom={0}
    >
      {visibleToolCalls.length === 0 &&
        isExplicitClosingSlice &&
        borderBottomOverride === true && (
          <Box
            width={contentWidth}
            borderLeft={true}
            borderRight={true}
            borderTop={false}
            borderBottom={true}
            borderColor={borderColor}
            borderDimColor={borderDimColor}
            borderStyle="round"
          />
        )}
      {groupedTools.map((group, index) => {
        let isFirst = index === 0;
        if (!isFirst) {
          // Check if all previous tools were topics
          let allPreviousWereTopics = true;
          for (let i = 0; i < index; i++) {
            const prevGroup = groupedTools[i];
            if (Array.isArray(prevGroup) || !isTopicTool(prevGroup.name)) {
              allPreviousWereTopics = false;
              break;
            }
          }
          isFirst = allPreviousWereTopics;
        }

        const isLast = index === groupedTools.length - 1;

        const prevGroup = index > 0 ? groupedTools[index - 1] : null;
        const prevIsCompact =
          prevGroup &&
          !Array.isArray(prevGroup) &&
          isCompactTool(prevGroup, isCompactModeEnabled);

        const nextGroup = !isLast ? groupedTools[index + 1] : null;
        const nextIsCompact =
          nextGroup &&
          !Array.isArray(nextGroup) &&
          isCompactTool(nextGroup, isCompactModeEnabled);
        const nextIsTopicToolCall =
          nextGroup && !Array.isArray(nextGroup) && isTopicTool(nextGroup.name);

        const isAgentGroup = Array.isArray(group);
        const isCompact =
          !isAgentGroup && isCompactTool(group, isCompactModeEnabled);
        const isTopicToolCall = !isAgentGroup && isTopicTool(group.name);

        const isFirstProp = !!(isFirst
          ? (borderTopOverride ?? true)
          : prevIsCompact);

        const showClosingBorder =
          !isCompact &&
          !isTopicToolCall &&
          (nextIsCompact || nextIsTopicToolCall || isLast);

        if (isAgentGroup) {
          return (
            <Box
              key={group[0].callId}
              flexDirection="column"
              width={contentWidth}
            >
              <SubagentGroupDisplay
                toolCalls={group}
                availableTerminalHeight={availableTerminalHeight}
                terminalWidth={contentWidth}
                borderColor={borderColor}
                borderDimColor={borderDimColor}
                isFirst={isFirstProp}
                isExpandable={isExpandable}
              />
              {showClosingBorder && (
                <Box
                  width={contentWidth}
                  borderLeft={true}
                  borderRight={true}
                  borderTop={false}
                  borderBottom={isLast ? (borderBottomOverride ?? true) : true}
                  borderColor={borderColor}
                  borderDimColor={borderDimColor}
                  borderStyle="round"
                />
              )}
            </Box>
          );
        }

        const tool = group;
        const isShellToolCall = isShellTool(tool.name);

        const commonProps = {
          ...tool,
          availableTerminalHeight: availableTerminalHeightPerToolMessage,
          terminalWidth: contentWidth,
          emphasis: 'medium' as const,
          isFirst: isCompact ? false : isFirstProp,
          borderColor,
          borderDimColor,
          isExpandable,
        };

        return (
          <Fragment key={tool.callId}>
            <Box flexDirection="column" minHeight={1} width={contentWidth}>
              {isCompact ? (
                <DenseToolMessage {...commonProps} />
              ) : isTopicToolCall ? (
                <Box
                  marginTop={isFirst && isToolGroupBoundary ? 0 : 1}
                  marginBottom={1}
                >
                  <TopicMessage {...commonProps} />
                </Box>
              ) : isShellToolCall ? (
                <ShellToolMessage {...commonProps} config={config} />
              ) : (
                <ToolMessage {...commonProps} />
              )}
              {!isCompact && tool.outputFile && (
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
            {showClosingBorder && (
              <Box
                width={contentWidth}
                borderLeft={true}
                borderRight={true}
                borderTop={false}
                borderBottom={isLast ? (borderBottomOverride ?? true) : true}
                borderColor={borderColor}
                borderDimColor={borderDimColor}
                borderStyle="round"
              />
            )}
          </Fragment>
        );
      })}
    </Box>
  );

  return content;
};
