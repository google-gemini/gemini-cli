/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text, Box } from 'ink';
import { Colors } from '../../colors.js';

interface UserMessageProps {
  text: string;
  isInterrupt?: boolean;
}

export const UserMessage: React.FC<UserMessageProps> = ({
  text,
  isInterrupt = false,
}) => {
  const prefix = '> ';
  const prefixWidth = prefix.length;
  const isSlashCommand = text.startsWith('/');

  const textColor = isSlashCommand
    ? Colors.AccentPurple
    : isInterrupt
      ? Colors.AccentYellow
      : Colors.Gray;
  const borderColor = isSlashCommand
    ? Colors.AccentPurple
    : isInterrupt
      ? Colors.AccentYellow
      : Colors.Gray;

  return (
    <Box
      borderStyle="round"
      borderColor={borderColor}
      flexDirection="row"
      paddingX={2}
      paddingY={0}
      marginY={1}
      alignSelf="flex-start"
    >
      <Box width={prefixWidth}>
        <Text color={textColor}>{prefix}</Text>
      </Box>
      <Box flexGrow={1}>
        <Text wrap="wrap" color={textColor} bold={isInterrupt}>
          {text}
        </Text>
      </Box>
    </Box>
  );
};
