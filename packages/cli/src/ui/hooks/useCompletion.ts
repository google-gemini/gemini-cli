/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  escapePath,
  unescapePath,
  getErrorMessage,
  Config,
  FileSearch,
  AbortError,
} from '@google/gemini-cli-core';
import {
  MAX_SUGGESTIONS_TO_SHOW,
  Suggestion,
} from '../components/SuggestionsDisplay.js';
import { CommandContext, SlashCommand } from '../commands/types.js';
import { TextBuffer } from '../components/shared/text-buffer.js';
import { isSlashCommand } from '../utils/commandUtils.js';
import { toCodePoints } from '../utils/textUtils.js';

// The FileSearch engine is initialized asynchronously. This enum manages its state.
enum FileSearchStatus {
  // Not yet started.
  IDLE,
  // The initialize() promise is in flight.
  INITIALIZING,
  // Ready to serve search requests.
  READY,
}

export interface UseCompletionReturn {
  suggestions: Suggestion[];
  activeSuggestionIndex: number;
  visibleStartIndex: number;
  showSuggestions: boolean;
  isLoadingSuggestions: boolean;
  isPerfectMatch: boolean;
  setActiveSuggestionIndex: React.Dispatch<React.SetStateAction<number>>;
  setShowSuggestions: React.Dispatch<React.SetStateAction<boolean>>;
  resetCompletionState: () => void;
  navigateUp: () => void;
  navigateDown: () => void;
  handleAutocomplete: (indexToUse: number) => void;
}

