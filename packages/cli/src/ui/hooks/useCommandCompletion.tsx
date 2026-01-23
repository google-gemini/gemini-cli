/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useMemo, useEffect } from 'react';
import type { Suggestion } from '../components/SuggestionsDisplay.js';
import type { CommandContext, SlashCommand } from '../commands/types.js';
import type { TextBuffer } from '../components/shared/text-buffer.js';
import { logicalPosToOffset } from '../components/shared/text-buffer.js';
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
  getCommandFromSuggestion: (
    suggestion: Suggestion,
  ) => SlashCommand | undefined;
  slashCompletionRange: {
    completionStart: number;
    completionEnd: number;
    getCommandFromSuggestion: (
      suggestion: Suggestion,
    ) => SlashCommand | undefined;
    isArgumentCompletion: boolean;
    leafCommand: SlashCommand | null;
  };
  getCompletedText: (suggestion: Suggestion) => string | null;
  completionMode: CompletionMode;
}

export function useCommandCompletion(
  buffer: TextBuffer,
  cwd: string,
  slashCommands: readonly SlashCommand[],
  commandContext: CommandContext,
  reverseSearchActive: boolean = false,
  shellModeActive: boolean,
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

  const { completionMode, query, completionStart, completionEnd } =
    useMemo(() => {
      const currentLine = buffer.lines[cursorRow] || '';
      const codePoints = toCodePoints(currentLine);

      // FIRST: Check for @ completion (scan backwards from cursor)
      // This must happen before slash command check so that `/cmd @file`
      // triggers file completion, not just slash command completion.
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

      // THEN: Check for slash command (only if no @ completion is active)
      if (cursorRow === 0 && isSlashCommand(currentLine.trim())) {
        return {
          completionMode: CompletionMode.SLASH,
          query: currentLine,
          completionStart: 0,
          completionEnd: currentLine.length,
        };
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

      return {
        completionMode: CompletionMode.IDLE,
        query: null,
        completionStart: -1,
        completionEnd: -1,
      };
    }, [cursorRow, cursorCol, buffer.lines, buffer.text, config]);

  useAtCompletion({
    enabled: completionMode === CompletionMode.AT,
    pattern: query || '',
    config,
    cwd,
    setSuggestions,
    setIsLoadingSuggestions,
  });

  const slashCompletionRange = useSlashCompletion({
    enabled: completionMode === CompletionMode.SLASH && !shellModeActive,
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

  /**
   * Gets the completed text by replacing the completion range with the suggestion value.
   * This is the core string replacement logic used by both autocomplete and auto-execute.
   *
   * @param suggestion The suggestion to apply
   * @returns The completed text with the suggestion applied, or null if invalid
   */
  const getCompletedText = useCallback(
    (suggestion: Suggestion): string | null => {
      const currentLine = buffer.lines[cursorRow] || '';

      let start = completionStart;
      let end = completionEnd;
      if (completionMode === CompletionMode.SLASH) {
        start = slashCompletionRange.completionStart;
        end = slashCompletionRange.completionEnd;
      }

      if (start === -1 || end === -1) {
        return null;
      }

      // Apply space padding for slash commands (needed for subcommands like "/chat list")
      let suggestionText = suggestion.value;
      if (completionMode === CompletionMode.SLASH) {
        // Add leading space if completing a subcommand (cursor is after parent command with no space)
        if (start === end && start > 1 && currentLine[start - 1] !== ' ') {
          suggestionText = ' ' + suggestionText;
        }
      }

      // Build the completed text with proper spacing
      return (
        currentLine.substring(0, start) +
        suggestionText +
        currentLine.substring(end)
      );
    },
    [
      cursorRow,
      buffer.lines,
      completionMode,
      completionStart,
      completionEnd,
      slashCompletionRange,
    ],
  );

  const handleAutocomplete = useCallback(
    (indexToUse: number) => {
      if (indexToUse < 0 || indexToUse >= suggestions.length) {
        return;
      }
      const suggestion = suggestions[indexToUse];
      const completedText = getCompletedText(suggestion);

      if (completedText === null) {
        return;
      }

      let start = completionStart;
      let end = completionEnd;
      if (completionMode === CompletionMode.SLASH) {
        start = slashCompletionRange.completionStart;
        end = slashCompletionRange.completionEnd;
      }

      // Add space padding for Tab completion (auto-execute gets padding from getCompletedText)
      let suggestionText = suggestion.value;
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
      if (
        charAfterCompletion !== ' ' &&
        !suggestionText.endsWith('/') &&
        !suggestionText.endsWith('\\')
      ) {
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
      getCompletedText,
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
    getCommandFromSuggestion: slashCompletionRange.getCommandFromSuggestion,
    slashCompletionRange,
    getCompletedText,
    completionMode,
  };
}
