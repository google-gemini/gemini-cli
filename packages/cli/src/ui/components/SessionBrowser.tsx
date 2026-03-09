/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { Colors } from '../colors.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { useKeypress } from '../hooks/useKeypress.js';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { type Config } from '@google/gemini-cli-core';
import type { SessionInfo, TextMatch } from '../../utils/sessionUtils.js';
import {
  formatRelativeTime,
  getSessionFiles,
} from '../../utils/sessionUtils.js';
import { useTabbedNavigation } from '../hooks/useTabbedNavigation.js';
import { TabHeader, type Tab } from './shared/TabHeader.js';

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
  /** Extension tabs */
  extensionTabs: Array<{ name: string; sessions: SessionInfo[] }>;
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
  /** Current active tab (0: CLI, 1: Antigravity) */
  activeTab: number;

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
  /** Update extensionTabs array */
  setExtensionTabs: React.Dispatch<
    React.SetStateAction<Array<{ name: string; sessions: SessionInfo[] }>>
  >;
  /** Update loading state */
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  /** Update error state */
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  /** Update active session index */
  setActiveIndex: React.Dispatch<React.SetStateAction<number>>;
  /** Update scroll offset */
  setScrollOffset: React.Dispatch<React.SetStateAction<number>>;
  /** Update active tab */
  setActiveTab: (index: number) => void;
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

import {
  SearchModeDisplay,
  NavigationHelpDisplay,
  NoResultsDisplay,
} from './SessionBrowser/SessionBrowserNav.js';
import { SessionListHeader } from './SessionBrowser/SessionListHeader.js';
import { SessionBrowserLoading } from './SessionBrowser/SessionBrowserLoading.js';
import { SessionBrowserError } from './SessionBrowser/SessionBrowserError.js';
import { SessionBrowserEmpty } from './SessionBrowser/SessionBrowserEmpty.js';
import { sortSessions, filterSessions } from './SessionBrowser/utils.js';

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
      {!state.isSearchMode && <NavigationHelpDisplay />}
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
  const [extensionTabs, setExtensionTabs] = useState<
    Array<{ name: string; sessions: SessionInfo[] }>
  >([]);
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

  const [activeTab, setActiveTabInternal] = useState(0);

  const setActiveTab = useCallback((index: number) => {
    setActiveTabInternal(index);
    setActiveIndex(0);
    setScrollOffset(0);
  }, []);

  const filteredAndSortedSessions = useMemo(() => {
    const currentTabSessions =
      activeTab === 0 ? sessions : extensionTabs[activeTab - 1]?.sessions || [];
    const filtered = filterSessions(currentTabSessions, searchQuery);
    return sortSessions(filtered, sortOrder, sortReverse);
  }, [sessions, extensionTabs, activeTab, searchQuery, sortOrder, sortReverse]);

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
    extensionTabs,
    setExtensionTabs,
    loading,
    setLoading,
    error,
    setError,
    activeIndex,
    setActiveIndex,
    scrollOffset,
    setScrollOffset,
    activeTab,
    setActiveTab,
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
 * Converts Antigravity or external session info to CLI SessionInfo format.
 */
type ExternalSessionInfo = {
  id: string;
  mtime: string;
  name?: string;
  displayName?: string;
  messageCount?: number;
  prefix?: string;
};

function convertExternalToSessionInfo(
  ext: ExternalSessionInfo,
  index: number,
): SessionInfo {
  return {
    id: ext.prefix ? `${ext.prefix}${ext.id}` : ext.id,
    file: ext.id,
    fileName: ext.id + '.ext',
    startTime: ext.mtime,
    lastUpdated: ext.mtime,
    messageCount: ext.messageCount || 0,
    displayName: ext.displayName || ext.name || 'External Session',
    firstUserMessage: ext.displayName || ext.name || '',
    isCurrentSession: false,
    index,
  };
}

/**
 * Hook to load sessions on mount.
 */
