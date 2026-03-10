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
import {
  ToolCallStatus,
  mapCoreStatusToDisplayStatus,
  isFileDiff,
  isGrepResult,
  isListResult,
} from '../../types.js';
import { ToolMessage } from './ToolMessage.js';
import { ShellToolMessage } from './ShellToolMessage.js';
import { DenseToolMessage } from './DenseToolMessage.js';
import { theme } from '../../semantic-colors.js';
import { useConfig } from '../../contexts/ConfigContext.js';
import { isShellTool } from './ToolShared.js';
import {
  shouldHideToolCall,
  CoreToolCallStatus,
  EDIT_DISPLAY_NAME,
  GLOB_DISPLAY_NAME,
  WEB_SEARCH_DISPLAY_NAME,
  READ_FILE_DISPLAY_NAME,
  LS_DISPLAY_NAME,
  GREP_DISPLAY_NAME,
  WEB_FETCH_DISPLAY_NAME,
  WRITE_FILE_DISPLAY_NAME,
  READ_MANY_FILES_DISPLAY_NAME,
} from '@google/gemini-cli-core';
import { useUIState } from '../../contexts/UIStateContext.js';
import { getToolGroupBorderAppearance } from '../../utils/borderStyles.js';
import { useSettings } from '../../contexts/SettingsContext.js';

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

  if (isFileDiff(res)) return true;
  if (tool.confirmationDetails?.type === 'edit') return true;
  if (isGrepResult(res) && (res.matches?.length ?? 0) > 0) return true;

  // ReadManyFilesResult check (has 'include' and 'files')
  if (isListResult(res) && 'include' in res && (res.files?.length ?? 0) > 0) {
    return true;
  }

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
  const isCompactModeEnabled = settings.merged.ui?.compactToolOutput === true;

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
        // We used to filter out Pending and Confirming statuses here to avoid
        // duplication with the Global Queue, but this causes tools to appear to
        // "vanish" from the context after approval.
        // We now allow them to be visible here as well.
        return displayStatus !== ToolCallStatus.Canceled;
      }),

    [toolCalls],
  );

  const staticHeight = useMemo(() => {
    let height = 0;
    for (let i = 0; i < visibleToolCalls.length; i++) {
      const tool = visibleToolCalls[i];
      const isCompact = isCompactTool(tool, isCompactModeEnabled);
      const isFirst = i === 0;
      const prevTool = i > 0 ? visibleToolCalls[i - 1] : null;
      const prevIsCompact = prevTool
        ? isCompactTool(prevTool, isCompactModeEnabled)
        : false;

      if (isCompact) {
        height += 1; // Base height for compact tool
        // Spacing logic (matching marginTop)
        if (isFirst) {
          height += (borderTopOverride ?? true) ? 1 : 0;
        } else if (!prevIsCompact) {
          height += 1;
        }
      } else {
        height += 3; // Static overhead for standard tool
        if (isFirst) {
          height += (borderTopOverride ?? true) ? 1 : 0;
        } else {
          height += 1; // marginTop is always 1 for non-compact tools (not first)
        }
      }
    }
    return height;
  }, [visibleToolCalls, isCompactModeEnabled, borderTopOverride]);

  let countToolCallsWithResults = 0;
  for (const tool of visibleToolCalls) {
    if (tool.resultDisplay !== undefined && tool.resultDisplay !== '') {
      countToolCallsWithResults++;
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
  // explicit "closing slice" (tools: []) used to bridge static/pending sections.
  const isExplicitClosingSlice = allToolCalls.length === 0;
  if (
    visibleToolCalls.length === 0 &&
    (!isExplicitClosingSlice || borderBottomOverride !== true)
  ) {
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
      marginBottom={(borderBottomOverride ?? true) ? 1 : 0}
    >
      {visibleToolCalls.map((tool, index) => {
        const isFirst = index === 0;
        const isLast = index === visibleToolCalls.length - 1;
        const isShellToolCall = isShellTool(tool.name);
        const isCompact = isCompactTool(tool, isCompactModeEnabled);

        const prevTool = index > 0 ? visibleToolCalls[index - 1] : null;
        const prevIsCompact = prevTool
          ? isCompactTool(prevTool, isCompactModeEnabled)
          : false;

        const nextTool = !isLast ? visibleToolCalls[index + 1] : null;
        const nextIsCompact = nextTool
          ? isCompactTool(nextTool, isCompactModeEnabled)
          : false;

        let marginTop = 0;
        if (isFirst) {
          marginTop = (borderTopOverride ?? true) ? 1 : 0;
        } else if (!(isCompact && prevIsCompact)) {
          marginTop = 1;
        }

        const commonProps = {
          ...tool,
          availableTerminalHeight: availableTerminalHeightPerToolMessage,
          terminalWidth: contentWidth,
          emphasis: 'medium' as const,
          isFirst: isCompact
            ? false
            : isFirst
              ? (borderTopOverride ?? true)
              : prevIsCompact,
          borderColor,
          borderDimColor,
          isExpandable,
        };

        return (
          <Fragment key={tool.callId}>
            <Box
              flexDirection="column"
              minHeight={1}
              width={contentWidth}
              marginTop={marginTop}
            >
              {isCompact ? (
                <DenseToolMessage {...commonProps} />
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
            {!isCompact && (nextIsCompact || isLast) && (
              <Box
                height={0}
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
