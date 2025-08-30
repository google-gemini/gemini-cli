/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { AsyncFzf } from 'fzf';
import type { Suggestion } from '../components/SuggestionsDisplay.js';
import type { CommandContext, SlashCommand } from '../commands/types.js';

// Type alias for improved type safety based on actual fzf result structure
type FzfCommandResult = {
  item: string;
  start: number;
  end: number;
  score: number;
  positions?: number[]; // Optional - fzf doesn't always provide match positions depending on algorithm/options used
};

// Interface for FZF command cache entry
interface FzfCommandCacheEntry {
  fzf: AsyncFzf<string[]>;
  commandMap: Map<string, SlashCommand>;
}

// Utility function to safely handle errors without information disclosure
function logErrorSafely(error: unknown, context: string): void {
  if (error instanceof Error) {
    // Log full error details securely for debugging
    console.error(`[${context}]`, error);
  } else {
    console.error(`[${context}] Non-error thrown:`, error);
  }
}

// Shared utility function for command matching logic
function matchesCommand(cmd: SlashCommand, query: string): boolean {
  return (
    cmd.name.toLowerCase() === query.toLowerCase() ||
    cmd.altNames?.some((alt) => alt.toLowerCase() === query.toLowerCase()) ||
    false
  );
}

interface CommandParserResult {
  hasTrailingSpace: boolean;
  commandPathParts: string[];
  partial: string;
  currentLevel: readonly SlashCommand[] | undefined;
  leafCommand: SlashCommand | null;
  exactMatchAsParent: SlashCommand | undefined;
  isArgumentCompletion: boolean;
}

function useCommandParser(
  query: string | null,
  slashCommands: readonly SlashCommand[],
): CommandParserResult {
  return useMemo(() => {
    if (!query) {
      return {
        hasTrailingSpace: false,
        commandPathParts: [],
        partial: '',
        currentLevel: slashCommands,
        leafCommand: null,
        exactMatchAsParent: undefined,
        isArgumentCompletion: false,
      };
    }

    const fullPath = query.substring(1) || '';
    const hasTrailingSpace = !!query.endsWith(' ');
    const rawParts = fullPath.split(/\s+/).filter((p) => p);
    let commandPathParts = rawParts;
    let partial = '';

    if (!hasTrailingSpace && rawParts.length > 0) {
      partial = rawParts[rawParts.length - 1];
      commandPathParts = rawParts.slice(0, -1);
    }

    let currentLevel: readonly SlashCommand[] | undefined = slashCommands;
    let leafCommand: SlashCommand | null = null;

    for (const part of commandPathParts) {
      if (!currentLevel) {
        leafCommand = null;
        currentLevel = [];
        break;
      }
      const found: SlashCommand | undefined = currentLevel.find((cmd) =>
        matchesCommand(cmd, part),
      );
      if (found) {
        leafCommand = found;
        currentLevel = found.subCommands as readonly SlashCommand[] | undefined;
      } else {
        leafCommand = null;
        currentLevel = [];
        break;
      }
    }

    let exactMatchAsParent: SlashCommand | undefined;
    if (!hasTrailingSpace && currentLevel) {
      exactMatchAsParent = currentLevel.find(
        (cmd) => matchesCommand(cmd, partial) && cmd.subCommands,
      );

      if (exactMatchAsParent) {
        leafCommand = exactMatchAsParent;
        currentLevel = exactMatchAsParent.subCommands;
        partial = '';
      }
    }

    const depth = commandPathParts.length;
    const isArgumentCompletion = !!(
      leafCommand?.completion &&
      (hasTrailingSpace ||
        (rawParts.length > depth && depth > 0 && partial !== ''))
    );

    return {
      hasTrailingSpace,
      commandPathParts,
      partial,
      currentLevel,
      leafCommand,
      exactMatchAsParent,
      isArgumentCompletion,
    };
  }, [query, slashCommands]);
}

interface SuggestionsResult {
  suggestions: Suggestion[];
  isLoading: boolean;
}

interface CompletionPositions {
  start: number;
  end: number;
}

interface PerfectMatchResult {
  isPerfectMatch: boolean;
}

