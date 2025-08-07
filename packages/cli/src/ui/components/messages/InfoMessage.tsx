/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text, Box } from 'ink';
import { Colors } from '../../colors.js';

interface InfoMessageProps {
  text: string;
  isInterrupt?: boolean;
}

export const InfoMessage: React.FC<InfoMessageProps> = ({
  text,
  isInterrupt = false,
}) => {
  const prefix = 'ℹ ';
  const prefixWidth = prefix.length;
  const color = isInterrupt ? Colors.AccentRed : Colors.AccentYellow;

  return (
    <Box flexDirection="row" marginTop={1}>
      <Box width={prefixWidth}>
        <Text color={color}>{prefix}</Text>
      </Box>
      <Box flexGrow={1}>
        <Text wrap="wrap" color={color}>
          {text}
        </Text>
      </Box>
    </Box>
  );
};
