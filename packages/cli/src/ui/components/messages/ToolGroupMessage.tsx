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
import { SHELL_COMMAND_NAME, SHELL_NAME } from '../../constants.js';
import {
  ACTIVATE_SKILL_TOOL_NAME,
  SHELL_TOOL_NAME,
} from '@google/gemini-cli-core';
import { useConfig } from '../../contexts/ConfigContext.js';

interface ToolGroupMessageProps {
  groupId: number;
  toolCalls: IndividualToolCallDisplay[];
  availableTerminalHeight?: number;
  terminalWidth: number;
  isFocused?: boolean;
  activeShellPtyId?: number | null;
  embeddedShellFocused?: boolean;
  onShellInputSubmit?: (input: string) => void;
}

// Main component renders the border and maps the tools using ToolMessage
export const ToolGroupMessage: React.FC<ToolGroupMessageProps> = ({
  toolCalls,
  availableTerminalHeight,
  terminalWidth,
  isFocused = true,
  activeShellPtyId,
  embeddedShellFocused,
}) => {
  const isEmbeddedShellFocused =
    embeddedShellFocused &&
    toolCalls.some(
      (t) =>
        t.ptyId === activeShellPtyId && t.status === ToolCallStatus.Executing,
    );

  const hasPending = !toolCalls.every(
    (t) => t.status === ToolCallStatus.Success,
  );

  const config = useConfig();
  const isShellCommand = toolCalls.some(
    (t) => t.name === SHELL_COMMAND_NAME || t.name === SHELL_NAME,
  );
  const isSkillActivation = toolCalls.some(
    (t) =>
      t.name === ACTIVATE_SKILL_TOOL_NAME ||
      t.name === 'ActivateSkill' ||
      t.name === 'Activate Skill' ||
      t.name.startsWith('Skill: '),
  );
  const borderColor = isSkillActivation
    ? theme.text.link
    : (isShellCommand && hasPending) || isEmbeddedShellFocused
      ? theme.ui.symbol
      : hasPending
        ? theme.status.warning
        : theme.border.default;

  const borderDimColor =
    hasPending &&
    (!isShellCommand || !isEmbeddedShellFocused) &&
    !isSkillActivation;

  const staticHeight = /* border */ 2 + /* marginBottom */ 1;

  // only prompt for tool approval on the first 'confirming' tool in the list
  // note, after the CTA, this automatically moves over to the next 'confirming' tool
  const toolAwaitingApproval = useMemo(
    () => toolCalls.find((tc) => tc.status === ToolCallStatus.Confirming),
    [toolCalls],
  );

  let countToolCallsWithResults = 0;
  for (const tool of toolCalls) {
    if (tool.resultDisplay !== undefined && tool.resultDisplay !== '') {
      countToolCallsWithResults++;
    }
  }
  const countOneLineToolCalls = toolCalls.length - countToolCallsWithResults;
  const availableTerminalHeightPerToolMessage = availableTerminalHeight
    ? Math.max(
        Math.floor(
          (availableTerminalHeight - staticHeight - countOneLineToolCalls) /
            Math.max(1, countToolCallsWithResults),
        ),
        1,
      )
    : undefined;

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
    >
      {toolCalls.map((tool, index) => {
        const isConfirming = toolAwaitingApproval?.callId === tool.callId;
        const isFirst = index === 0;
        const isShellTool =
          tool.name === SHELL_COMMAND_NAME ||
          tool.name === SHELL_NAME ||
          tool.name === SHELL_TOOL_NAME;

        const commonProps = {
          ...tool,
          availableTerminalHeight: availableTerminalHeightPerToolMessage,
          terminalWidth,
          emphasis: isConfirming
            ? ('high' as const)
            : toolAwaitingApproval
              ? ('low' as const)
              : ('medium' as const),
          isFirst,
          borderColor,
          borderDimColor,
        };

        return (
          <Box
            key={tool.callId}
            flexDirection="column"
            minHeight={1}
            width={terminalWidth}
          >
            {isShellTool ? (
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
                    confirmationDetails={tool.confirmationDetails}
                    config={config}
                    isFocused={isFocused}
                    availableTerminalHeight={
                      availableTerminalHeightPerToolMessage
                    }
                    terminalWidth={terminalWidth - 4}
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
        toolCalls.length > 0 && (
          <Box
            height={0}
            width={terminalWidth}
            borderLeft={true}
            borderRight={true}
            borderTop={false}
            borderBottom={true}
            borderColor={borderColor}
            borderDimColor={borderDimColor}
            borderStyle="round"
          />
        )
      }
    </Box>
  );
};
