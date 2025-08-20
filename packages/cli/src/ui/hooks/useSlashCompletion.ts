/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { AsyncFzf, FzfResultItem } from 'fzf';
import { Suggestion } from '../components/SuggestionsDisplay.js';
import { CommandContext, SlashCommand } from '../commands/types.js';

// Type alias for improved type safety
type FzfCommandResult = FzfResultItem<string>;

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

  // Memoized cache for AsyncFzf instances per command level
  const fzfInstanceCache = useMemo(() => new WeakMap<readonly SlashCommand[], {
    fzf: AsyncFzf<string[]>;
    commandMap: Map<string, SlashCommand>;
  }>(), []);

  // Helper function to create or retrieve cached AsyncFzf instance for a command level
  const getFzfForCommands = useMemo(() => (commands: readonly SlashCommand[]) => {
    if (!commands || commands.length === 0) {
      return null;
    }
    
    // Check if we already have a cached instance
    const cached = fzfInstanceCache.get(commands);
    if (cached) {
      return cached;
    }
    
    const commandItems: string[] = [];
    const commandMap = new Map<string, SlashCommand>();
    
    commands.forEach(cmd => {
      if (cmd.description) {
        commandItems.push(cmd.name);
        commandMap.set(cmd.name, cmd);
        
        if (cmd.altNames) {
          cmd.altNames.forEach(alt => {
            commandItems.push(alt);
            commandMap.set(alt, cmd);
          });
        }
      }
    });
    
    if (commandItems.length === 0) {
      return null;
    }
    
    const instance = {
      fzf: new AsyncFzf(commandItems, { fuzzy: 'v2' }),
      commandMap
    };
    
    // Cache the instance for future use
    fzfInstanceCache.set(commands, instance);
    return instance;
  }, [fzfInstanceCache]);

  // Helper function for command matching to reduce code duplication
  const matchesCommand = useMemo(() => (cmd: SlashCommand, query: string): boolean => 
    cmd.name.toLowerCase() === query.toLowerCase() ||
    cmd.altNames?.some(alt => alt.toLowerCase() === query.toLowerCase()) || false, []);

  // Memoized helper function for prefix-based filtering to improve performance
  const getPrefixSuggestions = useMemo(() => (commands: readonly SlashCommand[], partial: string) => 
    commands.filter(
      (cmd) =>
        cmd.description &&
        (cmd.name.toLowerCase().startsWith(partial.toLowerCase()) ||
          cmd.altNames?.some((alt) => alt.toLowerCase().startsWith(partial.toLowerCase()))),
    ), []);

  useEffect(() => {
    if (!enabled || query === null) {
      return;
    }

    const fullPath = query?.substring(1) || '';
    const hasTrailingSpace = !!query?.endsWith(' ');
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
      const found: SlashCommand | undefined = currentLevel.find(
        (cmd) => matchesCommand(cmd, part),
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

    setIsPerfectMatch(false);
    if (!hasTrailingSpace) {
      if (leafCommand && partial === '' && leafCommand.action) {
        setIsPerfectMatch(true);
      } else if (currentLevel) {
        const perfectMatch = currentLevel.find(
          (cmd) => matchesCommand(cmd, partial) && cmd.action,
        );
        if (perfectMatch) {
          setIsPerfectMatch(true);
        }
      }
    }

    const depth = commandPathParts.length;
    const isArgumentCompletion =
      leafCommand?.completion &&
      (hasTrailingSpace ||
        (rawParts.length > depth && depth > 0 && partial !== ''));

    if (hasTrailingSpace || exactMatchAsParent) {
      setCompletionStart(query.length);
      setCompletionEnd(query.length);
    } else if (partial) {
      if (isArgumentCompletion) {
        const commandSoFar = `/${commandPathParts.join(' ')}`;
        const argStartIndex =
          commandSoFar.length + (commandPathParts.length > 0 ? 1 : 0);
        setCompletionStart(argStartIndex);
      } else {
        setCompletionStart(query.length - partial.length);
      }
      setCompletionEnd(query.length);
    } else {
      setCompletionStart(1);
      setCompletionEnd(query.length);
    }

    if (isArgumentCompletion) {
      const fetchAndSetSuggestions = async () => {
        setIsLoadingSuggestions(true);
        const argString = rawParts.slice(depth).join(' ');
        const results =
          (await leafCommand!.completion!(commandContext, argString)) || [];
        const finalSuggestions = results.map((s) => ({ label: s, value: s }));
        setSuggestions(finalSuggestions);
        setIsLoadingSuggestions(false);
      };
      fetchAndSetSuggestions();
      return;
    }

    const commandsToSearch = currentLevel || [];
    if (commandsToSearch.length > 0) {
      const performFuzzySearch = async () => {
        let potentialSuggestions: SlashCommand[] = [];
        
        if (partial === '') {
          // If no partial query, show all available commands
          potentialSuggestions = commandsToSearch.filter((cmd) => cmd.description);
        } else {
          // Use fuzzy search for non-empty partial queries with fallback
          const fzfInstance = getFzfForCommands(commandsToSearch);
          if (fzfInstance) {
            try {
              const fzfResults = await fzfInstance.fzf.find(partial);
              const uniqueCommands = new Set<SlashCommand>();
              fzfResults.forEach((result: FzfCommandResult) => {
                const cmd = fzfInstance.commandMap.get(result.item);
                if (cmd && cmd.description) {
                  uniqueCommands.add(cmd);
                }
              });
              potentialSuggestions = Array.from(uniqueCommands);
              
              // If fuzzy search returns no results, fallback to prefix matching
              if (potentialSuggestions.length === 0) {
                potentialSuggestions = getPrefixSuggestions(commandsToSearch, partial);
              }
            } catch (error) {
              console.warn('Fuzzy search failed, falling back to prefix matching:', error);
              // Fallback to prefix-based filtering
              potentialSuggestions = getPrefixSuggestions(commandsToSearch, partial);
            }
          } else {
            // Fallback to prefix-based filtering when fzf instance creation fails
            potentialSuggestions = getPrefixSuggestions(commandsToSearch, partial);
          }
        }

        if (potentialSuggestions.length > 0 && !hasTrailingSpace) {
          const perfectMatch = potentialSuggestions.find(
            (s) => matchesCommand(s, partial),
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
      };
      
      performFuzzySearch().catch((error) => {
        console.error('Unexpected error in fuzzy search:', error);
        // Ultimate fallback: show all commands with descriptions
        const fallbackSuggestions = commandsToSearch
          .filter((cmd) => cmd.description)
          .map((cmd) => ({
            label: cmd.name,
            value: cmd.name,
            description: cmd.description,
          }));
        setSuggestions(fallbackSuggestions);
      });
      return;
    }

    setSuggestions([]);
  }, [
    enabled,
    query,
    slashCommands,
    commandContext,
    setSuggestions,
    setIsLoadingSuggestions,
    setIsPerfectMatch,
    getFzfForCommands,
    getPrefixSuggestions,
    matchesCommand,
  ]);

  return {
    completionStart,
    completionEnd,
  };
}
