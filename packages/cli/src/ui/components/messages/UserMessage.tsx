/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Text, Box } from 'ink';
import { theme as semanticTheme } from '../../semantic-colors.js';
import { SCREEN_READER_USER_PREFIX } from '../../textConstants.js';
import { isSlashCommand as checkIsSlashCommand } from '../../utils/commandUtils.js';

interface UserMessageProps {
  text: string;
}

export const UserMessage: React.FC<UserMessageProps> = ({ text }) => {
  const prefix = '> ';
  const prefixWidth = prefix.length;
  const isSlashCommand = checkIsSlashCommand(text);

  const textColor = isSlashCommand
    ? semanticTheme.text.accent
    : semanticTheme.text.secondary;
  const borderColor = isSlashCommand
    ? semanticTheme.text.accent
    : semanticTheme.border.default;

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
