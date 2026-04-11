/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../../colors.js';

/**
 * Empty state component displayed when no sessions are found.
 */
export const SessionBrowserEmpty = (): React.JSX.Element => (
  <Box flexDirection="column" paddingX={1}>
    <Text color={Colors.Gray}>No auto-saved conversations found.</Text>
    <Text color={Colors.Gray}>Press q to exit</Text>
  </Box>
);
