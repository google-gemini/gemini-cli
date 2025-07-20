/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import * as fs from 'fs/promises';
import path from 'path';
import { Config } from '@google/gemini-cli-core';

/**
 * Raw conversation data structure as stored in session JSON files.
 */
interface ConversationData {
  /** ISO timestamp when the conversation started */
  startTime: string;
  /** ISO timestamp when the conversation was last updated */
  lastUpdated: string;
  /** Array of messages in the conversation */
  messages: Array<{
    /** Message type (typically 'user' or 'assistant') */
    type: string;
    /** Message content text */
    content: string;
    /** ISO timestamp when the message was created */
    timestamp: string;
  }>;
}

/**
 * Processed session information used for display and interaction.
 */
interface SessionInfo {
  /** Unique session identifier (filename without .json) */
  id: string;
  /** Filename without extension */
  file: string;
  /** Full filename including .json extension */
  fileName: string;
  /** ISO timestamp when session started */
  startTime: string;
  /** Total number of messages in the session */
  messageCount: number;
  /** ISO timestamp when session was last updated */
  lastUpdated: string;
  /** Display name for the session (typically first user message) */
  displayName: string;
  /** Cleaned first user message content */
  firstUserMessage: string;
  /** Whether this is the currently active session */
  isCurrentSession: boolean;
  /** Full concatenated content (only loaded when needed for search) */
  fullContent?: string;
  /** Processed messages with normalized roles (only loaded when needed) */
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Search result snippets when filtering */
  matchSnippets?: TextMatch[];
  /** Total number of matches found in this session */
  matchCount?: number;
  /** Display index in the list */
  index: number;
}

/**
 * Props for the main SessionBrowser component.
 */
interface SessionBrowserProps {
  /** Application configuration object */
  config: Config;
  /** Callback when user selects a session to resume */
  onResumeSession: (sessionId: string) => void;
  /** Callback when user exits the session browser */
  onExit: () => void;
}

/**
 * Centralized state interface for SessionBrowser component.
 * Eliminates prop drilling by providing all state in a single object.
 */
interface SessionBrowserState {
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

/**
 * Extracts the session ID from a session filename by removing the .json extension.
 * @param fileName - The filename (e.g., "session-12345.json")
 * @returns The session ID without the .json extension
 */
const extractSessionId = (fileName: string): string => {
  return fileName.replace('.json', '');
};

/**
 * Cleans and sanitizes message content for display by:
 * - Converting newlines to spaces
 * - Collapsing multiple whitespace to single spaces
 * - Removing non-printable characters (keeping only ASCII 32-126)
 * - Trimming leading/trailing whitespace
 * @param message - The raw message content to clean
 * @returns Sanitized message suitable for display
 */
const cleanMessage = (message: string): string => {
  return message
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[^\x20-\x7E]+/g, '') // Non-printable.
    .trim();
};

/**
 * Extracts and cleans the first user message from a conversation.
 * Used to create a display name/preview for each session.
 * @param messages - Array of conversation messages
 * @returns Cleaned first user message content, or empty string if none found
 */
const extractFirstUserMessage = (
  messages: ConversationData['messages'],
): string => {
  const firstUserMsg = messages.find((msg) => msg.type === 'user');
  return firstUserMsg ? cleanMessage(firstUserMsg.content) : '';
};

/**
 * Loads session files from the chats directory and processes them into SessionInfo objects.
 * Can optionally load full message content for search functionality.
 * @param chatsDir - Path to the directory containing session JSON files
 * @param loadFullContent - Whether to load full message content (needed for search)
 * @returns Promise resolving to array of SessionInfo objects, sorted by filename
 */
