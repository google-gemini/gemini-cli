/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { useKeypress } from '../hooks/useKeypress.js';
import path from 'node:path';
import type { Config } from '@google/gemini-cli-core';
import type { SessionInfo, TextMatch } from '../../utils/sessionUtils.js';
import {
  cleanMessage,
  formatRelativeTime,
  getSessionFiles,
} from '../../utils/sessionUtils.js';

/**
 * Props for the main SessionBrowser component.
 */
export interface SessionBrowserProps {
  /** Application configuration object */
  config: Config;
  /** Callback when user selects a session to resume */
  onResumeSession: (session: SessionInfo) => void;
  /** Callback when user deletes a session */
  onDeleteSession: (session: SessionInfo) => Promise<void>;
  /** Callback when user exits the session browser */
  onExit: () => void;
}

/**
 * Centralized state interface for SessionBrowser component.
 * Eliminates prop drilling by providing all state in a single object.
 */
export interface SessionBrowserState {
  // Data state
  /** All loaded sessions */
  sessions: SessionInfo[];
  /** Sessions after filtering and sorting */
  filteredAndSortedSessions: SessionInfo[];

  // UI state
  /** Whether sessions are currently loading */
  loading: boolean;
  /** Error message if loading failed */
  error: string | null;
  /** Index of currently selected session */
  activeIndex: number;
  /** Current scroll offset for pagination */
  scrollOffset: number;
  /** Terminal width for layout calculations */
  terminalWidth: number;

  // Search state
  /** Current search query string */
  searchQuery: string;
  /** Whether user is in search input mode */
  isSearchMode: boolean;
  /** Whether full content has been loaded for search */
  hasLoadedFullContent: boolean;

  // Sort state
  /** Current sort criteria */
  sortOrder: 'date' | 'messages' | 'name';
  /** Whether sort order is reversed */
  sortReverse: boolean;

  // Computed values
  /** Total number of filtered sessions */
  totalSessions: number;
  /** Start index for current page */
  startIndex: number;
  /** End index for current page */
  endIndex: number;
  /** Sessions visible on current page */
  visibleSessions: SessionInfo[];

  // State setters
  /** Update sessions array */
  setSessions: React.Dispatch<React.SetStateAction<SessionInfo[]>>;
  /** Update loading state */
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  /** Update error state */
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  /** Update active session index */
  setActiveIndex: React.Dispatch<React.SetStateAction<number>>;
  /** Update scroll offset */
  setScrollOffset: React.Dispatch<React.SetStateAction<number>>;
  /** Update search query */
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  /** Update search mode state */
  setIsSearchMode: React.Dispatch<React.SetStateAction<boolean>>;
  /** Update sort order */
  setSortOrder: React.Dispatch<
    React.SetStateAction<'date' | 'messages' | 'name'>
  >;
  /** Update sort reverse flag */
  setSortReverse: React.Dispatch<React.SetStateAction<boolean>>;
  setHasLoadedFullContent: React.Dispatch<React.SetStateAction<boolean>>;
}

const SESSIONS_PER_PAGE = 20;
// Approximate total width reserved for non-message columns and separators
// (prefix, index, message count, age, pipes, and padding) in a session row.
// If the SessionItem layout changes, update this accordingly.
const FIXED_SESSION_COLUMNS_WIDTH = 30;

const Kbd = ({ name, shortcut }: { name: string; shortcut: string }) => (
  <>
    {name}: <Text bold>{shortcut}</Text>
  </>
);

/**
 * Loading state component displayed while sessions are being loaded.
 */
const SessionBrowserLoading = (): React.JSX.Element => (
  <Box flexDirection="column" paddingX={1}>
    <Text color={Colors.Gray}>Loading sessions…</Text>
  </Box>
);

/**
 * Error state component displayed when session loading fails.
 */
const SessionBrowserError = ({
  state,
}: {
  state: SessionBrowserState;
}): React.JSX.Element => (
  <Box flexDirection="column" paddingX={1}>
    <Text color={Colors.AccentRed}>Error: {state.error}</Text>
    <Text color={Colors.Gray}>Press q to exit</Text>
  </Box>
);

