/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text, Box } from 'ink';
import { Colors } from '../../colors.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';

interface UserMessageProps {
  text: string;
}

export const UserMessage: React.FC<UserMessageProps> = ({ text }) => {
  const { columns: terminalWidth } = useTerminalSize();
  const prefix = '>';

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.Gray}
      flexDirection="row"
      paddingX={1}
      paddingY={0}
      marginY={1}
      alignSelf="flex-start"
      width={terminalWidth}
    >
      <Box flexGrow={0} flexShrink={0} flexBasis="auto" paddingRight={2}>
        <Text color={Colors.Gray}>{prefix}</Text>
      </Box>
      <Box flexGrow={1} flexShrink={1} flexBasis="auto">
        <Text wrap="wrap" color={Colors.Gray}>
          {text}
        </Text>
      </Box>
    </Box>
  );
};