const getSessionFiles = async (
  chatsDir: string,
  loadFullContent: boolean = false,
  currentSessionId?: string,
): Promise<SessionInfo[]> => {
  try {
    const files = await fs.readdir(chatsDir);
    const sessionFiles = files
      .filter((f) => f.startsWith('session-') && f.endsWith('.json'))
      .sort(); // Initial sort by filename (includes timestamp)

    const sessionPromises = sessionFiles.map(async (file, index) => {
      const filePath = path.join(chatsDir, file);
      try {
        const content: ConversationData = JSON.parse(
          await fs.readFile(filePath, 'utf8'),
        );

        const firstUserMessage = extractFirstUserMessage(content.messages);
        const fullContent = loadFullContent
          ? content.messages.map((msg) => msg.content).join(' ')
          : undefined;
        const messages = loadFullContent
          ? content.messages.map((msg) => ({
              role:
                msg.type === 'user'
                  ? ('user' as const)
                  : ('assistant' as const),
              content: msg.content,
            }))
          : undefined;

        const sessionId = extractSessionId(file);
        const isCurrentSession = currentSessionId
          ? file.includes(currentSessionId.slice(0, 8))
          : false;

        return {
          id: sessionId,
          file: file.replace('.json', ''),
          fileName: file,
          startTime: content.startTime,
          lastUpdated: content.lastUpdated,
          messageCount: content.messages.length,
          displayName: firstUserMessage, // This could be changed to a conversation title, if we choose to generate one in the future.
          firstUserMessage,
          isCurrentSession,
          fullContent,
          messages,
          index: sessionFiles.length - sessionFiles.indexOf(file),
        } as SessionInfo;
      } catch {
        return null;
      }
    });

    const results = await Promise.all(sessionPromises);
    return results.filter(
      (session): session is SessionInfo => session !== null,
    );
  } catch {
    return [];
  }
};

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
  onExit,
}: {
  state: SessionBrowserState;
  onExit: () => void;
}): React.JSX.Element => (
  <Box flexDirection="column" paddingX={1}>
    <Text color={Colors.AccentRed}>Error: {state.error}</Text>
    <Text color={Colors.Gray}>Press q to exit</Text>
  </Box>
);

/**
 * Empty state component displayed when no sessions are found.
 */
const SessionBrowserEmpty = ({
  onExit,
}: {
  onExit: () => void;
}): React.JSX.Element => (
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
 * Represents a text match found during search with surrounding context.
 */
interface TextMatch {
  /** Text content before the match (with ellipsis if truncated) */
  before: string;
  /** The exact matched text */
  match: string;
  /** Text content after the match (with ellipsis if truncated) */
  after: string;
  /** Role of the message author where the match was found */
  role: 'user' | 'assistant';
}

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

      let snippet = m.slice(contextStart, contextEnd);
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
      {'         '}
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
      No sessions found matching '{state.searchQuery}'.
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
  formatRelativeTime: (dateString: string) => string;
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

  // I don't exactly understand why magic constant is 30...
  const availableMessageWidth = Math.max(20, terminalWidth - 30);

  const truncatedMessage =
    matchDisplay ||
    (session.displayName.length == 0 ? (
      <Text color={textColor(Colors.Gray)} dimColor>
        (No messages)
      </Text>
    ) : session.displayName.length > availableMessageWidth ? (
      session.displayName.slice(0, availableMessageWidth - 1) + '…'
    ) : (
      session.displayName
    ));

  return (
    <Box key={session.id} flexDirection="row">
      <Text color={textColor()} dimColor={isDisabled}>
        {prefix}
      </Text>
      <Box width={5}>
        <Text color={textColor()} dimColor={isDisabled}>
          #{state.totalSessions - originalIndex}
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
          {formatRelativeTime(session.lastUpdated)}
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
  formatRelativeTime: (dateString: string) => string;
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
 * Formats a date string into human-readable relative time.
 * @param dateString - ISO date string to format
 * @returns Relative time string (e.g., "2h", "3d", "1mo")
 */
const formatRelativeTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 1) {
    return 'now';
  } else if (diffSeconds < 60) {
    return `${diffSeconds}s`;
  } else if (diffMinutes < 60) {
    return `${diffMinutes}m`;
  } else if (diffHours < 24) {
    return `${diffHours}h`;
  } else if (diffDays < 30) {
    return `${diffDays}d`;
  } else {
    const diffMonths = Math.floor(diffDays / 30);
    return diffMonths < 12
      ? `${diffMonths}mo`
      : `${Math.floor(diffMonths / 12)}y`;
  }
};

/**
 * Hook to manage all SessionBrowser state.
 */
const useSessionBrowserState = (): SessionBrowserState => {
  const { columns: terminalWidth } = useTerminalSize();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
  }, [sessions.length, searchQuery, sortOrder, sortReverse]);

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
  useEffect(() => {
    const loadSessions = async () => {
      try {
        const chatsDir = path.join(config.getProjectTempDir(), 'chats');
        const sessionData = await getSessionFiles(
          chatsDir,
          true,
          config.getSessionId(),
        );
        state.setSessions(sessionData);
        state.setLoading(false);
      } catch (err) {
        state.setError(
          err instanceof Error ? err.message : 'Failed to load sessions',
        );
        state.setLoading(false);
      }
    };

    loadSessions();
  }, [config, state]);
};

