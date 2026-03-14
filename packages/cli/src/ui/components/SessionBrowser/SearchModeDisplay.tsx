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
 * Search input display component.
 */
export const SearchModeDisplay = ({
  state,
}: {
  state: SessionBrowserState;
}): React.JSX.Element => (
  <Box marginTop={1}>
    <Text color={Colors.Gray}>Search: </Text>
    <Text color={Colors.AccentPurple}>{state.searchQuery}</Text>
    <Text color={Colors.Gray}> (Esc to cancel)</Text>
  </Box>
);