/**
 * Empty state component displayed when no sessions are found.
 */
const SessionBrowserEmpty = (): React.JSX.Element => (
  <Box flexDirection="column" paddingX={1}>
    <Text color={Colors.Gray}>No auto-saved conversations found.</Text>
    <Text color={Colors.Gray}>Press q to exit</Text>
  </Box>
);

/**
 * Sorts an array of sessions by the specified criteria.
 * @param sessions - Array of sessions to sort
 * @param sortBy - Sort criteria: 'date' (lastUpdated), 'messages' (messageCount), or 'name' (displayName)
 * @param reverse - Whether to reverse the sort order (ascending instead of descending)
 * @returns New sorted array of sessions
 */
const sortSessions = (
  sessions: SessionInfo[],
  sortBy: 'date' | 'messages' | 'name',
  reverse: boolean,
): SessionInfo[] => {
  const sorted = [...sessions].sort((a, b) => {
    switch (sortBy) {
      case 'date':
        return (
          new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
        );
      case 'messages':
        return b.messageCount - a.messageCount;
      case 'name':
        return a.displayName.localeCompare(b.displayName);
      default:
        return 0;
    }
  });

  return reverse ? sorted.reverse() : sorted;
};

/**
 * Finds all text matches for a search query within conversation messages.
 * Creates TextMatch objects with context (10 chars before/after) and role information.
 * @param messages - Array of messages to search through
 * @param query - Search query string (case-insensitive)
 * @returns Array of TextMatch objects containing match context and metadata
 */
const findTextMatches = (
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  query: string,
): TextMatch[] => {
  if (!query.trim()) return [];

  const lowerQuery = query.toLowerCase();
  const matches: TextMatch[] = [];

  for (const message of messages) {
    const m = cleanMessage(message.content);
    const lowerContent = m.toLowerCase();
    let startIndex = 0;

    while (true) {
      const matchIndex = lowerContent.indexOf(lowerQuery, startIndex);
      if (matchIndex === -1) break;

      const contextStart = Math.max(0, matchIndex - 10);
      const contextEnd = Math.min(m.length, matchIndex + query.length + 10);

      const snippet = m.slice(contextStart, contextEnd);
      const relativeMatchStart = matchIndex - contextStart;
      const relativeMatchEnd = relativeMatchStart + query.length;

      let before = snippet.slice(0, relativeMatchStart);
      const match = snippet.slice(relativeMatchStart, relativeMatchEnd);
      let after = snippet.slice(relativeMatchEnd);

      if (contextStart > 0) before = '…' + before;
      if (contextEnd < m.length) after = after + '…';

      matches.push({ before, match, after, role: message.role });
      startIndex = matchIndex + 1;
    }
  }

  return matches;
};

/**
 * Filters sessions based on a search query, checking titles, IDs, and full content.
 * Also populates matchSnippets and matchCount for sessions with content matches.
 * @param sessions - Array of sessions to filter
 * @param query - Search query string (case-insensitive)
 * @returns Filtered array of sessions that match the query
 */
const filterSessions = (
  sessions: SessionInfo[],
  query: string,
): SessionInfo[] => {
  if (!query.trim()) {
    return sessions.map((session) => ({
      ...session,
      matchSnippets: undefined,
      matchCount: undefined,
    }));
  }

  const lowerQuery = query.toLowerCase();
  return sessions.filter((session) => {
    const titleMatch =
      session.displayName.toLowerCase().includes(lowerQuery) ||
      session.id.toLowerCase().includes(lowerQuery) ||
      session.firstUserMessage.toLowerCase().includes(lowerQuery);

    const contentMatch = session.fullContent
      ?.toLowerCase()
      .includes(lowerQuery);

    if (titleMatch || contentMatch) {
      if (session.messages) {
        session.matchSnippets = findTextMatches(session.messages, query);
        session.matchCount = session.matchSnippets.length;
      }
      return true;
    }

    return false;
  });
};

/**
 * Search input display component.
 */
