/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { useFileContext } from '../contexts/FileContextContext.js';
import { ContextHelp } from './ContextHelp.js';

interface ContextManagementCommandsProps {
  command: string;
  args?: string[];
}

/**
 * Format file size in human-readable format
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Format token count in human-readable format
 */
function formatTokenCount(tokens: number): string {
  if (tokens < 1000) return `${tokens}`;
  if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}K`;
  return `${(tokens / 1000000).toFixed(1)}M`;
}

export function ContextManagementCommands({
  command,
  args = [],
}: ContextManagementCommandsProps) {
  const { state, actions } = useFileContext();

  const renderCommandResult = () => {
    switch (command) {
      case 'help':
        return <ContextHelp />;
      case 'list':
      case 'show':
        return renderContextList();
      case 'status':
        return renderContextStatus();
      case 'remove':
        return renderRemoveResult();
      case 'clear':
      case 'clear-all':
        return renderClearResult();
      default:
        return (
          <Text color={Colors.AccentRed}>Unknown command: @{command}</Text>
        );
    }
  };

  const renderContextList = () => {
    const files = Array.from(state.files.values());

    if (files.length === 0) {
      return (
        <Box flexDirection="column">
          <Text color={Colors.AccentYellow}>📋 No files in context</Text>
        </Box>
      );
    }

    return (
      <Box flexDirection="column">
        <Text color={Colors.AccentBlue} bold>
          📋 Current Context ({files.length} files,{' '}
          {formatTokenCount(state.totalTokens)} tokens):
        </Text>
        {files.map((fileInfo, index) => (
          <Box key={fileInfo.filepath} marginLeft={2}>
            <Text color={Colors.Gray}>
              {index + 1}. {fileInfo.filepath}
            </Text>
            <Text color={Colors.Gray}>
              {' '}
              ({formatFileSize(fileInfo.size)}, ~
              {formatTokenCount(fileInfo.estimatedTokens)} tokens)
            </Text>
          </Box>
        ))}
        <Box marginTop={1}>
          <Text color={Colors.AccentBlue}>
            Total: {actions.getContextStatus().percentage}% of context window
            used
          </Text>
        </Box>
      </Box>
    );
  };

  const renderContextStatus = () => {
    const status = actions.getContextStatus();

    return (
      <Box flexDirection="column">
        <Text color={Colors.AccentBlue} bold>
          📊 Context Status:
        </Text>
        <Box marginLeft={2} flexDirection="column">
          <Text color={Colors.Gray}>Files: {status.files}/∞</Text>
          <Text color={Colors.Gray}>
            Tokens: {formatTokenCount(status.tokens)}/1M ({status.percentage}%)
          </Text>
          <Text color={Colors.Gray}>
            Remaining: {formatTokenCount(1_048_576 - status.tokens)} tokens
            available
          </Text>
        </Box>
      </Box>
    );
  };

  const renderRemoveResult = () => {
    const filename = args[0];
    if (!filename) {
      return (
        <Text color={Colors.AccentRed}>
          Error: Please specify a filename to remove (e.g., @remove
          filename.txt)
        </Text>
      );
    }

    const wasRemoved = actions.removeFile(filename);
    if (wasRemoved) {
      return (
        <Text color={Colors.AccentGreen}>
          ✓ Removed &apos;{filename}&apos; from context
        </Text>
      );
    } else {
      return (
        <Text color={Colors.AccentYellow}>
          File &apos;{filename}&apos; was not in context
        </Text>
      );
    }
  };

  const renderClearResult = () => {
    actions.clearContext();
    return (
      <Text color={Colors.AccentGreen}>✓ Cleared all files from context</Text>
    );
  };

  return (
    <Box flexDirection="column" paddingX={1}>
      {renderCommandResult()}
    </Box>
  );
}
