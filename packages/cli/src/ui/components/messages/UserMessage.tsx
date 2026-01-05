/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Text, Box } from 'ink';
import { theme } from '../../semantic-colors.js';
import { SCREEN_READER_USER_PREFIX } from '../../textConstants.js';
import { isSlashCommand as checkIsSlashCommand } from '../../utils/commandUtils.js';

interface UserMessageProps {
  text: string;
  width: number;
}

export const UserMessage: React.FC<UserMessageProps> = ({ text, width }) => {
  const prefix = '> ';
  const prefixWidth = prefix.length;
  const isSlashCommand = checkIsSlashCommand(text);

  const lines = text.split('\n');
  const MAX_DISPLAY_LINES = 15;
  const isTruncated = lines.length > MAX_DISPLAY_LINES;
  const displayText = isTruncated
    ? lines.slice(0, MAX_DISPLAY_LINES).join('\n')
    : text;

  const textColor = isSlashCommand ? theme.text.accent : theme.text.secondary;

  return (
    <Box
      flexDirection="row"
      paddingY={0}
      marginY={1}
      alignSelf="flex-start"
      width={width}
    >
      <Box width={prefixWidth} flexShrink={0}>
        <Text color={theme.text.accent} aria-label={SCREEN_READER_USER_PREFIX}>
          {prefix}
        </Text>
      </Box>
      <Box flexGrow={1} flexDirection="column">
        <Text wrap="wrap" color={textColor}>
          {displayText}
        </Text>
        {isTruncated && (
          <Text color={theme.text.secondary} dimColor>
            {`... (${lines.length - MAX_DISPLAY_LINES} more lines)`}
          </Text>
        )}
      </Box>
    </Box>
  );
};
