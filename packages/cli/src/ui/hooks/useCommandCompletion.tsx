/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useMemo, useEffect } from 'react';
import type { Suggestion } from '../components/SuggestionsDisplay.js';
import { type CommandContext, type SlashCommand, CommandKind } from '../commands/types.js';
import {
  logicalPosToOffset,
  type TextBuffer,
} from '../components/shared/text-buffer.js';
import { isSlashCommand } from '../utils/commandUtils.js';
import { toCodePoints } from '../utils/textUtils.js';
import { useAtCompletion } from './useAtCompletion.js';
import { useSlashCompletion } from './useSlashCompletion.js';
import type { PromptCompletion } from './usePromptCompletion.js';
import {
  usePromptCompletion,
  PROMPT_COMPLETION_MIN_LENGTH,
} from './usePromptCompletion.js';
import type { Config } from '@google/gemini-cli-core';
import { useCompletion } from './useCompletion.js';

export enum CompletionMode {
  IDLE = 'IDLE',
  AT = 'AT',
  SLASH = 'SLASH',
  PROMPT = 'PROMPT',
}

export interface UseCommandCompletionReturn {
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
  promptCompletion: PromptCompletion;
  completionMode: CompletionMode;
}

export function useCommandCompletion(
  buffer: TextBuffer,
  dirs: readonly string[],
  cwd: string,
  slashCommands: readonly SlashCommand[],
  commandContext: CommandContext,
  reverseSearchActive: boolean = false,
  config?: Config,
): UseCommandCompletionReturn {
  const {
    suggestions,
    activeSuggestionIndex,
    visibleStartIndex,
    showSuggestions,
    isLoadingSuggestions,
    isPerfectMatch,

    setSuggestions,
    setShowSuggestions,
    setActiveSuggestionIndex,
    setIsLoadingSuggestions,
    setIsPerfectMatch,
    setVisibleStartIndex,

    resetCompletionState,
    navigateUp,
    navigateDown,
  } = useCompletion();

  const cursorRow = buffer.cursor[0];
  const cursorCol = buffer.cursor[1];

  // Memoized map for O(1) command lookups
  const slashCommandMap = useMemo(() => {
    const map = new Map<string, SlashCommand>();
    for (const cmd of slashCommands) {
      map.set(cmd.name, cmd);
      cmd.altNames?.forEach(alt => map.set(alt, cmd));
    }
    return map;
  }, [slashCommands]);

  // Helper function to check if a command is a custom command (from .toml files)
  const isCustomCommand = useCallback((commandLine: string): boolean => {
    if (!isSlashCommand(commandLine)) return false;
    
    // Extract command name with robust regex parsing
    const match = commandLine.trim().match(/^\/([^\s]+)/);
    const commandName = match ? match[1] : '';
    if (!commandName) return false;
    
    // O(1) lookup in memoized map
    const command = slashCommandMap.get(commandName);
    return command?.kind === CommandKind.FILE;
  }, [slashCommandMap]);

  const { completionMode, query, completionStart, completionEnd } =
    useMemo(() => {
      const currentLine = buffer.lines[cursorRow] || '';
      
      // Determine command type once at the beginning for efficiency
      const isSlashCmd = cursorRow === 0 && isSlashCommand(currentLine.trim());
      const isCustomCmd = isSlashCmd && isCustomCommand(currentLine.trim());
      
      if (isSlashCmd && !isCustomCmd) {
        // Built-in commands: return SLASH mode immediately (preserve existing behavior)
        return {
          completionMode: CompletionMode.SLASH,
          query: currentLine,
          completionStart: 0,
          completionEnd: currentLine.length,
        };
      }

      const codePoints = toCodePoints(currentLine);
      for (let i = cursorCol - 1; i >= 0; i--) {
        const char = codePoints[i];

        if (char === ' ') {
          let backslashCount = 0;
          for (let j = i - 1; j >= 0 && codePoints[j] === '\\'; j--) {
            backslashCount++;
          }
          if (backslashCount % 2 === 0) {
            break;
          }
        } else if (char === '@') {
          let end = codePoints.length;
          for (let i = cursorCol; i < codePoints.length; i++) {
            if (codePoints[i] === ' ') {
              let backslashCount = 0;
              for (let j = i - 1; j >= 0 && codePoints[j] === '\\'; j--) {
                backslashCount++;
              }

              if (backslashCount % 2 === 0) {
                end = i;
                break;
              }
            }
          }
          const pathStart = i + 1;
          const partialPath = currentLine.substring(pathStart, end);
          return {
            completionMode: CompletionMode.AT,
            query: partialPath,
            completionStart: pathStart,
            completionEnd: end,
          };
        }
      }

      // Check for prompt completion - only if enabled
      const trimmedText = buffer.text.trim();
      const isPromptCompletionEnabled =
        config?.getEnablePromptCompletion() ?? false;

      if (
        isPromptCompletionEnabled &&
        trimmedText.length >= PROMPT_COMPLETION_MIN_LENGTH &&
        !isSlashCommand(trimmedText) &&
        !trimmedText.includes('@')
      ) {
        return {
          completionMode: CompletionMode.PROMPT,
          query: trimmedText,
          completionStart: 0,
          completionEnd: trimmedText.length,
        };
      }

      // Check if this is a custom command that didn't match @ completion
      if (isCustomCmd) {
        return {
          completionMode: CompletionMode.SLASH,
          query: currentLine,
          completionStart: 0,
          completionEnd: currentLine.length,
        };
      }

      return {
        completionMode: CompletionMode.IDLE,
        query: null,
        completionStart: -1,
        completionEnd: -1,
      };
    }, [cursorRow, cursorCol, buffer.lines, buffer.text, config, isCustomCommand]);

  useAtCompletion({
    enabled: completionMode === CompletionMode.AT,
    pattern: query || '',
    config,
    cwd,
    setSuggestions,
    setIsLoadingSuggestions,
  });

  const slashCompletionRange = useSlashCompletion({
    enabled: completionMode === CompletionMode.SLASH,
    query,
    slashCommands,
    commandContext,
    setSuggestions,
    setIsLoadingSuggestions,
    setIsPerfectMatch,
  });

  const promptCompletion = usePromptCompletion({
    buffer,
    config,
    enabled: completionMode === CompletionMode.PROMPT,
  });

  useEffect(() => {
    setActiveSuggestionIndex(suggestions.length > 0 ? 0 : -1);
    setVisibleStartIndex(0);
  }, [suggestions, setActiveSuggestionIndex, setVisibleStartIndex]);

  useEffect(() => {
    if (completionMode === CompletionMode.IDLE || reverseSearchActive) {
      resetCompletionState();
      return;
    }
    // Show suggestions if we are loading OR if there are results to display.
    setShowSuggestions(isLoadingSuggestions || suggestions.length > 0);
  }, [
    completionMode,
    suggestions.length,
    isLoadingSuggestions,
    reverseSearchActive,
    resetCompletionState,
    setShowSuggestions,
  ]);

  const handleAutocomplete = useCallback(
    (indexToUse: number) => {
      if (indexToUse < 0 || indexToUse >= suggestions.length) {
        return;
      }
      const suggestion = suggestions[indexToUse].value;

      let start = completionStart;
      let end = completionEnd;
      if (completionMode === CompletionMode.SLASH) {
        start = slashCompletionRange.completionStart;
        end = slashCompletionRange.completionEnd;
      }

      if (start === -1 || end === -1) {
        return;
      }

      let suggestionText = suggestion;
      if (completionMode === CompletionMode.SLASH) {
        if (
          start === end &&
          start > 1 &&
          (buffer.lines[cursorRow] || '')[start - 1] !== ' '
        ) {
          suggestionText = ' ' + suggestionText;
        }
      }

      const lineCodePoints = toCodePoints(buffer.lines[cursorRow] || '');
      const charAfterCompletion = lineCodePoints[end];
      if (charAfterCompletion !== ' ') {
        suggestionText += ' ';
      }

      buffer.replaceRangeByOffset(
        logicalPosToOffset(buffer.lines, cursorRow, start),
        logicalPosToOffset(buffer.lines, cursorRow, end),
        suggestionText,
      );
    },
    [
      cursorRow,
      buffer,
      suggestions,
      completionMode,
      completionStart,
      completionEnd,
      slashCompletionRange,
    ],
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
    promptCompletion,
    completionMode,
  };
}
