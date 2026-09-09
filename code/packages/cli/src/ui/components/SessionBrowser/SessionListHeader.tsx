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
 * Header component showing session count and sort information.
 */
export const SessionListHeader = ({
  state,
}: {
  state: SessionBrowserState;
}): React.JSX.Element => (
  <Box flexDirection="row" justifyContent="space-between">
    <Text color={Colors.AccentPurple}>
      Chat Sessions ({state.totalSessions} total
      {state.searchQuery ? `, filtered` : ''})
    </Text>
    <Text color={Colors.Gray}>
      sorted by {state.sortOrder} {state.sortReverse ? 'asc' : 'desc'}
    </Text>
  </Box>
);
