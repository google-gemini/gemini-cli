/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../semantic-colors.js';
import Spinner from 'ink-spinner';
import type {
  SubagentProgress,
  SubagentActivityItem,
} from '@google/gemini-cli-core';
import { TOOL_STATUS } from '../../constants.js';
import { STATUS_INDICATOR_WIDTH } from './ToolShared.js';

export interface SubagentProgressDisplayProps {
  progress: SubagentProgress;
}

const formatToolArgs = (args?: string): string => {
  if (!args) return '';
  try {
    const parsed = JSON.parse(args);
    if (typeof parsed.description === 'string' && parsed.description) {
      return parsed.description;
    }
    if (typeof parsed.command === 'string') return parsed.command;
    if (typeof parsed.file_path === 'string') return parsed.file_path;
    if (typeof parsed.dir_path === 'string') return parsed.dir_path;
    if (typeof parsed.query === 'string') return parsed.query;
    if (typeof parsed.url === 'string') return parsed.url;
    if (typeof parsed.target === 'string') return parsed.target;

    return args;
  } catch {
    return args;
  }
};

export const SubagentProgressDisplay: React.FC<
  SubagentProgressDisplayProps
> = ({ progress }) => {
  let headerText = `Subagent ${progress.agentName} is working...`;
  let headerColor = theme.text.secondary;

  if (progress.state === 'cancelled') {
    headerText = `Subagent ${progress.agentName} was cancelled.`;
    headerColor = theme.status.warning;
  } else if (progress.state === 'error') {
    headerText = `Subagent ${progress.agentName} failed.`;
    headerColor = theme.status.error;
  } else if (progress.state === 'completed') {
    headerText = `Subagent ${progress.agentName} completed.`;
    headerColor = theme.status.success;
  }

  return (
    <Box flexDirection="column" paddingY={0}>
      <Box marginBottom={1}>
        <Text color={headerColor} italic>
          {headerText}
        </Text>
      </Box>
      <Box flexDirection="column" marginLeft={0} gap={0}>
        {progress.recentActivity.map(
          (item: SubagentActivityItem, index: number) => {
            if (item.type === 'thought') {
              return (
                <Box key={index} flexDirection="row">
                  <Box minWidth={STATUS_INDICATOR_WIDTH}>
                    <Text color={theme.text.secondary}>💭</Text>
                  </Box>
                  <Box flexGrow={1}>
                    <Text color={theme.text.secondary}>{item.content}</Text>
                  </Box>
                </Box>
              );
            } else if (item.type === 'tool_call') {
              const statusSymbol =
                item.status === 'running' ? (
                  <Spinner type="dots" />
                ) : item.status === 'completed' ? (
                  <Text color={theme.status.success}>
                    {TOOL_STATUS.SUCCESS}
                  </Text>
                ) : (
                  <Text color={theme.status.error}>{TOOL_STATUS.ERROR}</Text>
                );

              const formattedArgs = formatToolArgs(item.args);
              const displayArgs =
                formattedArgs.length > 60
                  ? formattedArgs.slice(0, 60) + '...'
                  : formattedArgs;

              return (
                <Box key={index} flexDirection="row">
                  <Box minWidth={STATUS_INDICATOR_WIDTH}>{statusSymbol}</Box>
                  <Box flexDirection="row" flexGrow={1} flexWrap="wrap">
                    <Text bold color={theme.text.primary}>
                      {item.content}
                    </Text>
                    {displayArgs && (
                      <Box marginLeft={1}>
                        <Text color={theme.text.secondary} wrap="truncate">
                          {displayArgs}
                        </Text>
                      </Box>
                    )}
                  </Box>
                </Box>
              );
            }
            return null;
          },
        )}
      </Box>
    </Box>
  );
};
