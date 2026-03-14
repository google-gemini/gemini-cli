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
 * Table header component with column labels and scroll indicators.
 */
export const SessionTableHeader = ({
  state,
}: {
  state: SessionBrowserState;
}): React.JSX.Element => (
  <Box flexDirection="row" marginTop={1}>
    <Text>{state.scrollOffset > 0 ? <Text>▲ </Text> : '  '}</Text>

    <Box width={5} flexShrink={0}>
      <Text color={Colors.Gray} bold>
        Index
      </Text>
    </Box>
    <Text color={Colors.Gray}> │ </Text>
    <Box width={4} flexShrink={0}>
      <Text color={Colors.Gray} bold>
        Msgs
      </Text>
    </Box>
    <Text color={Colors.Gray}> │ </Text>
    <Box width={4} flexShrink={0}>
      <Text color={Colors.Gray} bold>
        Age
      </Text>
    </Box>
    <Text color={Colors.Gray}> │ </Text>
    <Box flexShrink={0}>
      <Text color={Colors.Gray} bold>
        {state.searchQuery ? 'Match' : 'Name'}
      </Text>
    </Box>
  </Box>
);
