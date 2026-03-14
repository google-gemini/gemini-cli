/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../../colors.js';
import type { SessionBrowserState } from '../SessionBrowser.js';
import { SessionItem } from './SessionItem.js';
import { SessionTableHeader } from './SessionTableHeader.js';
import { NavigationHelp } from './NavigationHelp.js';

/**
 * Session list container component.
 */
export const SessionList = ({
  state,
  formatRelativeTime,
}: {
  state: SessionBrowserState;
  formatRelativeTime: (dateString: string, style: 'short' | 'long') => string;
}): React.JSX.Element => (
  <Box flexDirection="column">
    {/* Table Header */}
    <Box flexDirection="column">
      {!state.isSearchMode && <NavigationHelp />}
      <SessionTableHeader state={state} />
    </Box>

    {state.visibleSessions.map((session) => (
      <SessionItem
        key={session.id}
        session={session}
        state={state}
        terminalWidth={state.terminalWidth}
        formatRelativeTime={formatRelativeTime}
      />
    ))}

    <Text color={Colors.Gray}>
      {state.endIndex < state.totalSessions ? <>▼</> : <Text dimColor>▼</Text>}
    </Text>
  </Box>
);
