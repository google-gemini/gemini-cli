/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../../colors.js';

interface ThinkingMessageProps {
  subject: string;
  description: string;
}

export const ThinkingMessage: React.FC<ThinkingMessageProps> = ({
  subject,
  description,
}) => (
  <Box flexDirection="column" marginBottom={1}>
    <Box>
      <Text color={Colors.AccentPurple} bold>
        💭 Thinking: {subject}
      </Text>
    </Box>
    {description && (
      <Box marginLeft={2}>
        <Text color={Colors.Gray}>{description}</Text>
      </Box>
    )}
  </Box>
);