const SearchModeDisplay = ({
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

/**
 * Header component showing session count and sort information.
 */
const SessionListHeader = ({
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

/**
 * Navigation help component showing keyboard shortcuts.
 */
const NavigationHelp = (): React.JSX.Element => (
  <Box flexDirection="column">
    <Text color={Colors.Gray}>
      <Kbd name="Navigate" shortcut="↑/↓" />
      {'   '}
      <Kbd name="Resume" shortcut="Enter" />
      {'   '}
      <Kbd name="Search" shortcut="/" />
      {'   '}
      <Kbd name="Delete" shortcut="x" />
      {'   '}
      <Kbd name="Quit" shortcut="q" />
    </Text>
    <Text color={Colors.Gray}>
      <Kbd name="Sort" shortcut="s" />
      {'         '}
      <Kbd name="Reverse" shortcut="r" />
      {'      '}
      <Kbd name="First/Last" shortcut="g/G" />
    </Text>
  </Box>
);

/**
 * Table header component with column labels and scroll indicators.
 */
const SessionTableHeader = ({
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

/**
 * No results display component for empty search results.
 */
const NoResultsDisplay = ({
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

/**
 * Match snippet display component for search results.
 */
const MatchSnippetDisplay = ({
  session,
  textColor,
}: {
  session: SessionInfo;
  textColor: (color?: string) => string;
}): React.JSX.Element | null => {
  if (!session.matchSnippets || session.matchSnippets.length === 0) {
    return null;
  }

  const firstMatch = session.matchSnippets[0];
  const rolePrefix = firstMatch.role === 'user' ? 'You:   ' : 'Gemini:';
  const roleColor = textColor(
    firstMatch.role === 'user' ? Colors.AccentGreen : Colors.AccentBlue,
  );

  return (
    <>
      <Text color={roleColor} bold>
        {rolePrefix}{' '}
      </Text>
      {firstMatch.before}
      <Text color={textColor(Colors.AccentRed)} bold>
        {firstMatch.match}
      </Text>
      {firstMatch.after}
    </>
  );
};

/**
 * Individual session row component.
 */
const SessionItem = ({
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
    return isActive ? Colors.AccentPurple : c;
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
    <Box flexDirection="row">
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

/**
 * Session list container component.
 */
const SessionList = ({
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

/**
 * Hook to manage all SessionBrowser state.
 */
export const useSessionBrowserState = (
  initialSessions: SessionInfo[] = [],
  initialLoading = true,
  initialError: string | null = null,
): SessionBrowserState => {
  const { columns: terminalWidth } = useTerminalSize();
  const [sessions, setSessions] = useState<SessionInfo[]>(initialSessions);
  const [loading, setLoading] = useState(initialLoading);
  const [error, setError] = useState<string | null>(initialError);
  const [activeIndex, setActiveIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [sortOrder, setSortOrder] = useState<'date' | 'messages' | 'name'>(
    'date',
  );
  const [sortReverse, setSortReverse] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [hasLoadedFullContent, setHasLoadedFullContent] = useState(false);
  const loadingFullContentRef = useRef(false);

  const filteredAndSortedSessions = useMemo(() => {
    const filtered = filterSessions(sessions, searchQuery);
    return sortSessions(filtered, sortOrder, sortReverse);
  }, [sessions, searchQuery, sortOrder, sortReverse]);

  // Reset full content flag when search is cleared
  useEffect(() => {
    if (!searchQuery) {
      setHasLoadedFullContent(false);
      loadingFullContentRef.current = false;
    }
  }, [searchQuery]);

  const totalSessions = filteredAndSortedSessions.length;
  const startIndex = scrollOffset;
  const endIndex = Math.min(scrollOffset + SESSIONS_PER_PAGE, totalSessions);
  const visibleSessions = filteredAndSortedSessions.slice(startIndex, endIndex);

  const state: SessionBrowserState = {
    sessions,
    setSessions,
    loading,
    setLoading,
    error,
    setError,
    activeIndex,
    setActiveIndex,
    scrollOffset,
    setScrollOffset,
    searchQuery,
    setSearchQuery,
    isSearchMode,
    setIsSearchMode,
    hasLoadedFullContent,
    setHasLoadedFullContent,
    sortOrder,
    setSortOrder,
    sortReverse,
    setSortReverse,
    terminalWidth,
    filteredAndSortedSessions,
    totalSessions,
    startIndex,
    endIndex,
    visibleSessions,
  };

  return state;
};

/**
 * Hook to load sessions on mount.
 */
const useLoadSessions = (config: Config, state: SessionBrowserState) => {
  const {
    setSessions,
    setLoading,
    setError,
    isSearchMode,
    hasLoadedFullContent,
    setHasLoadedFullContent,
  } = state;

  useEffect(() => {
    const loadSessions = async () => {
      try {
        const chatsDir = path.join(config.storage.getProjectTempDir(), 'chats');
        const sessionData = await getSessionFiles(
          chatsDir,
          config.getSessionId(),
        );
        setSessions(sessionData);
        setLoading(false);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load sessions',
        );
        setLoading(false);
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    loadSessions();
  }, [config, setSessions, setLoading, setError]);

  useEffect(() => {
    const loadFullContent = async () => {
      if (isSearchMode && !hasLoadedFullContent) {
        try {
          const chatsDir = path.join(
            config.storage.getProjectTempDir(),
            'chats',
          );
          const sessionData = await getSessionFiles(
            chatsDir,
            config.getSessionId(),
            { includeFullContent: true },
          );
          setSessions(sessionData);
          setHasLoadedFullContent(true);
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : 'Failed to load full session content',
          );
        }
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    loadFullContent();
  }, [
    isSearchMode,
    hasLoadedFullContent,
    config,
    setSessions,
    setHasLoadedFullContent,
    setError,
  ]);
};

/**
 * Hook to handle selection movement.
 */
export const useMoveSelection = (state: SessionBrowserState) => {
  const {
    totalSessions,
    activeIndex,
    scrollOffset,
    setActiveIndex,
    setScrollOffset,
  } = state;

  return useCallback(
    (delta: number) => {
      const newIndex = Math.max(
        0,
        Math.min(totalSessions - 1, activeIndex + delta),
      );
      setActiveIndex(newIndex);

      // Adjust scroll offset if needed
      if (newIndex < scrollOffset) {
        setScrollOffset(newIndex);
      } else if (newIndex >= scrollOffset + SESSIONS_PER_PAGE) {
        setScrollOffset(newIndex - SESSIONS_PER_PAGE + 1);
      }
    },
    [totalSessions, activeIndex, scrollOffset, setActiveIndex, setScrollOffset],
  );
};

/**
 * Hook to handle sort order cycling.
 */
export const useCycleSortOrder = (state: SessionBrowserState) => {
  const { sortOrder, setSortOrder } = state;

  return useCallback(() => {
    const orders: Array<'date' | 'messages' | 'name'> = [
      'date',
      'messages',
      'name',
    ];
    const currentIndex = orders.indexOf(sortOrder);
    const nextIndex = (currentIndex + 1) % orders.length;
    setSortOrder(orders[nextIndex]);
  }, [sortOrder, setSortOrder]);
};

/**
 * Hook to handle SessionBrowser input.
 */
export const useSessionBrowserInput = (
  state: SessionBrowserState,
  moveSelection: (delta: number) => void,
  cycleSortOrder: () => void,
  onResumeSession: (session: SessionInfo) => void,
  onDeleteSession: (session: SessionInfo) => Promise<void>,
  onExit: () => void,
) => {
  useKeypress(
    (key) => {
      if (state.isSearchMode) {
        // Search-specific input handling.  Only control/symbols here.
        if (key.name === 'escape') {
          state.setIsSearchMode(false);
          state.setSearchQuery('');
          state.setActiveIndex(0);
          state.setScrollOffset(0);
        } else if (key.name === 'backspace') {
          state.setSearchQuery((prev) => prev.slice(0, -1));
          state.setActiveIndex(0);
          state.setScrollOffset(0);
        } else if (
          key.sequence &&
          !key.ctrl &&
          !key.meta &&
          key.sequence.length === 1
        ) {
          state.setSearchQuery((prev) => prev + key.sequence);
          state.setActiveIndex(0);
          state.setScrollOffset(0);
        }
      } else {
        // Navigation mode input handling.  We're keeping the letter-based controls for non-search
        // mode only, because the letters need to act as input for the search.
        if (key.sequence === 'g') {
          state.setActiveIndex(0);
          state.setScrollOffset(0);
        } else if (key.sequence === 'G') {
          state.setActiveIndex(state.totalSessions - 1);
          state.setScrollOffset(
            Math.max(0, state.totalSessions - SESSIONS_PER_PAGE),
          );
        }
        // Sorting controls.
        else if (key.sequence === 's') {
          cycleSortOrder();
        } else if (key.sequence === 'r') {
          state.setSortReverse(!state.sortReverse);
        }
        // Searching and exit controls.
        else if (key.sequence === '/') {
          state.setIsSearchMode(true);
        } else if (
          key.sequence === 'q' ||
          key.sequence === 'Q' ||
          key.name === 'escape'
        ) {
          onExit();
        }
        // Delete session control.
        else if (key.sequence === 'x' || key.sequence === 'X') {
          const selectedSession =
            state.filteredAndSortedSessions[state.activeIndex];
          if (selectedSession && !selectedSession.isCurrentSession) {
            onDeleteSession(selectedSession)
              .then(() => {
                // Remove the session from the state
                state.setSessions(
                  state.sessions.filter((s) => s.id !== selectedSession.id),
                );

                // Adjust active index if needed
                if (
                  state.activeIndex >=
                  state.filteredAndSortedSessions.length - 1
                ) {
                  state.setActiveIndex(
                    Math.max(0, state.filteredAndSortedSessions.length - 2),
                  );
                }
              })
              .catch((error) => {
                state.setError(
                  `Failed to delete session: ${error instanceof Error ? error.message : 'Unknown error'}`,
                );
              });
          }
        }
        // less-like u/d controls.
        else if (key.sequence === 'u') {
          moveSelection(-Math.round(SESSIONS_PER_PAGE / 2));
        } else if (key.sequence === 'd') {
          moveSelection(Math.round(SESSIONS_PER_PAGE / 2));
        }
      }

      // Handling regardless of search mode.
      if (
        key.name === 'return' &&
        state.filteredAndSortedSessions[state.activeIndex]
      ) {
        const selectedSession =
          state.filteredAndSortedSessions[state.activeIndex];
        // Don't allow resuming the current session
        if (!selectedSession.isCurrentSession) {
          onResumeSession(selectedSession);
        }
      } else if (key.name === 'up') {
        moveSelection(-1);
      } else if (key.name === 'down') {
        moveSelection(1);
      } else if (key.name === 'pageup') {
        moveSelection(-SESSIONS_PER_PAGE);
      } else if (key.name === 'pagedown') {
        moveSelection(SESSIONS_PER_PAGE);
      }
    },
    { isActive: true },
  );
};

export function SessionBrowserView({
  state,
}: {
  state: SessionBrowserState;
}): React.JSX.Element {
  if (state.loading) {
    return <SessionBrowserLoading />;
  }

  if (state.error) {
    return <SessionBrowserError state={state} />;
  }

  if (state.sessions.length === 0) {
    return <SessionBrowserEmpty />;
  }
  return (
    <Box flexDirection="column" paddingX={1}>
      <SessionListHeader state={state} />

      {state.isSearchMode && <SearchModeDisplay state={state} />}

      {state.totalSessions === 0 ? (
        <NoResultsDisplay state={state} />
      ) : (
        <SessionList state={state} formatRelativeTime={formatRelativeTime} />
      )}
    </Box>
  );
}

export function SessionBrowser({
  config,
  onResumeSession,
  onDeleteSession,
  onExit,
}: SessionBrowserProps): React.JSX.Element {
  // Use all our custom hooks
  const state = useSessionBrowserState();
  useLoadSessions(config, state);
  const moveSelection = useMoveSelection(state);
  const cycleSortOrder = useCycleSortOrder(state);
  useSessionBrowserInput(
    state,
    moveSelection,
    cycleSortOrder,
    onResumeSession,
    onDeleteSession,
    onExit,
  );

  return <SessionBrowserView state={state} />;
}
