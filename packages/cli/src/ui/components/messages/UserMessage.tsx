/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text, Box } from 'ink';
import { theme } from '../../semantic-colors.js';

interface UserMessageProps {
  text: string;
}

export const UserMessage: React.FC<UserMessageProps> = ({ text }) => {
  const prefix = '> ';
  const prefixWidth = prefix.length;
  const isSlashCommand = text.startsWith('/');

  const textColor = isSlashCommand ? theme.text.accent : theme.text.secondary;
  const borderColor = isSlashCommand ? theme.text.accent : theme.border.default;

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
        <Text wrap="wrap" color={textColor}>
          {text}
        </Text>
      </Box>
    </Box>
  );
};