function useCommandSuggestions(
  parserResult: CommandParserResult,
  commandContext: CommandContext,
  getFzfForCommands: (
    commands: readonly SlashCommand[],
  ) => FzfCommandCacheEntry | null,
  getPrefixSuggestions: (
    commands: readonly SlashCommand[],
    partial: string,
  ) => SlashCommand[],
): SuggestionsResult {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const abortController = new AbortController();
    const { signal } = abortController;

    const {
      isArgumentCompletion,
      leafCommand,
      commandPathParts,
      partial,
      currentLevel,
    } = parserResult;

    if (isArgumentCompletion) {
      const fetchAndSetSuggestions = async () => {
        if (signal.aborted) return;

        // Safety check: ensure leafCommand and completion exist
        if (!leafCommand?.completion) {
          console.warn(
            'Attempted argument completion without completion function',
          );
          return;
        }

        setIsLoading(true);
        try {
          const rawParts = [...commandPathParts];
          if (partial) rawParts.push(partial);
          const depth = commandPathParts.length;
          const argString = rawParts.slice(depth).join(' ');
          const results =
            (await leafCommand.completion(commandContext, argString)) || [];

          if (!signal.aborted) {
            const finalSuggestions = results.map((s) => ({
              label: s,
              value: s,
            }));
            setSuggestions(finalSuggestions);
            setIsLoading(false);
          }
        } catch (error) {
          if (!signal.aborted) {
            logErrorSafely(error, 'Argument completion');
            setSuggestions([]);
            setIsLoading(false);
          }
        }
      };
      fetchAndSetSuggestions();
      return () => abortController.abort();
    }

    const commandsToSearch = currentLevel || [];
    if (commandsToSearch.length > 0) {
      const performFuzzySearch = async () => {
        if (signal.aborted) return;
        let potentialSuggestions: SlashCommand[] = [];

        if (partial === '') {
          // If no partial query, show all available commands
          potentialSuggestions = commandsToSearch.filter(
            (cmd) => cmd.description,
          );
        } else {
          // Use fuzzy search for non-empty partial queries with fallback
          const fzfInstance = getFzfForCommands(commandsToSearch);
          if (fzfInstance) {
            try {
              const fzfResults = await fzfInstance.fzf.find(partial);
              if (signal.aborted) return;
              const uniqueCommands = new Set<SlashCommand>();
              fzfResults.forEach((result: FzfCommandResult) => {
                const cmd = fzfInstance.commandMap.get(result.item);
                if (cmd && cmd.description) {
                  uniqueCommands.add(cmd);
                }
              });
              potentialSuggestions = Array.from(uniqueCommands);
            } catch (error) {
              logErrorSafely(
                error,
                'Fuzzy search - falling back to prefix matching',
              );
              // Fallback to prefix-based filtering
              potentialSuggestions = getPrefixSuggestions(
                commandsToSearch,
                partial,
              );
            }
          } else {
            // Fallback to prefix-based filtering when fzf instance creation fails
            potentialSuggestions = getPrefixSuggestions(
              commandsToSearch,
              partial,
            );
          }
        }

        if (!signal.aborted) {
          const finalSuggestions = potentialSuggestions.map((cmd) => ({
            label: cmd.name,
            value: cmd.name,
            description: cmd.description,
          }));

          setSuggestions(finalSuggestions);
        }
      };

      performFuzzySearch().catch((error) => {
        logErrorSafely(error, 'Unexpected fuzzy search error');
        if (!signal.aborted) {
          // Ultimate fallback: show no suggestions rather than confusing the user
          // with all available commands when their query clearly doesn't match anything
          setSuggestions([]);
        }
      });
      return () => abortController.abort();
    }

    setSuggestions([]);
    return () => abortController.abort();
  }, [parserResult, commandContext, getFzfForCommands, getPrefixSuggestions]);

  return { suggestions, isLoading };
}

function useCompletionPositions(
  query: string | null,
  parserResult: CommandParserResult,
): CompletionPositions {
  return useMemo(() => {
    if (!query) {
      return { start: -1, end: -1 };
    }

    const { hasTrailingSpace, partial, exactMatchAsParent } = parserResult;

    // Set completion start/end positions
    if (hasTrailingSpace || exactMatchAsParent) {
      return { start: query.length, end: query.length };
    } else if (partial) {
      if (parserResult.isArgumentCompletion) {
        const commandSoFar = `/${parserResult.commandPathParts.join(' ')}`;
        const argStartIndex =
          commandSoFar.length +
          (parserResult.commandPathParts.length > 0 ? 1 : 0);
        return { start: argStartIndex, end: query.length };
      } else {
        return { start: query.length - partial.length, end: query.length };
      }
    } else {
      return { start: 1, end: query.length };
    }
  }, [query, parserResult]);
}

