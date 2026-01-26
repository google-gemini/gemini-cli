/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../semantic-colors.js';
import { HalfLinePaddedBox } from '../shared/HalfLinePaddedBox.js';
import { DEFAULT_BACKGROUND_OPACITY } from '../../constants.js';
import { useConfig } from '../../contexts/ConfigContext.js';

interface UserShellMessageProps {
  text: string;
  width: number;
}

export const UserShellMessage: React.FC<UserShellMessageProps> = ({
  text,
  width,
}) => {
  const config = useConfig();
  const useBackgroundColor = config.getUseBackgroundColor();

  // Remove leading '!' if present, as App.tsx adds it for the processor.
  const commandToDisplay = text.startsWith('!') ? text.substring(1) : text;

  return (
    <HalfLinePaddedBox
      backgroundBaseColor={theme.border.default}
      backgroundOpacity={DEFAULT_BACKGROUND_OPACITY}
      useBackgroundColor={useBackgroundColor}
    >
      <Box
        paddingY={0}
        marginY={useBackgroundColor ? 0 : 1}
        paddingX={useBackgroundColor ? 1 : 0}
        width={width}
      >
        <Text color={theme.ui.symbol}>$ </Text>
        <Text color={theme.text.primary}>{commandToDisplay}</Text>
      </Box>
    </HalfLinePaddedBox>
  );
};
