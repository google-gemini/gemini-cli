/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { Colors } from '../colors.js';

interface PendingMessagesDisplayProps {
  messages: string[];
}

export const PendingMessagesDisplay = ({
  messages,
}: PendingMessagesDisplayProps) => {
  if (messages.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      {messages.map((msg, index) => (
        <Box key={index} paddingLeft={2}>
          <Text color={Colors.AccentYellow} italic>
            (sending){' '}
          </Text>
          <Text color={Colors.Gray} italic>
            {msg}
          </Text>
        </Box>
      ))}
    </Box>
  );
};
