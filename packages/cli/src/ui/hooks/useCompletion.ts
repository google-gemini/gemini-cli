/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  MAX_SUGGESTIONS_TO_SHOW,
  Suggestion,
} from '../components/SuggestionsDisplay.js';
import { CommandContext, SlashCommand } from '../commands/types.js';
import {
  logicalPosToOffset,
  TextBuffer,
} from '../components/shared/text-buffer.js';
import { isSlashCommand } from '../utils/commandUtils.js';
import { toCodePoints } from '../utils/textUtils.js';
import { useAtCompletion } from './useAtCompletion.js';
import { useSlashCompletion } from './useSlashCompletion.js';
import { Config } from '@google/gemini-cli-core';

export enum CompletionMode {
  IDLE = 'IDLE',
  AT = 'AT',
  SLASH = 'SLASH',
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
  dirs: readonly string[],
  cwd: string,
  slashCommands: readonly SlashCommand[],
  commandContext: CommandContext,
  config?: Config,
): UseCompletionReturn {
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState<number>(-1);
  const [visibleStartIndex, setVisibleStartIndex] = useState<number>(0);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);

  const cursorRow = buffer.cursor[0];
  const cursorCol = buffer.cursor[1];

  const { completionMode, query, completionStart, completionEnd } = useMemo(() => {
    const currentLine = buffer.lines[cursorRow] || '';
    if (cursorRow === 0 && isSlashCommand(currentLine.trim())) {
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
          return { completionMode: CompletionMode.IDLE, query: null, completionStart: -1, completionEnd: -1 };
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
    return { completionMode: CompletionMode.IDLE, query: null, completionStart: -1, completionEnd: -1 };
  }, [cursorRow, cursorCol, buffer.lines]);

  const atCompletion = useAtCompletion(
    completionMode === CompletionMode.AT,
    query || '',
    config,
    cwd,
  );
  const slashCompletion = useSlashCompletion(
    completionMode === CompletionMode.SLASH,
    query,
    slashCommands,
    commandContext,
  );

  const activeCompletion = useMemo(() => {
    if (completionMode === CompletionMode.AT) {
      return {...atCompletion, isPerfectMatch: false};
    }
    if (completionMode === CompletionMode.SLASH) {
      return slashCompletion;
    }
    return {
      suggestions: [],
      isLoadingSuggestions: false,
      isPerfectMatch: false,
    };
  }, [completionMode, atCompletion, slashCompletion]);

  const { suggestions, isLoadingSuggestions, isPerfectMatch } = activeCompletion;

  const resetCompletionState = useCallback(() => {
    setActiveSuggestionIndex(-1);
    setVisibleStartIndex(0);
    setShowSuggestions(false);
  }, []);

  useEffect(() => {
    setActiveSuggestionIndex(suggestions.length > 0 ? 0 : -1);
    setVisibleStartIndex(0);
  }, [suggestions]);

  useEffect(() => {
    if (completionMode === CompletionMode.IDLE) {
      resetCompletionState();
      return;
    }
    // Show suggestions if we are loading OR if there are results to display.
    setShowSuggestions(isLoadingSuggestions || suggestions.length > 0);
  }, [completionMode, suggestions.length, isLoadingSuggestions, resetCompletionState]);

  const navigateUp = useCallback(() => {
    if (suggestions.length === 0) return;

    setActiveSuggestionIndex((prevActiveIndex) => {
      const newActiveIndex =
        prevActiveIndex <= 0 ? suggestions.length - 1 : prevActiveIndex - 1;

      setVisibleStartIndex((prevVisibleStart) => {
        if (
          newActiveIndex === suggestions.length - 1 &&
          suggestions.length > MAX_SUGGESTIONS_TO_SHOW
        ) {
          return Math.max(0, suggestions.length - MAX_SUGGESTIONS_TO_SHOW);
        }
        if (newActiveIndex < prevVisibleStart) {
          return newActiveIndex;
        }
        return prevVisibleStart;
      });

      return newActiveIndex;
    });
  }, [suggestions.length]);

  const navigateDown = useCallback(() => {
    if (suggestions.length === 0) return;

    setActiveSuggestionIndex((prevActiveIndex) => {
      const newActiveIndex =
        prevActiveIndex >= suggestions.length - 1 ? 0 : prevActiveIndex + 1;

      setVisibleStartIndex((prevVisibleStart) => {
        if (
          newActiveIndex === 0 &&
          suggestions.length > MAX_SUGGESTIONS_TO_SHOW
        ) {
          return 0;
        }
        const visibleEndIndex = prevVisibleStart + MAX_SUGGESTIONS_TO_SHOW;
        if (newActiveIndex >= visibleEndIndex) {
          return newActiveIndex - MAX_SUGGESTIONS_TO_SHOW + 1;
        }
        return prevVisibleStart;
      });

      return newActiveIndex;
    });
  }, [suggestions.length]);

  const handleAutocomplete = useCallback(
    (indexToUse: number) => {
      if (indexToUse < 0 || indexToUse >= suggestions.length) {
        return;
      }
      const suggestion = suggestions[indexToUse].value;

      let start = completionStart;
      let end = completionEnd;
      if (completionMode === CompletionMode.SLASH) {
        start = slashCompletion.completionStart;
        end = slashCompletion.completionEnd;
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
        suggestionText += ' ';
      }

      buffer.replaceRangeByOffset(
        logicalPosToOffset(buffer.lines, cursorRow, start),
        logicalPosToOffset(buffer.lines, cursorRow, end),
        suggestionText,
      );
      resetCompletionState();
    },
    [
      cursorRow,
      resetCompletionState,
      buffer,
      suggestions,
      completionMode,
      completionStart,
      completionEnd,
      slashCompletion.completionStart,
      slashCompletion.completionEnd,
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
  };
}
