/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  escapePath,
  unescapePath,
  Config,
  FileSearch,
  AbortError,
} from '@google/gemini-cli-core';
import {
  MAX_SUGGESTIONS_TO_SHOW,
  Suggestion,
} from '../components/SuggestionsDisplay.js';
import { CommandContext, SlashCommand } from '../commands/types.js';

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
}

export function useCompletion(
  query: string,
  cwd: string,
  isActive: boolean,
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
  const [filesearchStatus, setFileSearchStatus] = useState<FileSearchStatus>(
    FileSearchStatus.IDLE,
  );

  const resetCompletionState = useCallback(() => {
    setSuggestions([]);
    setActiveSuggestionIndex(-1);
    setVisibleStartIndex(0);
    setShowSuggestions(false);
    setIsLoadingSuggestions(false);
    setIsPerfectMatch(false);
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

  const fetchSuggestions = useCallback(
    async (prefix: string, signal: AbortSignal) => {
      if (suggestionsRef.current.length === 0) {
        setIsLoadingSuggestions(true);
      }

      try {
        const results = await fileSearchRef.current!.search(prefix, {
          signal,
          maxResults: MAX_SUGGESTIONS_TO_SHOW,
        });

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
          return;
        }
        // TODO: handle other errors
      } finally {
        setIsLoadingSuggestions(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (isActive && filesearchStatus === FileSearchStatus.IDLE) {
      setFileSearchStatus(FileSearchStatus.INITIALIZING);
      setIsLoadingSuggestions(true); // Set loading to true when initialization starts
      fileSearchRef.current = new FileSearch({
        projectRoot: cwd,
        ignoreDirs: [],
        useGitignore: true,
        useGeminiignore: true,
        cache: true,
        cacheTtl: 30,
      });
      fileSearchRef.current.initialize().then(() => {
        setFileSearchStatus(FileSearchStatus.READY);
        setIsLoadingSuggestions(false); // Set loading to false when initialization finishes
      });
    }
  }, [isActive, cwd, filesearchStatus]);

  useEffect(() => {
    if (!isActive) {
      resetCompletionState();
      return;
    }

    const trimmedQuery = query.trimStart();

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
          if (suggestionsRef.current.length === 0) {
            setIsLoadingSuggestions(true);
          }
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
    const atIndex = query.lastIndexOf('@');
    if (atIndex === -1) {
      resetCompletionState();
      return;
    }

    const prefix = unescapePath(query.substring(atIndex + 1));

    if (filesearchStatus === FileSearchStatus.INITIALIZING) {
      return;
    }

    if (filesearchStatus === FileSearchStatus.READY) {
      searchAbortControllerRef.current = new AbortController();
      fetchSuggestions(prefix, searchAbortControllerRef.current.signal);
    }

    return () => {
      if (searchAbortControllerRef.current) {
        searchAbortControllerRef.current.abort();
      }
    };
  }, [
    query,
    isActive,
    resetCompletionState,
    slashCommands,
    commandContext,
    config,
    filesearchStatus,
    fetchSuggestions,
  ]);

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
  };
}
