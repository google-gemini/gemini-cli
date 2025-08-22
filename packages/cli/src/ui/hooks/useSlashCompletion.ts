/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Suggestion } from '../components/SuggestionsDisplay.js';
import { CommandContext, SlashCommand } from '../commands/types.js';

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
        (cmd) => cmd.name === part || cmd.altNames?.includes(part),
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
        (cmd) =>
          (cmd.name === partial || cmd.altNames?.includes(partial)) &&
          cmd.subCommands,
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
      let potentialSuggestions = commandsToSearch.filter(
        (cmd) =>
          cmd.description &&
          (cmd.name.startsWith(partial) ||
            cmd.altNames?.some((alt) => alt.startsWith(partial))),
      );

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
  ]);

  return {
    completionStart,
    completionEnd,
  };
}