/**
 * Hook to handle selection movement.
 */
const useMoveSelection = (state: SessionBrowserState) => {
  return useCallback(
    (delta: number) => {
      const newIndex = Math.max(
        0,
        Math.min(state.totalSessions - 1, state.activeIndex + delta),
      );
      state.setActiveIndex(newIndex);

      // Adjust scroll offset if needed
      if (newIndex < state.scrollOffset) {
        state.setScrollOffset(newIndex);
      } else if (newIndex >= state.scrollOffset + SESSIONS_PER_PAGE) {
        state.setScrollOffset(newIndex - SESSIONS_PER_PAGE + 1);
      }
    },
    [state],
  );
};

/**
 * Hook to handle sort order cycling.
 */
const useCycleSortOrder = (state: SessionBrowserState) => {
  return useCallback(() => {
    const orders: ('date' | 'messages' | 'name')[] = [
      'date',
      'messages',
      'name',
    ];
    const currentIndex = orders.indexOf(state.sortOrder);
    const nextIndex = (currentIndex + 1) % orders.length;
    state.setSortOrder(orders[nextIndex]);
  }, [state]);
};

/**
 * Hook to handle SessionBrowser input.
 */
const useSessionBrowserInput = (
  state: SessionBrowserState,
  moveSelection: (delta: number) => void,
  cycleSortOrder: () => void,
  onResumeSession: (sessionId: string) => void,
  onExit: () => void,
) => {
  useInput((input, key) => {
    if (state.isSearchMode) {
      // Search-specific input handling.  Only control/symbols here.
      if (key.escape) {
        state.setIsSearchMode(false);
        state.setSearchQuery('');
        state.setActiveIndex(0);
        state.setScrollOffset(0);
      } else if (key.backspace) {
        state.setSearchQuery((prev) => prev.slice(0, -1));
        state.setActiveIndex(0);
        state.setScrollOffset(0);
      } else if (input && !key.ctrl && !key.meta && input.length === 1) {
        state.setSearchQuery((prev) => prev + input);
        state.setActiveIndex(0);
        state.setScrollOffset(0);
      }
    } else {
      // Navigation mode input handling.  We're keeping the letter-based controls for non-search
      // mode only, because the letters need to act as input for the search.
      if (input === 'g') {
        state.setActiveIndex(0);
        state.setScrollOffset(0);
      } else if (input === 'G') {
        state.setActiveIndex(state.totalSessions - 1);
        state.setScrollOffset(
          Math.max(0, state.totalSessions - SESSIONS_PER_PAGE),
        );
      }
      // Sorting controls.
      else if (input === 's') {
        cycleSortOrder();
      } else if (input === 'r') {
        state.setSortReverse(!state.sortReverse);
      }
      // Searching and exit controls.
      else if (input === '/') {
        state.setIsSearchMode(true);
      } else if (input === 'q' || input === 'Q' || key.escape) {
        onExit();
      }
      // less-like u/d controls.
      else if (input === 'd') {
        moveSelection(-Math.round(SESSIONS_PER_PAGE / 2));
      } else if (input === 'u') {
        moveSelection(Math.round(SESSIONS_PER_PAGE / 2));
      }
    }

    // Handling regardless of search mode.
    if (key.return && state.filteredAndSortedSessions[state.activeIndex]) {
      const selectedSession =
        state.filteredAndSortedSessions[state.activeIndex];
      // Don't allow resuming the current session
      if (!selectedSession.isCurrentSession) {
        onResumeSession(selectedSession.id);
      }
    } else if (key.upArrow) {
      moveSelection(-1);
    } else if (key.downArrow) {
      moveSelection(1);
    } else if (key.pageUp) {
      moveSelection(-SESSIONS_PER_PAGE);
    } else if (key.pageDown) {
      moveSelection(SESSIONS_PER_PAGE);
    }
  });
};

export function SessionBrowser({
  config,
  onResumeSession,
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
    onExit,
  );

  // Early returns for different states.

  if (state.loading) {
    return <SessionBrowserLoading />;
  }

  if (state.error) {
    return <SessionBrowserError state={state} onExit={onExit} />;
  }

  if (state.sessions.length === 0) {
    return <SessionBrowserEmpty onExit={onExit} />;
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
