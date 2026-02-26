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
import { theme } from '../../semantic-colors.js';
import { useConfig } from '../../contexts/ConfigContext.js';
import { isShellTool, isThisShellFocused } from './ToolShared.js';
import { shouldHideToolCall } from '@google/gemini-cli-core';
import { ShowMoreLines } from '../ShowMoreLines.js';
import { useUIState } from '../../contexts/UIStateContext.js';
import { useAlternateBuffer } from '../../hooks/useAlternateBuffer.js';
import {
  calculateShellMaxLines,
  calculateToolContentMaxLines,
} from '../../utils/toolLayoutUtils.js';
import { getToolGroupBorderAppearance } from '../../utils/borderStyles.js';

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
  // Filter out tool calls that should be hidden (e.g. in-progress Ask User, or Plan Mode operations).
  const toolCalls = useMemo(
    () =>
      allToolCalls.filter(
        (t) =>
          !shouldHideToolCall({
            displayName: t.name,
            status: t.status,
            approvalMode: t.approvalMode,
            hasResultDisplay: !!t.resultDisplay,
          }),
      ),
    [allToolCalls],
  );

  const config = useConfig();
  const {
    constrainHeight,
    activePtyId,
    embeddedShellFocused,
    backgroundShells,
    pendingHistoryItems,
  } = useUIState();
  const isAlternateBuffer = useAlternateBuffer();

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
        return (
          displayStatus !== ToolCallStatus.Pending &&
          displayStatus !== ToolCallStatus.Confirming
        );
      }),

    [toolCalls],
  );

  const staticHeight = /* border */ 2;

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

  /*
   * ToolGroupMessage calculates its own overflow state locally and passes
   * it as a prop to ShowMoreLines. This isolates it from global overflow
   * reports in ASB mode, while allowing it to contribute to the global
   * 'Toast' hint in Standard mode.
   *
   * Because of this prop-based isolation and the explicit mode-checks in
   * AppContainer, we do not need to shadow the OverflowProvider here.
   */
  const hasOverflow = useMemo(() => {
    if (!availableTerminalHeightPerToolMessage) return false;
    return visibleToolCalls.some((tool) => {
      const isShellToolCall = isShellTool(tool.name);
      const isFocused = isThisShellFocused(
        tool.name,
        tool.status,
        tool.ptyId,
        activePtyId,
        embeddedShellFocused,
      );

      let maxLines: number | undefined;

      if (isShellToolCall) {
        maxLines = calculateShellMaxLines({
          status: tool.status,
          isAlternateBuffer,
          isThisShellFocused: isFocused,
          availableTerminalHeight: availableTerminalHeightPerToolMessage,
          constrainHeight,
          isExpandable,
        });
      }

      // Standard tools and Shell tools both eventually use ToolResultDisplay's logic.
      // ToolResultDisplay uses calculateToolContentMaxLines to find the final line budget.
      const contentMaxLines = calculateToolContentMaxLines({
        availableTerminalHeight: availableTerminalHeightPerToolMessage,
        isAlternateBuffer,
        maxLinesLimit: maxLines,
      });

      if (!contentMaxLines) return false;

      if (typeof tool.resultDisplay === 'string') {
        const text = tool.resultDisplay;
        const hasTrailingNewline = text.endsWith('\n');
        const contentText = hasTrailingNewline ? text.slice(0, -1) : text;
        const lineCount = contentText.split('\n').length;
        return lineCount > contentMaxLines;
      }
      if (Array.isArray(tool.resultDisplay)) {
        return tool.resultDisplay.length > contentMaxLines;
      }
      return false;
    });
  }, [
    visibleToolCalls,
    availableTerminalHeightPerToolMessage,
    activePtyId,
    embeddedShellFocused,
    isAlternateBuffer,
    constrainHeight,
    isExpandable,
  ]);

  // If all tools are filtered out (e.g., in-progress AskUser tools, confirming tools),
  // only render if we need to close a border from previous
  // tool groups. borderBottomOverride=true means we must render the closing border;
  // undefined or false means there's nothing to display.
  if (visibleToolCalls.length === 0 && borderBottomOverride !== true) {
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
      {visibleToolCalls.map((tool, index) => {
        const isFirst = index === 0;
        const isShellToolCall = isShellTool(tool.name);

        const commonProps = {
          ...tool,
          availableTerminalHeight: availableTerminalHeightPerToolMessage,
          terminalWidth: contentWidth,
          emphasis: 'medium' as const,
          isFirst:
            borderTopOverride !== undefined
              ? borderTopOverride && isFirst
              : isFirst,
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
        <ShowMoreLines
          constrainHeight={constrainHeight && !!isExpandable}
          isOverflowing={hasOverflow}
        />
      )}
    </Box>
  );

  return content;
};