const useLoadSessions = (config: Config, state: SessionBrowserState) => {
  const {
    setSessions,
    setExtensionTabs,
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
        const workspaceUri = pathToFileURL(process.cwd()).toString();

        const externalTabs: Array<{ name: string; sessions: SessionInfo[] }> =
          [];
        if (config.getEnableExtensionReloading() !== false) {
          /* eslint-disable @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-explicit-any */
          const extensions = (config as any)._extensionLoader?.getExtensions
            ? (config as any)._extensionLoader.getExtensions()
            : [];
          for (const extension of extensions) {
            if (extension.trajectoryProviderModule) {
              try {
                const sessions =
                  await extension.trajectoryProviderModule.listSessions(
                    workspaceUri,
                  );
                const normalizedExt = sessions
                  .map((ext: any) => ({
                    ...ext,
                    prefix: extension.trajectoryProviderModule.prefix,
                  }))
                  .sort(
                    (a: any, b: any) =>
                      new Date(a.mtime).getTime() - new Date(b.mtime).getTime(),
                  )
                  .map((ext: any, i: number) =>
                    convertExternalToSessionInfo(ext, i + 1),
                  );

                if (normalizedExt.length > 0) {
                  externalTabs.push({
                    name:
                      extension.trajectoryProviderModule.displayName ||
                      extension.name,
                    sessions: normalizedExt,
                  });
                }
              } catch (_e) {
                // Ignore loader errors
              }
            }
          }
          /* eslint-enable @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-explicit-any */
        }

        const [sessionData] = await Promise.all([
          getSessionFiles(chatsDir, config.getSessionId()),
        ]);

        setSessions(sessionData);
        setExtensionTabs(externalTabs);

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
  }, [config, setSessions, setExtensionTabs, setLoading, setError]);

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
          return true;
        } else if (key.name === 'backspace') {
          state.setSearchQuery((prev) => prev.slice(0, -1));
          state.setActiveIndex(0);
          state.setScrollOffset(0);
          return true;
        } else if (
          key.sequence &&
          key.sequence.length === 1 &&
          !key.alt &&
          !key.ctrl &&
          !key.cmd
        ) {
          state.setSearchQuery((prev) => prev + key.sequence);
          state.setActiveIndex(0);
          state.setScrollOffset(0);
          return true;
        }
      } else {
        // Navigation mode input handling.  We're keeping the letter-based controls for non-search
        // mode only, because the letters need to act as input for the search.
        if (key.sequence === 'g') {
          state.setActiveIndex(0);
          state.setScrollOffset(0);
          return true;
        } else if (key.sequence === 'G') {
          state.setActiveIndex(state.totalSessions - 1);
          state.setScrollOffset(
            Math.max(0, state.totalSessions - SESSIONS_PER_PAGE),
          );
          return true;
        }
        // Sorting controls.
        else if (key.sequence === 's') {
          cycleSortOrder();
          return true;
        } else if (key.sequence === 'r') {
          state.setSortReverse(!state.sortReverse);
          return true;
        }
        // Searching and exit controls.
        else if (key.sequence === '/') {
          state.setIsSearchMode(true);
          return true;
        } else if (
          key.sequence === 'q' ||
          key.sequence === 'Q' ||
          key.name === 'escape'
        ) {
          onExit();
          return true;
        }
        // Delete session control.
        else if (key.sequence === 'x' || key.sequence === 'X') {
          // Only allow deleting CLI sessions for now
          if (state.activeTab !== 0) return true;

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
          return true;
        }
        // less-like u/d controls.
        else if (key.sequence === 'u') {
          moveSelection(-Math.round(SESSIONS_PER_PAGE / 2));
          return true;
        } else if (key.sequence === 'd') {
          moveSelection(Math.round(SESSIONS_PER_PAGE / 2));
          return true;
        }
      }

      // Handling regardless of search mode.
      if (
        key.name === 'enter' &&
        state.filteredAndSortedSessions[state.activeIndex]
      ) {
        const selectedSession =
          state.filteredAndSortedSessions[state.activeIndex];
        // Don't allow resuming the current session
        if (!selectedSession.isCurrentSession) {
          onResumeSession(selectedSession);
        }
        return true;
      } else if (key.name === 'up') {
        moveSelection(-1);
        return true;
      } else if (key.name === 'down') {
        moveSelection(1);
        return true;
      } else if (key.name === 'pageup') {
        moveSelection(-SESSIONS_PER_PAGE);
        return true;
      } else if (key.name === 'pagedown') {
        moveSelection(SESSIONS_PER_PAGE);
        return true;
      }
      return false;
    },
    { isActive: true },
  );
};

export function SessionBrowserView({
  state,
}: {
  state: SessionBrowserState;
}): React.JSX.Element {
  const tabs: Tab[] = [
    { key: 'cli', header: 'Gemini CLI' },
    ...state.extensionTabs.map((ext, i) => ({
      key: `ext-${i}`,
      header: ext.name,
    })),
  ];

  if (state.loading) {
    return <SessionBrowserLoading />;
  }

  if (state.error) {
    return <SessionBrowserError state={state} />;
  }

  if (state.sessions.length === 0 && state.extensionTabs.length === 0) {
    return <SessionBrowserEmpty />;
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <TabHeader
          tabs={tabs}
          currentIndex={state.activeTab}
          showStatusIcons={false}
        />
      </Box>

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

  useTabbedNavigation({
    tabCount: state.extensionTabs.length + 1,
    isActive: !state.isSearchMode,
    wrapAround: true,
    onTabChange: (index) => state.setActiveTab(index),
  });

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
