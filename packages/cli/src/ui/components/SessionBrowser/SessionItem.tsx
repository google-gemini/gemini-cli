/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../../colors.js';
import { theme } from '../../semantic-colors.js';
import type { SessionBrowserState } from '../SessionBrowser.js';
import type { SessionInfo } from '../../../utils/sessionUtils.js';
import { MatchSnippetDisplay } from './MatchSnippetDisplay.js';

const FIXED_SESSION_COLUMNS_WIDTH = 30;

/**
 * Individual session row component.
 */
export const SessionItem = ({
  session,
  state,
  terminalWidth,
  formatRelativeTime,
}: {
  session: SessionInfo;
  state: SessionBrowserState;
  terminalWidth: number;
  formatRelativeTime: (dateString: string, style: 'short' | 'long') => string;
}): React.JSX.Element => {
  const originalIndex =
    state.startIndex + state.visibleSessions.indexOf(session);
  const isActive = originalIndex === state.activeIndex;
  const isDisabled = session.isCurrentSession;
  const textColor = (c: string = Colors.Foreground) => {
    if (isDisabled) {
      return Colors.Gray;
    }
    return isActive ? theme.ui.focus : c;
  };

  const prefix = isActive ? '❯ ' : '  ';
  let additionalInfo = '';
  let matchDisplay = null;

  // Add "(current)" label for the current session
  if (session.isCurrentSession) {
    additionalInfo = ' (current)';
  }

  // Show match snippets if searching and matches exist
  if (
    state.searchQuery &&
    session.matchSnippets &&
    session.matchSnippets.length > 0
  ) {
    matchDisplay = (
      <MatchSnippetDisplay session={session} textColor={textColor} />
    );

    if (session.matchCount && session.matchCount > 1) {
      additionalInfo += ` (+${session.matchCount - 1} more)`;
    }
  }

  // Reserve a few characters for metadata like " (current)" so the name doesn't wrap awkwardly.
  const reservedForMeta = additionalInfo ? additionalInfo.length + 1 : 0;
  const availableMessageWidth = Math.max(
    20,
    terminalWidth - FIXED_SESSION_COLUMNS_WIDTH - reservedForMeta,
  );

  const truncatedMessage =
    matchDisplay ||
    (session.displayName.length === 0 ? (
      <Text color={textColor(Colors.Gray)} dimColor>
        (No messages)
      </Text>
    ) : session.displayName.length > availableMessageWidth ? (
      session.displayName.slice(0, availableMessageWidth - 1) + '…'
    ) : (
      session.displayName
    ));

  return (
    <Box
      flexDirection="row"
      backgroundColor={isActive ? theme.background.focus : undefined}
    >
      <Text color={textColor()} dimColor={isDisabled}>
        {prefix}
      </Text>
      <Box width={5}>
        <Text color={textColor()} dimColor={isDisabled}>
          #{originalIndex + 1}
        </Text>
      </Box>
      <Text color={textColor(Colors.Gray)} dimColor={isDisabled}>
        {' '}
        │{' '}
      </Text>
      <Box width={4}>
        <Text color={textColor()} dimColor={isDisabled}>
          {session.messageCount}
        </Text>
      </Box>
      <Text color={textColor(Colors.Gray)} dimColor={isDisabled}>
        {' '}
        │{' '}
      </Text>
      <Box width={4}>
        <Text color={textColor()} dimColor={isDisabled}>
          {formatRelativeTime(session.lastUpdated, 'short')}
        </Text>
      </Box>
      <Text color={textColor(Colors.Gray)} dimColor={isDisabled}>
        {' '}
        │{' '}
      </Text>
      <Box flexGrow={1}>
        <Text color={textColor(Colors.Comment)} dimColor={isDisabled}>
          {truncatedMessage}
          {additionalInfo && (
            <Text color={textColor(Colors.Gray)} dimColor bold={false}>
              {additionalInfo}
            </Text>
          )}
        </Text>
      </Box>
    </Box>
  );
};
