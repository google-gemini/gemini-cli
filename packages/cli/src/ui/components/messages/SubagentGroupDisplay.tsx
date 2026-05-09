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
import {
  isSubagentProgress,
  checkExhaustive,
  type SubagentActivityItem,
} from '@google/gemini-cli-core';
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
  const overflowId = `subagent-${uniqueId}`;

  useEffect(() => {
    if (isExpandable && overflowActions) {
      // Register with the global overflow system so "ctrl+o to expand" shows in the sticky footer
      // and AppContainer passes the shortcut through.
      overflowActions.addOverflowingId(overflowId);
    }
    return () => {
      if (overflowActions) {
        overflowActions.removeOverflowingId(overflowId);
      }
    };
  }, [isExpandable, overflowActions, overflowId]);

  if (toolCalls.length === 0) {
    return null;
  }

  let headerText = '';
  if (toolCalls.length === 1) {
    const singleAgent = toolCalls[0].resultDisplay;
    if (isSubagentProgress(singleAgent)) {
      switch (singleAgent.state) {
        case 'completed':
          headerText = 'Agent Completed';
          break;
        case 'cancelled':
          headerText = 'Agent Cancelled';
          break;
        case 'error':
          headerText = 'Agent Error';
          break;
        default:
          headerText = 'Running Agent...';
          break;
      }
    } else {
      headerText = 'Running Agent...';
    }
  } else {
    let completedCount = 0;
    let runningCount = 0;
    for (const tc of toolCalls) {
      const progress = tc.resultDisplay;
      if (isSubagentProgress(progress)) {
        if (progress.state === 'completed') completedCount++;
        else if (progress.state === 'running') runningCount++;
      } else {
        // It hasn't emitted progress yet, but it is "running"
        runningCount++;
      }
    }

    if (completedCount === toolCalls.length) {
      headerText = `${toolCalls.length} Agents Completed`;
    } else if (completedCount > 0) {
      headerText = `${toolCalls.length} Agents (${runningCount} running, ${completedCount} completed)...`;
    } else {
      headerText = `Running ${toolCalls.length} Agents...`;
    }
  }
  const toggleText = `(ctrl+o to ${isExpanded ? 'collapse' : 'expand'})`;

  const renderCollapsedRow = (
    key: string,
    agentName: string,
    icon: React.ReactNode,
    content: string,
    displayArgs?: string,
  ) => (
    <Box key={key} flexDirection="row" marginLeft={0} marginTop={0}>
      <Box minWidth={2} flexShrink={0}>
        {icon}
      </Box>
      <Box flexShrink={0}>
        <Text bold color={theme.text.primary} wrap="truncate">
          {agentName}
        </Text>
      </Box>
      <Box flexShrink={0}>
        <Text color={theme.text.secondary}> · </Text>
      </Box>
      <Box flexShrink={1} minWidth={0}>
        <Text color={theme.text.secondary} wrap="truncate">
          {content}
          {displayArgs && ` ${displayArgs}`}
        </Text>
      </Box>
    </Box>
  );

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
      paddingTop={0}
      paddingBottom={0}
    >
      <Box flexDirection="row" gap={1} marginBottom={isExpanded ? 1 : 0}>
        <Text color={theme.text.secondary}>≡</Text>
        <Text bold color={theme.text.primary}>
          {headerText}
        </Text>
        {isExpandable && <Text color={theme.text.secondary}>{toggleText}</Text>}
      </Box>

      {toolCalls.map((toolCall) => {
        const progress = toolCall.resultDisplay;

        if (!isSubagentProgress(progress)) {
          const agentName = toolCall.name || 'agent';
          if (!isExpanded) {
            return renderCollapsedRow(
              toolCall.callId,
              agentName,
              <Text color={theme.text.primary}>!</Text>,
              'Starting...',
            );
          } else {
            return (
              <Box
                key={toolCall.callId}
                flexDirection="column"
                marginLeft={0}
                marginBottom={1}
              >
                <Box flexDirection="row" gap={1}>
                  <Text color={theme.text.primary}>!</Text>
                  <Text bold color={theme.text.primary}>
                    {agentName}
                  </Text>
                </Box>
                <Box marginLeft={2}>
                  <Text color={theme.text.secondary}>Starting...</Text>
                </Box>
              </Box>
            );
          }
        }

        const history = toolCall.subagentHistory ?? progress.recentActivity;
        const lastActivity: SubagentActivityItem | undefined =
          history[history.length - 1];

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
            content = lastActivity.displayName || lastActivity.content;

            // Secondary text: description || formatToolArgs(args)
            if (lastActivity.description) {
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

          return renderCollapsedRow(
            toolCall.callId,
            progress.agentName,
            renderStatusIcon(),
            lastActivity?.type === 'thought' ? `💭 ${content}` : content,
            displayArgs,
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
              historyOverrides={toolCall.subagentHistory}
            />
          </Box>
        );
      })}
    </Box>
  );
};
