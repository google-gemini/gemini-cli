/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { Colors } from '../colors.js';

interface UpdateNotificationProps {
  message: string;
}

export const UpdateNotification = ({ message }: UpdateNotificationProps) => (
  <Box
    borderStyle="round"
    borderColor={Colors.AccentYellow}
    paddingX={1}
    marginY={1}
  >
    <Text color={Colors.AccentYellow}>
      <Spinner type="dots" /> {message}
    </Text>
  </Box>
);
