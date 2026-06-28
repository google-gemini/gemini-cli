/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../../colors.js';
import type { SessionBrowserState } from '../SessionBrowser.js';

/**
 * Error state component displayed when session loading fails.
 */
export const SessionBrowserError = ({
  state,
}: {
  state: SessionBrowserState;
}): React.JSX.Element => (
  <Box flexDirection="column" paddingX={1}>
    <Text color={Colors.AccentRed}>Error: {state.error}</Text>
    <Text color={Colors.Gray}>Press q to exit</Text>
  </Box>
);
