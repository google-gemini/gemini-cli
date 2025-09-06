/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { theme as semanticTheme } from '../semantic-colors.js';

interface UpdateNotificationProps {
  message: string;
}

export const UpdateNotification = ({ message }: UpdateNotificationProps) => (
  <Box
    borderStyle="round"
    borderColor={semanticTheme.status.warning}
    paddingX={1}
    marginY={1}
  >
    <Text color={semanticTheme.status.warning}>{message}</Text>
  </Box>
);
