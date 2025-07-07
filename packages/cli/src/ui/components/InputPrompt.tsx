/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { SuggestionsDisplay } from './SuggestionsDisplay.js';
import { useInputHistory } from '../hooks/useInputHistory.js';
import { TextBuffer } from './shared/text-buffer.js';
import { cpSlice, cpLen } from '../utils/textUtils.js';
import chalk from 'chalk';
import stringWidth from 'string-width';
import { useShellHistory } from '../hooks/useShellHistory.js';
import { useCompletion } from '../hooks/useCompletion.js';
import { useKeypress, Key } from '../hooks/useKeypress.js';
import { isAtCommand, isSlashCommand } from '../utils/commandUtils.js';
import { CommandContext, SlashCommand } from '../commands/types.js';
import { Config } from '@google/gemini-cli-core';

export interface InputPromptProps {
  buffer: TextBuffer;
  onSubmit: (value: string) => void;
  userMessages: readonly string[];
  onClearScreen: () => void;
  config: Config;
  slashCommands: SlashCommand[];
  commandContext: CommandContext;
  placeholder?: string;
  focus?: boolean;
  inputWidth: number;
  suggestionsWidth: number;
  shellModeActive: boolean;
  setShellModeActive: (value: boolean) => void;
}

export const InputPrompt: React.FC<InputPromptProps> = ({
  buffer,
  onSubmit,
  userMessages,
  onClearScreen,
  config,
  slashCommands,
  commandContext,
  placeholder = '  Type your message or @path/to/file',
  focus = true,
  inputWidth,
  suggestionsWidth,
  shellModeActive,
  setShellModeActive,
}) => {
  const [justNavigatedHistory, setJustNavigatedHistory] = useState(false);

  const completion = useCompletion(
    buffer.text,
    config.getTargetDir(),
    isAtCommand(buffer.text) || isSlashCommand(buffer.text),
    slashCommands,
    commandContext,
    config,
  );

  const resetCompletionState = completion.resetCompletionState;
  const shellHistory = useShellHistory(config.getProjectRoot());

  const handleSubmitAndClear = useCallback(
    (submittedValue: string) => {
      if (shellModeActive) {
        shellHistory.addCommandToHistory(submittedValue);
      }
      // Clear the buffer *before* calling onSubmit to prevent potential re-submission
      // if onSubmit triggers a re-render while the buffer still holds the old value.
      buffer.setText('');
      onSubmit(submittedValue);
      resetCompletionState();
    },
    [onSubmit, buffer, resetCompletionState, shellModeActive, shellHistory],
  );

  const customSetTextAndResetCompletionSignal = useCallback(
    (newText: string) => {
      buffer.setText(newText);
      setJustNavigatedHistory(true);
    },
    [buffer, setJustNavigatedHistory],
  );

  const inputHistory = useInputHistory({
    userMessages,
    onSubmit: handleSubmitAndClear,
    isActive: !completion.showSuggestions && !shellModeActive,
    currentQuery: buffer.text,
    onChange: customSetTextAndResetCompletionSignal,
  });

  // Effect to reset completion if history navigation just occurred and set the text
  useEffect(() => {
    if (justNavigatedHistory) {
      resetCompletionState();
      setJustNavigatedHistory(false);
    }
  }, [
    justNavigatedHistory,
    buffer.text,
    resetCompletionState,
    setJustNavigatedHistory,
  ]);

  const completionSuggestions = completion.suggestions;
  const handleAutocomplete = useCallback(
    (indexToUse: number) => {
      if (indexToUse < 0 || indexToUse >= completionSuggestions.length) {
        return;
      }
      const query = buffer.text;
      const suggestion = completionSuggestions[indexToUse].value;

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
          let currentLevel: SlashCommand[] | undefined = slashCommands;
          for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const found: SlashCommand | undefined = currentLevel?.find(
              (cmd) => cmd.name === part || cmd.altName === part,
            );

            if (found) {
              if (i === parts.length - 1 && found.subCommands) {
                isParentPath = true;
              }
              currentLevel = found.subCommands;
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
        // - Otherwise, the base is everything EXCEPT the last partial part.
        const basePath =
          hasTrailingSpace || isParentPath ? parts : parts.slice(0, -1);
        const newValue = `/${[...basePath, suggestion].join(' ')} `;

        buffer.setText(newValue);
      } else {
        const atIndex = query.lastIndexOf('@');
        if (atIndex === -1) return;
        const pathPart = query.substring(atIndex + 1);
        const lastSlashIndexInPath = pathPart.lastIndexOf('/');
        let autoCompleteStartIndex = atIndex + 1;
        if (lastSlashIndexInPath !== -1) {
          autoCompleteStartIndex += lastSlashIndexInPath + 1;
        }
        buffer.replaceRangeByOffset(
          autoCompleteStartIndex,
          buffer.text.length,
          suggestion,
        );
      }
      resetCompletionState();
    },
    [resetCompletionState, buffer, completionSuggestions, slashCommands],
  );

  const handleInput = useCallback(
    (key: Key) => {
      if (!focus) {
        return;
      }

      if (
        key.sequence === '!' &&
        buffer.text === '' &&
        !completion.showSuggestions
      ) {
        setShellModeActive(!shellModeActive);
        buffer.setText(''); // Clear the '!' from input
        return;
      }

      if (key.name === 'escape') {
        if (shellModeActive) {
          setShellModeActive(false);
          return;
        }

        if (completion.showSuggestions) {
          completion.resetCompletionState();
          return;
        }
      }

      if (key.ctrl && key.name === 'l') {
        onClearScreen();
        return;
      }

      if (completion.showSuggestions) {
        if (key.name === 'up') {
          completion.navigateUp();
          return;
        }
        if (key.name === 'down') {
          completion.navigateDown();
          return;
        }

        if (key.name === 'tab' || (key.name === 'return' && !key.ctrl)) {
          if (completion.suggestions.length > 0) {
            const targetIndex =
              completion.activeSuggestionIndex === -1
                ? 0 // Default to the first if none is active
                : completion.activeSuggestionIndex;
            if (targetIndex < completion.suggestions.length) {
              handleAutocomplete(targetIndex);
            }
          }
          return;
        }
      } else {
        if (!shellModeActive) {
          if (key.ctrl && key.name === 'p') {
            inputHistory.navigateUp();
            return;
          }
          if (key.ctrl && key.name === 'n') {
            inputHistory.navigateDown();
            return;
          }
          // Handle arrow-up/down for history on single-line or at edges
          if (
            key.name === 'up' &&
            (buffer.allVisualLines.length === 1 ||
              (buffer.visualCursor[0] === 0 && buffer.visualScrollRow === 0))
          ) {
            inputHistory.navigateUp();
            return;
          }
          if (
            key.name === 'down' &&
            (buffer.allVisualLines.length === 1 ||
              buffer.visualCursor[0] === buffer.allVisualLines.length - 1)
          ) {
            inputHistory.navigateDown();
            return;
          }
        } else {
          // Shell History Navigation
          if (key.name === 'up') {
            const prevCommand = shellHistory.getPreviousCommand();
            if (prevCommand !== null) buffer.setText(prevCommand);
            return;
          }
          if (key.name === 'down') {
            const nextCommand = shellHistory.getNextCommand();
            if (nextCommand !== null) buffer.setText(nextCommand);
            return;
          }
        }

        if (key.name === 'return' && !key.ctrl && !key.meta && !key.paste) {
          if (buffer.text.trim()) {
            handleSubmitAndClear(buffer.text);
          }
          return;
        }
      }

      // Newline insertion
      if (key.name === 'return' && (key.ctrl || key.meta || key.paste)) {
        buffer.newline();
        return;
      }

      // Ctrl+A (Home) / Ctrl+E (End)
      if (key.ctrl && key.name === 'a') {
        buffer.move('home');
        return;
      }
      if (key.ctrl && key.name === 'e') {
        buffer.move('end');
        return;
      }

      // Kill line commands
      if (key.ctrl && key.name === 'k') {
        buffer.killLineRight();
        return;
      }
      if (key.ctrl && key.name === 'u') {
        buffer.killLineLeft();
        return;
      }

      // External editor
      const isCtrlX = key.ctrl && (key.name === 'x' || key.sequence === '\x18');
      if (isCtrlX) {
        buffer.openInExternalEditor();
        return;
      }

      // Fallback to the text buffer's default input handling for all other keys
      buffer.handleInput(key);
    },
    [
      focus,
      buffer,
      completion,
      shellModeActive,
      setShellModeActive,
      onClearScreen,
      inputHistory,
      handleAutocomplete,
      handleSubmitAndClear,
      shellHistory,
    ],
  );

  useKeypress(handleInput, { isActive: focus });

  const linesToRender = buffer.viewportVisualLines;
  const [cursorVisualRowAbsolute, cursorVisualColAbsolute] =
    buffer.visualCursor;
  const scrollVisualRow = buffer.visualScrollRow;

  return (
    <>
      <Box
        borderStyle="round"
        borderColor={shellModeActive ? Colors.AccentYellow : Colors.AccentBlue}
        paddingX={1}
      >
        <Text
          color={shellModeActive ? Colors.AccentYellow : Colors.AccentPurple}
        >
          {shellModeActive ? '! ' : '> '}
        </Text>
        <Box flexGrow={1} flexDirection="column">
          {buffer.text.length === 0 && placeholder ? (
            focus ? (
              <Text>
                {chalk.inverse(placeholder.slice(0, 1))}
                <Text color={Colors.Gray}>{placeholder.slice(1)}</Text>
              </Text>
            ) : (
              <Text color={Colors.Gray}>{placeholder}</Text>
            )
          ) : (
            linesToRender.map((lineText, visualIdxInRenderedSet) => {
              const cursorVisualRow = cursorVisualRowAbsolute - scrollVisualRow;
              let display = cpSlice(lineText, 0, inputWidth);
              const currentVisualWidth = stringWidth(display);
              if (currentVisualWidth < inputWidth) {
                display = display + ' '.repeat(inputWidth - currentVisualWidth);
              }

              if (visualIdxInRenderedSet === cursorVisualRow) {
                const relativeVisualColForHighlight = cursorVisualColAbsolute;
                if (relativeVisualColForHighlight >= 0) {
                  if (relativeVisualColForHighlight < cpLen(display)) {
                    const charToHighlight =
                      cpSlice(
                        display,
                        relativeVisualColForHighlight,
                        relativeVisualColForHighlight + 1,
                      ) || ' ';
                    const highlighted = chalk.inverse(charToHighlight);
                    display =
                      cpSlice(display, 0, relativeVisualColForHighlight) +
                      highlighted +
                      cpSlice(display, relativeVisualColForHighlight + 1);
                  } else if (
                    relativeVisualColForHighlight === cpLen(display) &&
                    cpLen(display) === inputWidth
                  ) {
                    display = display + chalk.inverse(' ');
                  }
                }
              }
              return (
                <Text key={`line-${visualIdxInRenderedSet}`}>{display}</Text>
              );
            })
          )}
        </Box>
      </Box>
      {completion.showSuggestions && (
        <Box>
          <SuggestionsDisplay
            suggestions={completion.suggestions}
            activeIndex={completion.activeSuggestionIndex}
            isLoading={completion.isLoadingSuggestions}
            width={suggestionsWidth}
            scrollOffset={completion.visibleStartIndex}
            userInput={buffer.text}
          />
        </Box>
      )}
    </>
  );
};
