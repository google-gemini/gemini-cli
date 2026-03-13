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
 * No results display component for empty search results.
 */
export const NoResultsDisplay = ({
  state,
}: {
  state: SessionBrowserState;
}): React.JSX.Element => (
  <Box marginTop={1}>
    <Text color={Colors.Gray} dimColor>
      No sessions found matching &apos;{state.searchQuery}&apos;.
    </Text>
  </Box>
);
