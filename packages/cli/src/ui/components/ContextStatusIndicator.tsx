/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';
import { useFileContext } from '../contexts/FileContextContext.js';
import { ContextManagementCommands } from './ContextManagementCommands.js';

interface ContextStatusIndicatorProps {
  isFocused?: boolean;
  onShowContextManager?: () => void;
}

/**
 * Format token count in human-readable format
 */
function formatTokenCount(tokens: number): string {
  if (tokens < 1000) return `${tokens}`;
  if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}K`;
  return `${(tokens / 1000000).toFixed(1)}M`;
}

export function ContextStatusIndicator({
  isFocused = false,
  onShowContextManager,
}: ContextStatusIndicatorProps) {
  const { state, actions } = useFileContext();
  const [showContextManager, setShowContextManager] = useState(false);
  const [contextCommand, setContextCommand] = useState<string>('');
  const [contextArgs, setContextArgs] = useState<string[]>([]);

  const status = actions.getContextStatus();

  useInput((input, key) => {
    if (!isFocused) return;

    // Handle context management commands
    if (input.startsWith('@')) {
      const parts = input.substring(1).split(' ');
      const command = parts[0];
      const args = parts.slice(1);

      if (
        [
          'list',
          'show',
          'status',
          'remove',
          'clear',
          'clear-all',
          'help',
        ].includes(command)
      ) {
        setContextCommand(command);
        setContextArgs(args);
        setShowContextManager(true);
        return;
      }
    }

    // Handle Enter key to show context manager
    if (key.return && onShowContextManager) {
      onShowContextManager();
    }
  });

  if (showContextManager) {
    return (
      <Box flexDirection="column">
        <ContextManagementCommands
          command={contextCommand}
          args={contextArgs}
        />
        <Box marginTop={1}>
          <Text color={Colors.Gray}>Press any key to continue...</Text>
        </Box>
      </Box>
    );
  }

  // Don't show indicator if no files in context
  if (state.totalFiles === 0) {
    return null;
  }

  const getStatusColor = () => {
    if (status.percentage > 80) return Colors.AccentRed;
    if (status.percentage > 60) return Colors.AccentYellow;
    return Colors.AccentGreen;
  };

  return (
    <Box flexDirection="row" alignItems="center">
      <Text color={Colors.AccentBlue}>📁</Text>
      <Text color={getStatusColor()}>
        {' '}
        Context: {state.totalFiles} files, {formatTokenCount(status.tokens)}{' '}
        tokens ({status.percentage}%)
      </Text>
      {isFocused && <Text color={Colors.Gray}> (Press Enter to manage)</Text>}
    </Box>
  );
}
