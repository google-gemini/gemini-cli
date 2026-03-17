/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useEffect, useId } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../semantic-colors.js';
import type { IndividualToolCallDisplay } from '../../types.js';
import { isSubagentProgress, checkExhaustive } from '@google/gemini-cli-core';
import {
  SubagentProgressDisplay,
  formatToolArgs,
} from './SubagentProgressDisplay.js';
import { useOverflowActions } from '../../contexts/OverflowContext.js';

export interface SubagentGroupDisplayProps {
  toolCalls: IndividualToolCallDisplay[];
  availableTerminalHeight?: number;
  terminalWidth: number;
  borderColor?: string;
  borderDimColor?: boolean;
  isFirst?: boolean;
  isExpandable?: boolean;
}

export const SubagentGroupDisplay: React.FC<SubagentGroupDisplayProps> = ({
  toolCalls,
  availableTerminalHeight,
  terminalWidth,
  borderColor,
  borderDimColor,
  isFirst,
  isExpandable = true,
}) => {
  const isExpanded = availableTerminalHeight === undefined;
  const overflowActions = useOverflowActions();
  const uniqueId = useId();

  useEffect(() => {
    if (isExpandable && overflowActions) {
      // Register with the global overflow system so "ctrl+o to expand" shows in the sticky footer
      // and AppContainer passes the shortcut through.
      overflowActions.addOverflowingId(`subagent-${uniqueId}`);
    }
    return () => {
      if (overflowActions) {
        overflowActions.removeOverflowingId(`subagent-${uniqueId}`);
      }
    };
  }, [isExpandable, overflowActions, uniqueId]);

  const validAgentCalls = toolCalls.filter((tc) =>
    isSubagentProgress(tc.resultDisplay),
  );

  if (validAgentCalls.length === 0) {
    return null;
  }

  let headerText = '';
  if (validAgentCalls.length === 1) {
    const singleAgent = validAgentCalls[0].resultDisplay;
    if (isSubagentProgress(singleAgent)) {
      if (singleAgent.state === 'completed') {
        headerText = 'Agent Completed';
      } else if (singleAgent.state === 'cancelled') {
        headerText = 'Agent Cancelled';
      } else if (singleAgent.state === 'error') {
        headerText = 'Agent Error';
      } else {
        headerText = 'Running Agent...';
      }
    } else {
      headerText = 'Running Agent...';
    }
  } else {
    let completedCount = 0;
    let runningCount = 0;
    for (const tc of validAgentCalls) {
      const progress = tc.resultDisplay;
      if (isSubagentProgress(progress)) {
        if (progress.state === 'completed') completedCount++;
        else if (progress.state === 'running') runningCount++;
      }
    }

    if (completedCount === validAgentCalls.length) {
      headerText = `${validAgentCalls.length} Agents Completed`;
    } else if (completedCount > 0) {
      headerText = `${validAgentCalls.length} Agents (${runningCount} running, ${completedCount} completed)...`;
    } else {
      headerText = `Running ${validAgentCalls.length} Agents...`;
    }
  }
  const toggleText = `(ctrl+o to ${isExpanded ? 'collapse' : 'expand'})`;

  return (
    <Box
      flexDirection="column"
      width={terminalWidth}
      borderLeft={true}
      borderRight={true}
      borderTop={isFirst}
      borderBottom={false}
      borderColor={borderColor}
      borderDimColor={borderDimColor}
      borderStyle="round"
      paddingLeft={1}
      paddingTop={isFirst ? 0 : 0}
      paddingBottom={0}
    >
      <Box flexDirection="row" gap={1} marginBottom={isExpanded ? 1 : 0}>
        <Text color={theme.text.secondary}>≡</Text>
        <Text bold color={theme.text.primary}>
          {headerText}
        </Text>
        {isExpandable && <Text color={theme.text.secondary}>{toggleText}</Text>}
      </Box>

      {validAgentCalls.map((toolCall) => {
        const progress = toolCall.resultDisplay;
        if (!isSubagentProgress(progress)) return null;

        const lastActivity =
          progress.recentActivity[progress.recentActivity.length - 1];

        // Collapsed View: Show single compact line per agent
        if (!isExpanded) {
          let content = 'Starting...';
          let formattedArgs: string | undefined;

          if (progress.state === 'completed') {
            if (
              progress.terminateReason &&
              progress.terminateReason !== 'GOAL'
            ) {
              content = `Finished Early (${progress.terminateReason})`;
            } else {
              content = 'Completed successfully';
            }
          } else if (lastActivity) {
            // Match expanded view logic exactly:
            // Primary text: displayName || content
            if (
              'displayName' in lastActivity &&
              typeof lastActivity.displayName === 'string'
            ) {
              content = lastActivity.displayName;
            } else if (
              'content' in lastActivity &&
              typeof lastActivity.content === 'string'
            ) {
              content = lastActivity.content;
            }

            // Secondary text: description || formatToolArgs(args)
            if (
              'description' in lastActivity &&
              typeof lastActivity.description === 'string'
            ) {
              formattedArgs = lastActivity.description;
            } else if (lastActivity.type === 'tool_call' && lastActivity.args) {
              formattedArgs = formatToolArgs(lastActivity.args);
            }
          }

          const displayArgs =
            progress.state === 'completed' ? '' : formattedArgs;

          const renderStatusIcon = () => {
            const state = progress.state ?? 'running';
            switch (state) {
              case 'running':
                return <Text color={theme.text.primary}>!</Text>;
              case 'completed':
                return <Text color={theme.status.success}>✓</Text>;
              case 'cancelled':
                return <Text color={theme.status.warning}>ℹ</Text>;
              case 'error':
                return <Text color={theme.status.error}>✗</Text>;
              default:
                return checkExhaustive(state);
            }
          };

          return (
            <Box
              key={toolCall.callId}
              flexDirection="row"
              marginLeft={0}
              marginTop={0}
            >
              <Box minWidth={2} flexShrink={0}>
                {renderStatusIcon()}
              </Box>
              <Box flexShrink={0}>
                <Text bold color={theme.text.primary} wrap="truncate">
                  {progress.agentName}
                </Text>
              </Box>
              <Box flexShrink={0}>
                <Text color={theme.text.secondary}> · </Text>
              </Box>
              <Box flexShrink={1} minWidth={0}>
                <Text color={theme.text.secondary} wrap="truncate">
                  {lastActivity?.type === 'thought' ? '💭' : ''}
                  {content}
                  {displayArgs && ` ${displayArgs}`}
                </Text>
              </Box>
            </Box>
          );
        }

        // Expanded View: Render full history
        return (
          <Box
            key={toolCall.callId}
            flexDirection="column"
            marginLeft={0}
            marginBottom={1}
          >
            <SubagentProgressDisplay
              progress={progress}
              terminalWidth={terminalWidth}
            />
          </Box>
        );
      })}
    </Box>
  );
};
