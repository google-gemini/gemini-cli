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
import { HalfLinePaddedBox } from '../shared/HalfLinePaddedBox.js';
import { DEFAULT_BACKGROUND_OPACITY } from '../../constants.js';
import { useConfig } from '../../contexts/ConfigContext.js';

interface UserMessageProps {
  text: string;
  width: number;
}

export const UserMessage: React.FC<UserMessageProps> = ({ text, width }) => {
  const prefix = '> ';
  const prefixWidth = prefix.length;
  const isSlashCommand = checkIsSlashCommand(text);
  const config = useConfig();
  const useBackgroundColor = config.getUseBackgroundColor();

  const textColor = isSlashCommand ? theme.text.accent : theme.text.secondary;

  return (
    <HalfLinePaddedBox
      backgroundBaseColor={theme.border.default}
      backgroundOpacity={DEFAULT_BACKGROUND_OPACITY}
      useBackgroundColor={useBackgroundColor}
    >
      <Box
        flexDirection="row"
        paddingY={0}
        marginY={useBackgroundColor ? 0 : 1}
        paddingX={useBackgroundColor ? 1 : 0}
        alignSelf="flex-start"
        width={width}
      >
        <Box width={prefixWidth} flexShrink={0}>
          <Text
            color={theme.text.accent}
            aria-label={SCREEN_READER_USER_PREFIX}
          >
            {prefix}
          </Text>
        </Box>
        <Box flexGrow={1}>
          <Text wrap="wrap" color={textColor}>
            {text}
          </Text>
        </Box>
      </Box>
    </HalfLinePaddedBox>
  );
};
