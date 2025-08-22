/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text, Box } from 'ink';
import { Colors } from '../../colors.js';
import { SCREEN_READER_USER_PREFIX } from '../../constants.js';

interface UserMessageProps {
  text: string;
}

export const UserMessage: React.FC<UserMessageProps> = ({ text }) => {
  const prefix = '> ';
  const prefixWidth = prefix.length;
  const isSlashCommand = text.startsWith('/');

  const textColor = isSlashCommand ? Colors.AccentPurple : Colors.Gray;
  const borderColor = isSlashCommand ? Colors.AccentPurple : Colors.Gray;

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
        <Text color={textColor} aria-label={SCREEN_READER_USER_PREFIX}>
          {prefix}
        </Text>
      </Box>
      <Box flexGrow={1}>
        <Text wrap="wrap" color={textColor}>
          {text}
        </Text>
      </Box>
    </Box>
  );
};
