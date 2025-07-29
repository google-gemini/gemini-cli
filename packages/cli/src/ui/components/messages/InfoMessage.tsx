/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text, Box } from 'ink';
import { Colors } from '../../colors.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';

interface InfoMessageProps {
  text: string;
}

export const InfoMessage: React.FC<InfoMessageProps> = ({ text }) => {
  const { columns: terminalWidth } = useTerminalSize();
  const prefix = 'ℹ ';

  return (
    <Box flexDirection="row" marginTop={1} width={terminalWidth}>
      <Box flexGrow={0} flexShrink={0} flexBasis="auto" paddingRight={2}>
        <Text color={Colors.AccentYellow}>{prefix}</Text>
      </Box>
      <Box flexGrow={1} flexShrink={1} flexBasis="auto">
        <Text wrap="wrap" color={Colors.AccentYellow}>
          {text}
        </Text>
      </Box>
    </Box>
  );
};