export function useCompletion(
  buffer: TextBuffer,
  cwd: string,
  slashCommands: readonly SlashCommand[],
  commandContext: CommandContext,
  config?: Config,
): UseCompletionReturn {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const suggestionsRef = useRef(suggestions);
  suggestionsRef.current = suggestions;

  const [activeSuggestionIndex, setActiveSuggestionIndex] =
    useState<number>(-1);
  const [visibleStartIndex, setVisibleStartIndex] = useState<number>(0);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] =
    useState<boolean>(false);
  const [isPerfectMatch, setIsPerfectMatch] = useState<boolean>(false);
  const fileSearchRef = useRef<FileSearch | null>(null);
  const searchAbortControllerRef = useRef<AbortController | null>(null);
  const loadingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [fileSearchStatus, setFileSearchStatus] = useState<FileSearchStatus>(
    FileSearchStatus.IDLE,
  );

  const resetCompletionState = useCallback(() => {
    setSuggestions([]);
    setActiveSuggestionIndex(-1);
    setVisibleStartIndex(0);
    setShowSuggestions(false);
    setIsLoadingSuggestions(false);
    setIsPerfectMatch(false);
    if (loadingTimerRef.current) {
      clearTimeout(loadingTimerRef.current);
    }
    fileSearchRef.current = null;
    setFileSearchStatus(FileSearchStatus.IDLE);
  }, []);

  const navigateUp = useCallback(() => {
    if (suggestions.length === 0) return;

    setActiveSuggestionIndex((prevActiveIndex) => {
      // Calculate new active index, handling wrap-around
      const newActiveIndex =
        prevActiveIndex <= 0 ? suggestions.length - 1 : prevActiveIndex - 1;

      // Adjust scroll position based on the new active index
      setVisibleStartIndex((prevVisibleStart) => {
        // Case 1: Wrapped around to the last item
        if (
          newActiveIndex === suggestions.length - 1 &&
          suggestions.length > MAX_SUGGESTIONS_TO_SHOW
        ) {
          return Math.max(0, suggestions.length - MAX_SUGGESTIONS_TO_SHOW);
        }
        // Case 2: Scrolled above the current visible window
        if (newActiveIndex < prevVisibleStart) {
          return newActiveIndex;
        }
        // Otherwise, keep the current scroll position
        return prevVisibleStart;
      });

      return newActiveIndex;
    });
  }, [suggestions.length]);

  const navigateDown = useCallback(() => {
    if (suggestions.length === 0) return;

    setActiveSuggestionIndex((prevActiveIndex) => {
      // Calculate new active index, handling wrap-around
      const newActiveIndex =
        prevActiveIndex >= suggestions.length - 1 ? 0 : prevActiveIndex + 1;

      // Adjust scroll position based on the new active index
      setVisibleStartIndex((prevVisibleStart) => {
        // Case 1: Wrapped around to the first item
        if (
          newActiveIndex === 0 &&
          suggestions.length > MAX_SUGGESTIONS_TO_SHOW
        ) {
          return 0;
        }
        // Case 2: Scrolled below the current visible window
        const visibleEndIndex = prevVisibleStart + MAX_SUGGESTIONS_TO_SHOW;
        if (newActiveIndex >= visibleEndIndex) {
          return newActiveIndex - MAX_SUGGESTIONS_TO_SHOW + 1;
        }
        // Otherwise, keep the current scroll position
        return prevVisibleStart;
      });

      return newActiveIndex;
    });
  }, [suggestions.length]);

  // Check if cursor is after @ or / without unescaped spaces
  const isActive = useMemo(() => {
    if (isSlashCommand(buffer.text.trim())) {
      return true;
    }

    // For other completions like '@', we search backwards from the cursor.
    const [row, col] = buffer.cursor;
    const currentLine = buffer.lines[row] || '';
    const codePoints = toCodePoints(currentLine);

    for (let i = col - 1; i >= 0; i--) {
      const char = codePoints[i];

      if (char === ' ') {
        // Check for unescaped spaces.
        let backslashCount = 0;
        for (let j = i - 1; j >= 0 && codePoints[j] === '\\'; j--) {
          backslashCount++;
        }
        if (backslashCount % 2 === 0) {
          return false; // Inactive on unescaped space.
        }
      } else if (char === '@') {
        // Active if we find an '@' before any unescaped space.
        return true;
      }
    }

    return false;
  }, [buffer.text, buffer.cursor, buffer.lines]);

  const fetchFileSuggestions = useCallback(
    async (prefix: string, signal: AbortSignal) => {
      if (!fileSearchRef.current) return;

      // Clear any pending delayed loader.
      if (loadingTimerRef.current) {
        clearTimeout(loadingTimerRef.current);
      }

      // If there are no suggestions, show the loader immediately.
      // Otherwise, only show it if the search takes more than 100ms.
      if (suggestionsRef.current.length === 0) {
        setIsLoadingSuggestions(true);
      } else {
        loadingTimerRef.current = setTimeout(() => {
          setIsLoadingSuggestions(true);
        }, 100);
      }

      try {
        const results = await fileSearchRef.current.search(prefix, {
          signal,
          // Never retrieve more than 3 pages of results
          maxResults: MAX_SUGGESTIONS_TO_SHOW * 3,
        });

        if (signal.aborted) return;

        const fetchedSuggestions = results.map((result) => ({
          label: result,
          value: escapePath(result),
        }));

        setSuggestions(fetchedSuggestions);
        setShowSuggestions(fetchedSuggestions.length > 0);
        setActiveSuggestionIndex(fetchedSuggestions.length > 0 ? 0 : -1);
        setVisibleStartIndex(0);
      } catch (e) {
        if (e instanceof AbortError) {
          // This is expected when the user types quickly or closes the suggestions.
          return;
        }
        // TODO(b/343593467): Implement better error handling.
        console.error(`Error fetching file suggestions: ${getErrorMessage(e)}`);
        resetCompletionState();
      } finally {
        if (loadingTimerRef.current) {
          clearTimeout(loadingTimerRef.current);
        }
        if (!signal.aborted) {
          setIsLoadingSuggestions(false);
        }
      }
    },
    [resetCompletionState],
  );

  // Effect to initialize the FileSearch engine
  useEffect(() => {
    if (isActive && fileSearchStatus === FileSearchStatus.IDLE) {
      const atIndex = buffer.text.lastIndexOf('@');
      if (atIndex === -1) {
        return;
      }

      setFileSearchStatus(FileSearchStatus.INITIALIZING);
      setIsLoadingSuggestions(true);
      setShowSuggestions(true);
      const filterOptions = config?.getFileFilteringOptions() ?? {
        respectGitIgnore: true,
        respectGeminiIgnore: true,
      };
      fileSearchRef.current = new FileSearch({
        projectRoot: cwd,
        ignoreDirs: [],
        useGitignore: filterOptions.respectGitIgnore,
        useGeminiignore: filterOptions.respectGeminiIgnore,
        cache: true,
        cacheTtl: 30, // 30 seconds
      });

      fileSearchRef.current
        .initialize()
        .then(() => {
          setFileSearchStatus(FileSearchStatus.READY);
        })
        .catch((e) => {
          console.error(
            `FileSearch initialization failed: ${getErrorMessage(e)}`,
          );
          // Reset to allow for a retry if the user starts typing again.
          setFileSearchStatus(FileSearchStatus.IDLE);
          setIsLoadingSuggestions(false);
          setShowSuggestions(false);
        });
    }
  }, [isActive, fileSearchStatus, cwd, buffer.text, config]);

  useEffect(() => {
    if (!isActive) {
      resetCompletionState();
      return;
    }

    const trimmedQuery = buffer.text.trimStart();

    if (trimmedQuery.startsWith('/')) {
      // Always reset perfect match at the beginning of processing.
      setIsPerfectMatch(false);

      const fullPath = trimmedQuery.substring(1);
      const hasTrailingSpace = trimmedQuery.endsWith(' ');

      // Get all non-empty parts of the command.
      const rawParts = fullPath.split(/\s+/).filter((p) => p);

      let commandPathParts = rawParts;
      let partial = '';

      // If there's no trailing space, the last part is potentially a partial segment.
      // We tentatively separate it.
      if (!hasTrailingSpace && rawParts.length > 0) {
        partial = rawParts[rawParts.length - 1];
        commandPathParts = rawParts.slice(0, -1);
      }

      // Traverse the Command Tree using the tentative completed path
      let currentLevel: readonly SlashCommand[] | undefined = slashCommands;
      let leafCommand: SlashCommand | null = null;

      for (const part of commandPathParts) {
        if (!currentLevel) {
          leafCommand = null;
          currentLevel = [];
          break;
        }
        const found: SlashCommand | undefined = currentLevel.find(
          (cmd) => cmd.name === part || cmd.altNames?.includes(part),
        );
        if (found) {
          leafCommand = found;
          currentLevel = found.subCommands as
            | readonly SlashCommand[]
            | undefined;
        } else {
          leafCommand = null;
          currentLevel = [];
          break;
        }
      }

      // Handle the Ambiguous Case
      if (!hasTrailingSpace && currentLevel) {
        const exactMatchAsParent = currentLevel.find(
          (cmd) =>
            (cmd.name === partial || cmd.altNames?.includes(partial)) &&
            cmd.subCommands,
        );

        if (exactMatchAsParent) {
          // It's a perfect match for a parent command. Override our initial guess.
          // Treat it as a completed command path.
          leafCommand = exactMatchAsParent;
          currentLevel = exactMatchAsParent.subCommands;
          partial = ''; // We now want to suggest ALL of its sub-commands.
        }
      }

      // Check for perfect, executable match
      if (!hasTrailingSpace) {
        if (leafCommand && partial === '' && leafCommand.action) {
          // Case: /command<enter> - command has action, no sub-commands were suggested
          setIsPerfectMatch(true);
        } else if (currentLevel) {
          // Case: /command subcommand<enter>
          const perfectMatch = currentLevel.find(
            (cmd) =>
              (cmd.name === partial || cmd.altNames?.includes(partial)) &&
              cmd.action,
          );
          if (perfectMatch) {
            setIsPerfectMatch(true);
          }
        }
      }

      const depth = commandPathParts.length;

      // Provide Suggestions based on the now-corrected context

      // Argument Completion
      if (
        leafCommand?.completion &&
        (hasTrailingSpace ||
          (rawParts.length > depth && depth > 0 && partial !== ''))
      ) {
        const fetchAndSetSuggestions = async () => {
          setIsLoadingSuggestions(true);
          const argString = rawParts.slice(depth).join(' ');
          const results =
            (await leafCommand!.completion!(commandContext, argString)) || [];
          const finalSuggestions = results.map((s) => ({ label: s, value: s }));
          setSuggestions(finalSuggestions);
          setShowSuggestions(finalSuggestions.length > 0);
          setActiveSuggestionIndex(finalSuggestions.length > 0 ? 0 : -1);
          setIsLoadingSuggestions(false);
        };
        fetchAndSetSuggestions();
        return;
      }

      // Command/Sub-command Completion
      const commandsToSearch = currentLevel || [];
      if (commandsToSearch.length > 0) {
        let potentialSuggestions = commandsToSearch.filter(
          (cmd) =>
            cmd.description &&
            (cmd.name.startsWith(partial) ||
              cmd.altNames?.some((alt) => alt.startsWith(partial))),
        );

        // If a user's input is an exact match and it is a leaf command,
        // enter should submit immediately.
        if (potentialSuggestions.length > 0 && !hasTrailingSpace) {
          const perfectMatch = potentialSuggestions.find(
            (s) => s.name === partial || s.altNames?.includes(partial),
          );
          if (perfectMatch && perfectMatch.action) {
            potentialSuggestions = [];
          }
        }

        const finalSuggestions = potentialSuggestions.map((cmd) => ({
          label: cmd.name,
          value: cmd.name,
          description: cmd.description,
        }));

        setSuggestions(finalSuggestions);
        setShowSuggestions(finalSuggestions.length > 0);
        setActiveSuggestionIndex(finalSuggestions.length > 0 ? 0 : -1);
        setIsLoadingSuggestions(false);
        return;
      }

      // If we fall through, no suggestions are available.
      resetCompletionState();
      return;
    }

    // Handle At Command Completion
    const atIndex = buffer.text.lastIndexOf('@');
    if (atIndex === -1) {
      resetCompletionState();
      return;
    }

    // If the engine is still warming up, show the loading indicator
    // but don't search yet. The search will be triggered by the effect
    // that watches the fileSearchStatus.
    if (fileSearchStatus === FileSearchStatus.INITIALIZING) {
      setIsLoadingSuggestions(true);
      return;
    }

    // Once the engine is ready, start searching.
    if (fileSearchStatus === FileSearchStatus.READY) {
      const prefix = unescapePath(buffer.text.substring(atIndex + 1));

      // Abort any previous search that might be in flight.
      if (searchAbortControllerRef.current) {
        searchAbortControllerRef.current.abort();
      }

      const newAbortController = new AbortController();
      searchAbortControllerRef.current = newAbortController;

      fetchFileSuggestions(prefix, newAbortController.signal);
    }

    return () => {
      if (searchAbortControllerRef.current) {
        searchAbortControllerRef.current.abort();
      }
    };
  }, [
    buffer.text,
    isActive,
    resetCompletionState,
    slashCommands,
    commandContext,
    config,
    fileSearchStatus,
    fetchFileSuggestions,
  ]);

  const handleAutocomplete = useCallback(
    (indexToUse: number) => {
      if (indexToUse < 0 || indexToUse >= suggestions.length) {
        return;
      }
      const query = buffer.text;
      const suggestion = suggestions[indexToUse].value;

      if (query.trimStart().startsWith('/')) {
        const hasTrailingSpace = query.endsWith(' ');
        const parts = query
          .trimStart()
          .substring(1)
          .split(/\s+/)
          .filter(Boolean);

        let isParentPath = false;
        // If there's no trailing space, we need to check if the current query
        // is already a complete path to a parent command.
        if (!hasTrailingSpace) {
          let currentLevel: readonly SlashCommand[] | undefined = slashCommands;
          for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const found: SlashCommand | undefined = currentLevel?.find(
              (cmd) => cmd.name === part || cmd.altNames?.includes(part),
            );

            if (found) {
              if (i === parts.length - 1 && found.subCommands) {
                isParentPath = true;
              }
              currentLevel = found.subCommands as
                | readonly SlashCommand[]
                | undefined;
            } else {
              // Path is invalid, so it can't be a parent path.
              currentLevel = undefined;
              break;
            }
          }
        }

        // Determine the base path of the command.
        // - If there's a trailing space, the whole command is the base.
        // - If it's a known parent path, the whole command is the base.
        // - If the last part is a complete argument, the whole command is the base.
        // - Otherwise, the base is everything EXCEPT the last partial part.
        const lastPart = parts.length > 0 ? parts[parts.length - 1] : '';
        const isLastPartACompleteArg =
          lastPart.startsWith('--') && lastPart.includes('=');

        const basePath =
          hasTrailingSpace || isParentPath || isLastPartACompleteArg
            ? parts
            : parts.slice(0, -1);
        const newValue = `/${[...basePath, suggestion].join(' ')} `;

        buffer.setText(newValue);
      } else {
        const atIndex = query.lastIndexOf('@');
        if (atIndex === -1) return;

        buffer.replaceRangeByOffset(
          atIndex + 1,
          buffer.text.length,
          suggestion,
        );
      }
      resetCompletionState();
    },
    [resetCompletionState, buffer, suggestions, slashCommands],
  );

  return {
    suggestions,
    activeSuggestionIndex,
    visibleStartIndex,
    showSuggestions,
    isLoadingSuggestions,
    isPerfectMatch,
    setActiveSuggestionIndex,
    setShowSuggestions,
    resetCompletionState,
    navigateUp,
    navigateDown,
    handleAutocomplete,
  };
}
