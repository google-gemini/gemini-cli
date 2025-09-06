/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';

interface MessageQueueIndicatorProps {
  mode: 'wait_for_idle' | 'wait_for_response';
}

export const MessageQueueIndicator: React.FC<MessageQueueIndicatorProps> = ({
  mode,
}) => (
  <Box>
    <Text color={Colors.AccentBlue}>
      queue: {mode}
      <Text color={Colors.Gray}> (Ctrl+M to toggle)</Text>
    </Text>
  </Box>
);