function usePerfectMatch(
  parserResult: CommandParserResult,
): PerfectMatchResult {
  return useMemo(() => {
    const { hasTrailingSpace, partial, leafCommand, currentLevel } =
      parserResult;

    if (hasTrailingSpace) {
      return { isPerfectMatch: false };
    }

    if (leafCommand && partial === '' && leafCommand.action) {
      return { isPerfectMatch: true };
    }

    if (currentLevel) {
      const perfectMatch = currentLevel.find(
        (cmd) => matchesCommand(cmd, partial) && cmd.action,
      );
      if (perfectMatch) {
        return { isPerfectMatch: true };
      }
    }

    return { isPerfectMatch: false };
  }, [parserResult]);
}

export interface UseSlashCompletionProps {
  enabled: boolean;
  query: string | null;
  slashCommands: readonly SlashCommand[];
  commandContext: CommandContext;
  setSuggestions: (suggestions: Suggestion[]) => void;
  setIsLoadingSuggestions: (isLoading: boolean) => void;
  setIsPerfectMatch: (isMatch: boolean) => void;
}

export function useSlashCompletion(props: UseSlashCompletionProps): {
  completionStart: number;
  completionEnd: number;
} {
  const {
    enabled,
    query,
    slashCommands,
    commandContext,
    setSuggestions,
    setIsLoadingSuggestions,
    setIsPerfectMatch,
  } = props;
  const [completionStart, setCompletionStart] = useState(-1);
  const [completionEnd, setCompletionEnd] = useState(-1);

  // Simplified cache for AsyncFzf instances - WeakMap handles automatic cleanup
  const fzfInstanceCache = useMemo(
    () => new WeakMap<readonly SlashCommand[], FzfCommandCacheEntry>(),
    [],
  );

  // Helper function to create or retrieve cached AsyncFzf instance for a command level
  const getFzfForCommands = useMemo(
    () => (commands: readonly SlashCommand[]) => {
      if (!commands || commands.length === 0) {
        return null;
      }

      // Check if we already have a cached instance
      const cached = fzfInstanceCache.get(commands);
      if (cached) {
        return cached;
      }

      // Create new fzf instance
      const commandItems: string[] = [];
      const commandMap = new Map<string, SlashCommand>();

      commands.forEach((cmd) => {
        if (cmd.description) {
          commandItems.push(cmd.name);
          commandMap.set(cmd.name, cmd);

          if (cmd.altNames) {
            cmd.altNames.forEach((alt) => {
              commandItems.push(alt);
              commandMap.set(alt, cmd);
            });
          }
        }
      });

      if (commandItems.length === 0) {
        return null;
      }

      try {
        const instance: FzfCommandCacheEntry = {
          fzf: new AsyncFzf(commandItems, {
            fuzzy: 'v2',
            casing: 'case-insensitive', // Explicitly enforce case-insensitivity
          }),
          commandMap,
        };

        // Cache the instance - WeakMap will handle automatic cleanup
        fzfInstanceCache.set(commands, instance);

        return instance;
      } catch (error) {
        logErrorSafely(error, 'FZF instance creation');
        return null;
      }
    },
    [fzfInstanceCache],
  );

  // Memoized helper function for prefix-based filtering to improve performance
  const getPrefixSuggestions = useMemo(
    () => (commands: readonly SlashCommand[], partial: string) =>
      commands.filter(
        (cmd) =>
          cmd.description &&
          (cmd.name.toLowerCase().startsWith(partial.toLowerCase()) ||
            cmd.altNames?.some((alt) =>
              alt.toLowerCase().startsWith(partial.toLowerCase()),
            )),
      ),
    [],
  );

  // Use extracted hooks for better separation of concerns
  const parserResult = useCommandParser(query, slashCommands);
  const { suggestions: hookSuggestions, isLoading } = useCommandSuggestions(
    parserResult,
    commandContext,
    getFzfForCommands,
    getPrefixSuggestions,
  );
  const { start: calculatedStart, end: calculatedEnd } = useCompletionPositions(
    query,
    parserResult,
  );
  const { isPerfectMatch } = usePerfectMatch(parserResult);

  // Update external state - this is now much simpler and focused
  useEffect(() => {
    if (!enabled || query === null) {
      setSuggestions([]);
      setIsLoadingSuggestions(false);
      setIsPerfectMatch(false);
      setCompletionStart(-1);
      setCompletionEnd(-1);
      return;
    }

    setSuggestions(hookSuggestions);
    setIsLoadingSuggestions(isLoading);
    setIsPerfectMatch(isPerfectMatch);
    setCompletionStart(calculatedStart);
    setCompletionEnd(calculatedEnd);
  }, [
    enabled,
    query,
    hookSuggestions,
    isLoading,
    isPerfectMatch,
    calculatedStart,
    calculatedEnd,
    setSuggestions,
    setIsLoadingSuggestions,
    setIsPerfectMatch,
  ]);

  return {
    completionStart,
    completionEnd,
  };
}
