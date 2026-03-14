/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Box } from 'ink';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { useKeypress } from '../hooks/useKeypress.js';
import path from 'node:path';
import type { Config } from '@google/gemini-cli-core';
import type { SessionInfo } from '../../utils/sessionUtils.js';
import {
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

import { SearchModeDisplay } from './SessionBrowser/SearchModeDisplay.js';
import { SessionListHeader } from './SessionBrowser/SessionListHeader.js';
import { NoResultsDisplay } from './SessionBrowser/NoResultsDisplay.js';
import { SessionBrowserLoading } from './SessionBrowser/SessionBrowserLoading.js';
import { SessionBrowserError } from './SessionBrowser/SessionBrowserError.js';
import { SessionBrowserEmpty } from './SessionBrowser/SessionBrowserEmpty.js';
import { SessionList } from './SessionBrowser/SessionList.js';
import { sortSessions, filterSessions } from './SessionBrowser/utils.js';

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
