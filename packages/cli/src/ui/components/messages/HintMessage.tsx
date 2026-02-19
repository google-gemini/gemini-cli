/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Text, Box } from 'ink';
import { theme } from '../../semantic-colors.js';
import { SCREEN_READER_USER_PREFIX } from '../../textConstants.js';
import { HalfLinePaddedBox } from '../shared/HalfLinePaddedBox.js';
import { useConfig } from '../../contexts/ConfigContext.js';

interface HintMessageProps {
  text: string;
}

export const HintMessage: React.FC<HintMessageProps> = ({ text }) => {
  const prefix = '💡 ';
  const prefixWidth = prefix.length;
  const config = useConfig();
  const useBackgroundColor = config.getUseBackgroundColor();

  return (
    <HalfLinePaddedBox
      backgroundBaseColor={theme.text.accent}
      backgroundOpacity={0.1}
      useBackgroundColor={useBackgroundColor}
    >
      <Box
        flexDirection="row"
        paddingY={0}
        marginY={useBackgroundColor ? 0 : 1}
        paddingX={useBackgroundColor ? 1 : 0}
        alignSelf="flex-start"
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
          <Text wrap="wrap" italic color={theme.text.accent}>
            {`Steering Hint: ${text}`}
          </Text>
        </Box>
      </Box>
    </HalfLinePaddedBox>
  );
};
