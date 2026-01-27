/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useMemo } from 'react';
import { Text, Box } from 'ink';
import { theme } from '../../semantic-colors.js';
import { SCREEN_READER_USER_PREFIX } from '../../textConstants.js';
import { isSlashCommand as checkIsSlashCommand } from '../../utils/commandUtils.js';
import {
  calculateTransformationsForLine,
  calculateTransformedLine,
} from '../shared/text-buffer.js';

interface UserMessageProps {
  text: string;
  width: number;
}

export const UserMessage: React.FC<UserMessageProps> = ({ text, width }) => {
  const prefix = '> ';
  const prefixWidth = prefix.length;
  const isSlashCommand = checkIsSlashCommand(text);

  const textColor = isSlashCommand ? theme.text.accent : theme.text.secondary;

  const displayText = useMemo(() => {
    if (!text) return text;
    return text
      .split('\n')
      .map((line) => {
        const transformations = calculateTransformationsForLine(line);
        // We pass a cursor position of [-1, -1] so that no transformations are expanded (e.g. images remain collapsed)
        const { transformedLine } = calculateTransformedLine(
          line,
          0, // line index doesn't matter since cursor is [-1, -1]
          [-1, -1],
          transformations,
        );
        return transformedLine;
      })
      .join('\n');
  }, [text]);

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
      <Box flexGrow={1}>
        <Text wrap="wrap" color={textColor}>
          {displayText}
        </Text>
      </Box>
    </Box>
  );
};
