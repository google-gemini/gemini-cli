/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback } from 'react';
import { Text, Box, useInput, useStdin } from 'ink';
import { Colors } from '../colors.js';
import { SuggestionsDisplay } from './SuggestionsDisplay.js';
import { useInputHistory } from '../hooks/useInputHistory.js';
import { useTextBuffer, cpSlice, cpLen } from './shared/text-buffer.js';
import chalk from 'chalk';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import stringWidth from 'string-width';
import process from 'node:process';
import { useCompletion } from '../hooks/useCompletion.js';
import { isAtCommand, isSlashCommand } from '../utils/commandUtils.js';
import { SlashCommand } from '../hooks/slashCommandProcessor.js';
import { Config } from '@gemini-code/server';

interface InputPromptProps {
  onSubmit: (value: string) => void;
  userMessages: readonly string[];
  onClearScreen: () => void;
  config: Config; // Added config for useCompletion
  slashCommands: SlashCommand[]; // Added slashCommands for useCompletion
  placeholder?: string;
  height?: number; // Visible height of the editor area
  focus?: boolean;
  widthFraction: number;
  shellModeActive: boolean;
  setShellModeActive: (value: boolean) => void;
}

export const InputPrompt: React.FC<InputPromptProps> = ({
  onSubmit,
  userMessages,
  onClearScreen,
  config,
  slashCommands,
  placeholder = 'Type your message or @path/to/file',
  height = 10,
  focus = true,
  widthFraction,
  shellModeActive,
  setShellModeActive,
}) => {
  const terminalSize = useTerminalSize();
  const padding = 3;
  const effectiveWidth = Math.max(
    20,
    Math.round(terminalSize.columns * widthFraction) - padding,
  );
  const suggestionsWidth = Math.max(60, Math.floor(terminalSize.columns * 0.8));

  const { stdin, setRawMode } = useStdin();

  const buffer = useTextBuffer({
    initialText: '',
    viewport: { height, width: effectiveWidth },
    stdin,
    setRawMode,
  });

  const completion = useCompletion(
    buffer.text,
    config.getTargetDir(),
    isAtCommand(buffer.text) || isSlashCommand(buffer.text),
    slashCommands,
  );

  const resetCompletionState = completion.resetCompletionState;

  const handleSubmitAndClear = useCallback(
    (submittedValue: string) => {
      onSubmit(submittedValue);
      buffer.setText('');
      resetCompletionState();
    },
    [onSubmit, buffer, resetCompletionState],
  );

  const onChangeAndMoveCursor = useCallback(
    (newValue: string) => {
      buffer.setText(newValue);
      buffer.move('end');
    },
    [buffer],
  );

  const inputHistory = useInputHistory({
    userMessages,
    onSubmit: handleSubmitAndClear,
    isActive: !completion.showSuggestions,
    currentQuery: buffer.text,
    onChangeAndMoveCursor,
  });

  const completionSuggestions = completion.suggestions;
  const handleAutocomplete = useCallback(
    (indexToUse: number) => {
      if (indexToUse < 0 || indexToUse >= completionSuggestions.length) {
        return;
      }
      const query = buffer.text;
      const selectedSuggestion = completionSuggestions[indexToUse];

      if (query.trimStart().startsWith('/')) {
        const slashIndex = query.indexOf('/');
        const base = query.substring(0, slashIndex + 1);
        const newValue = base + selectedSuggestion.value;
        buffer.setText(newValue);
        handleSubmitAndClear(newValue);
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
          selectedSuggestion.value,
        );
      }
      resetCompletionState();
    },
    [resetCompletionState, handleSubmitAndClear, buffer, completionSuggestions],
  );

  useInput(
    (input, key) => {
      if (!focus) {
        return;
      }
      const query = buffer.text;

      if (input === '!' && query === '' && !completion.showSuggestions) {
        setShellModeActive(!shellModeActive);
        buffer.setText(''); // Clear the '!' from input
        return true;
      }

      if (completion.showSuggestions) {
        if (key.upArrow) {
          completion.navigateUp();
          return;
        }
        if (key.downArrow) {
          completion.navigateDown();
          return;
        }
        if (key.tab) {
          if (completion.suggestions.length > 0) {
            const targetIndex =
              completion.activeSuggestionIndex === -1
                ? 0
                : completion.activeSuggestionIndex;
            if (targetIndex < completion.suggestions.length) {
              handleAutocomplete(targetIndex);
            }
          }
          return;
        }
        if (key.return) {
          if (completion.activeSuggestionIndex >= 0) {
            handleAutocomplete(completion.activeSuggestionIndex);
          } else if (query.trim()) {
            handleSubmitAndClear(query);
          }
          return;
        }
      } else {
        // Keybindings when suggestions are not shown
        if (key.ctrl && input === 'l') {
          onClearScreen();
          return true;
        }
        if (key.ctrl && input === 'p') {
          inputHistory.navigateUp();
          return true;
        }
        if (key.ctrl && input === 'n') {
          inputHistory.navigateDown();
          return true;
        }
        if (key.escape) {
          if (shellModeActive) {
            setShellModeActive(false);
            return;
          }
          completion.resetCompletionState();
          return;
        }
      }

      // Ctrl+A (Home)
      if (key.ctrl && input === 'a') {
        buffer.move('home');
        buffer.moveToOffset(0);
        return;
      }
      // Ctrl+E (End)
      if (key.ctrl && input === 'e') {
        buffer.move('end');
        buffer.moveToOffset(cpLen(buffer.text));
        return;
      }
      // Ctrl+L (Clear Screen)
      if (key.ctrl && input === 'l') {
        onClearScreen();
        return;
      }
      // Ctrl+P (History Up)
      if (key.ctrl && input === 'p' && !completion.showSuggestions) {
        inputHistory.navigateUp();
        return;
      }
      // Ctrl+N (History Down)
      if (key.ctrl && input === 'n' && !completion.showSuggestions) {
        inputHistory.navigateDown();
        return;
      }

      // Core text editing from MultilineTextEditor's useInput
      if (key.ctrl && input === 'k') {
        buffer.killLineRight();
        return;
      }
      if (key.ctrl && input === 'u') {
        buffer.killLineLeft();
        return;
      }
      const isCtrlX =
        (key.ctrl && (input === 'x' || input === '\x18')) || input === '\x18';
      const isCtrlEFromEditor =
        (key.ctrl && (input === 'e' || input === '\x05')) ||
        input === '\x05' ||
        (!key.ctrl &&
          input === 'e' &&
          input.length === 1 &&
          input.charCodeAt(0) === 5);

      if (isCtrlX || isCtrlEFromEditor) {
        if (isCtrlEFromEditor && !(key.ctrl && input === 'e')) {
          // Avoid double handling Ctrl+E
          buffer.openInExternalEditor();
          return;
        }
        if (isCtrlX) {
          buffer.openInExternalEditor();
          return;
        }
      }

      if (
        process.env['TEXTBUFFER_DEBUG'] === '1' ||
        process.env['TEXTBUFFER_DEBUG'] === 'true'
      ) {
        console.log('[InputPromptCombined] event', { input, key });
      }

      // Ctrl+Enter for newline, Enter for submit
      if (key.return) {
        if (key.ctrl) {
          // Ctrl+Enter for newline
          buffer.newline();
        } else {
          // Enter for submit
          if (query.trim()) {
            handleSubmitAndClear(query);
          }
        }
        return;
      }

      // Standard arrow navigation within the buffer
      if (key.upArrow && !completion.showSuggestions) {
        if (
          buffer.visualCursor[0] === 0 &&
          buffer.visualScrollRow === 0 &&
          inputHistory.navigateUp
        ) {
          inputHistory.navigateUp();
        } else {
          buffer.move('up');
        }
        return;
      }
      if (key.downArrow && !completion.showSuggestions) {
        if (
          buffer.visualCursor[0] === buffer.allVisualLines.length - 1 &&
          inputHistory.navigateDown
        ) {
          inputHistory.navigateDown();
        } else {
          buffer.move('down');
        }
        return;
      }

      // Fallback to buffer's default input handling
      buffer.handleInput(input, key as Record<string, boolean>);
    },
    {
      isActive: focus,
    },
  );

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
            <Text color={Colors.SubtleComment}>{placeholder}</Text>
          ) : (
            linesToRender.map((lineText, visualIdxInRenderedSet) => {
              const cursorVisualRow = cursorVisualRowAbsolute - scrollVisualRow;
              let display = cpSlice(lineText, 0, effectiveWidth);
              const currentVisualWidth = stringWidth(display);
              if (currentVisualWidth < effectiveWidth) {
                display =
                  display + ' '.repeat(effectiveWidth - currentVisualWidth);
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
                    cpLen(display) === effectiveWidth
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
