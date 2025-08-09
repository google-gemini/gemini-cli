/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { SuggestionsDisplay } from './SuggestionsDisplay.js';
import { useInputHistory } from '../hooks/useInputHistory.js';
import { TextBuffer, logicalPosToOffset } from './shared/text-buffer.js';
import { cpSlice, cpLen } from '../utils/textUtils.js';
import chalk from 'chalk';
import stringWidth from 'string-width';
import { useShellHistory } from '../hooks/useShellHistory.js';
import { useReverseSearchCompletion } from '../hooks/useReverseSearchCompletion.js';
import { useCommandCompletion } from '../hooks/useCommandCompletion.js';
import { useKeypress, Key } from '../hooks/useKeypress.js';
import { keyMatchers, Command } from '../keyMatchers.js';
import { CommandContext, SlashCommand } from '../commands/types.js';
import { Config } from '@google/gemini-cli-core';
import {
  clipboardHasImage,
  saveClipboardImage,
  cleanupOldClipboardImages,
} from '../utils/clipboardUtils.js';
import * as path from 'path';

export interface InputPromptProps {
  buffer: TextBuffer;
  onSubmit: (value: string) => void;
  userMessages: readonly string[];
  onClearScreen: () => void;
  config: Config;
  slashCommands: readonly SlashCommand[];
  commandContext: CommandContext;
  placeholder?: string;
  focus?: boolean;
  inputWidth: number;
  suggestionsWidth: number;
  shellModeActive: boolean;
  setShellModeActive: (value: boolean) => void;
  vimHandleInput?: (key: Key) => boolean;
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
  vimHandleInput,
}) => {
  const [justNavigatedHistory, setJustNavigatedHistory] = useState(false);

  const [dirs, setDirs] = useState<readonly string[]>(
    config.getWorkspaceContext().getDirectories(),
  );
  const dirsChanged = config.getWorkspaceContext().getDirectories();
  useEffect(() => {
    if (dirs.length !== dirsChanged.length) {
      setDirs(dirsChanged);
    }
  }, [dirs.length, dirsChanged]);
  const [reverseSearchActive, setReverseSearchActive] = useState(false);
  const [textBeforeReverseSearch, setTextBeforeReverseSearch] = useState('');
  const [cursorPosition, setCursorPosition] = useState<[number, number]>([
    0, 0,
  ]);
  const shellHistory = useShellHistory(config.getProjectRoot());
  const historyData = shellHistory.history;

  const completion = useCommandCompletion(
    buffer,
    dirs,
    config.getTargetDir(),
    slashCommands,
    commandContext,
    reverseSearchActive,
    config,
  );

  const reverseSearchCompletion = useReverseSearchCompletion(
    buffer,
    historyData,
    reverseSearchActive,
  );
  const resetCompletionState = completion.resetCompletionState;
  const resetReverseSearchCompletionState =
    reverseSearchCompletion.resetCompletionState;

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
      resetReverseSearchCompletionState();
    },
    [
      onSubmit,
      buffer,
      resetCompletionState,
      shellModeActive,
      shellHistory,
      resetReverseSearchCompletionState,
    ],
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
    isActive:
      (!completion.showSuggestions || completion.suggestions.length === 1) &&
      !shellModeActive,
    currentQuery: buffer.text,
    onChange: customSetTextAndResetCompletionSignal,
  });

  // Effect to reset completion if history navigation just occurred and set the text
  useEffect(() => {
    if (justNavigatedHistory) {
      resetCompletionState();
      resetReverseSearchCompletionState();
      setJustNavigatedHistory(false);
    }
  }, [
    justNavigatedHistory,
    buffer.text,
    resetCompletionState,
    setJustNavigatedHistory,
    resetReverseSearchCompletionState,
  ]);

  // Handle clipboard image pasting with Ctrl+V
  const handleClipboardImage = useCallback(async () => {
    try {
      if (await clipboardHasImage()) {
        const imagePath = await saveClipboardImage(config.getTargetDir());
        if (imagePath) {
          // Clean up old images
          cleanupOldClipboardImages(config.getTargetDir()).catch(() => {
            // Ignore cleanup errors
          });

          // Get relative path from current directory
          const relativePath = path.relative(config.getTargetDir(), imagePath);

          // Insert @path reference at cursor position
          const insertText = `@${relativePath}`;
          const currentText = buffer.text;
          const [row, col] = buffer.cursor;

          // Calculate offset from row/col
          let offset = 0;
          for (let i = 0; i < row; i++) {
            offset += buffer.lines[i].length + 1; // +1 for newline
          }
          offset += col;

          // Add spaces around the path if needed
          let textToInsert = insertText;
          const charBefore = offset > 0 ? currentText[offset - 1] : '';
          const charAfter =
            offset < currentText.length ? currentText[offset] : '';

          if (charBefore && charBefore !== ' ' && charBefore !== '\n') {
            textToInsert = ' ' + textToInsert;
          }
          if (!charAfter || (charAfter !== ' ' && charAfter !== '\n')) {
            textToInsert = textToInsert + ' ';
          }

          // Insert at cursor position
          buffer.replaceRangeByOffset(offset, offset, textToInsert);
        }
      }
    } catch (error) {
      console.error('Error handling clipboard image:', error);
    }
  }, [buffer, config]);

  const handleInput = useCallback(
    (key: Key) => {
      /// We want to handle paste even when not focused to support drag and drop.
      if (!focus && !key.paste) {
        return;
      }

      if (vimHandleInput && vimHandleInput(key)) {
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

      if (keyMatchers[Command.ESCAPE](key)) {
        if (reverseSearchActive) {
          setReverseSearchActive(false);
          reverseSearchCompletion.resetCompletionState();
          buffer.setText(textBeforeReverseSearch);
          const offset = logicalPosToOffset(
            buffer.lines,
            cursorPosition[0],
            cursorPosition[1],
          );
          buffer.moveToOffset(offset);
          return;
        }
        if (shellModeActive) {
          setShellModeActive(false);
          return;
        }

        if (completion.showSuggestions) {
          completion.resetCompletionState();
          return;
        }
      }

      if (shellModeActive && keyMatchers[Command.REVERSE_SEARCH](key)) {
        setReverseSearchActive(true);
        setTextBeforeReverseSearch(buffer.text);
        setCursorPosition(buffer.cursor);
        return;
      }

      if (keyMatchers[Command.CLEAR_SCREEN](key)) {
        onClearScreen();
        return;
      }

      if (reverseSearchActive) {
        const {
          activeSuggestionIndex,
          navigateUp,
          navigateDown,
          showSuggestions,
          suggestions,
        } = reverseSearchCompletion;

        if (showSuggestions) {
          if (keyMatchers[Command.NAVIGATION_UP](key)) {
            navigateUp();
            return;
          }
          if (keyMatchers[Command.NAVIGATION_DOWN](key)) {
            navigateDown();
            return;
          }
          if (keyMatchers[Command.ACCEPT_SUGGESTION_REVERSE_SEARCH](key)) {
            reverseSearchCompletion.handleAutocomplete(activeSuggestionIndex);
            reverseSearchCompletion.resetCompletionState();
            setReverseSearchActive(false);
            return;
          }
        }

        if (keyMatchers[Command.SUBMIT_REVERSE_SEARCH](key)) {
          const textToSubmit =
            showSuggestions && activeSuggestionIndex > -1
              ? suggestions[activeSuggestionIndex].value
              : buffer.text;
          handleSubmitAndClear(textToSubmit);
          reverseSearchCompletion.resetCompletionState();
          setReverseSearchActive(false);
          return;
        }

        // Prevent up/down from falling through to regular history navigation
        if (
          keyMatchers[Command.NAVIGATION_UP](key) ||
          keyMatchers[Command.NAVIGATION_DOWN](key)
        ) {
          return;
        }
      }

      // If the command is a perfect match, pressing enter should execute it.
      if (completion.isPerfectMatch && keyMatchers[Command.RETURN](key)) {
        handleSubmitAndClear(buffer.text);
        return;
      }

      if (completion.showSuggestions) {
        if (completion.suggestions.length > 1) {
          if (keyMatchers[Command.COMPLETION_UP](key)) {
            completion.navigateUp();
            return;
          }
          if (keyMatchers[Command.COMPLETION_DOWN](key)) {
            completion.navigateDown();
            return;
          }
        }

        if (keyMatchers[Command.ACCEPT_SUGGESTION](key)) {
          if (completion.suggestions.length > 0) {
            const targetIndex =
              completion.activeSuggestionIndex === -1
                ? 0 // Default to the first if none is active
                : completion.activeSuggestionIndex;
            if (targetIndex < completion.suggestions.length) {
              completion.handleAutocomplete(targetIndex);
            }
          }
          return;
        }
      }

      if (!shellModeActive) {
        if (keyMatchers[Command.HISTORY_UP](key)) {
          inputHistory.navigateUp();
          return;
        }
        if (keyMatchers[Command.HISTORY_DOWN](key)) {
          inputHistory.navigateDown();
          return;
        }
        // Handle arrow-up/down for history on single-line or at edges
        if (
          keyMatchers[Command.NAVIGATION_UP](key) &&
          (buffer.allVisualLines.length === 1 ||
            (buffer.visualCursor[0] === 0 && buffer.visualScrollRow === 0))
        ) {
          inputHistory.navigateUp();
          return;
        }
        if (
          keyMatchers[Command.NAVIGATION_DOWN](key) &&
          (buffer.allVisualLines.length === 1 ||
            buffer.visualCursor[0] === buffer.allVisualLines.length - 1)
        ) {
          inputHistory.navigateDown();
          return;
        }
      } else {
        // Shell History Navigation
        if (keyMatchers[Command.NAVIGATION_UP](key)) {
          const prevCommand = shellHistory.getPreviousCommand();
          if (prevCommand !== null) buffer.setText(prevCommand);
          return;
        }
        if (keyMatchers[Command.NAVIGATION_DOWN](key)) {
          const nextCommand = shellHistory.getNextCommand();
          if (nextCommand !== null) buffer.setText(nextCommand);
          return;
        }
      }

      if (keyMatchers[Command.SUBMIT](key)) {
        if (buffer.text.trim()) {
          const [row, col] = buffer.cursor;
          const line = buffer.lines[row];
          const charBefore = col > 0 ? cpSlice(line, col - 1, col) : '';
          if (charBefore === '\\') {
            buffer.backspace();
            buffer.newline();
          } else {
            handleSubmitAndClear(buffer.text);
          }
        }
        return;
      }

      // Newline insertion
      if (keyMatchers[Command.NEWLINE](key)) {
        buffer.newline();
        return;
      }

      // Ctrl+A (Home) / Ctrl+E (End)
      if (keyMatchers[Command.HOME](key)) {
        buffer.move('home');
        return;
      }
      if (keyMatchers[Command.END](key)) {
        buffer.move('end');
        buffer.moveToOffset(cpLen(buffer.text));
        return;
      }
      // Ctrl+C (Clear input)
      if (keyMatchers[Command.CLEAR_INPUT](key)) {
        if (buffer.text.length > 0) {
          buffer.setText('');
          resetCompletionState();
          return;
        }
        return;
      }

      // Kill line commands
      if (keyMatchers[Command.KILL_LINE_RIGHT](key)) {
        buffer.killLineRight();
        return;
      }
      if (keyMatchers[Command.KILL_LINE_LEFT](key)) {
        buffer.killLineLeft();
        return;
      }

      // External editor
      if (keyMatchers[Command.OPEN_EXTERNAL_EDITOR](key)) {
        buffer.openInExternalEditor();
        return;
      }

      // Ctrl+V for clipboard image paste
      if (keyMatchers[Command.PASTE_CLIPBOARD_IMAGE](key)) {
        handleClipboardImage();
        return;
      }

      // Fall back to the text buffer's default input handling for all other keys
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
      handleSubmitAndClear,
      shellHistory,
      reverseSearchCompletion,
      handleClipboardImage,
      resetCompletionState,
      vimHandleInput,
      reverseSearchActive,
      textBeforeReverseSearch,
      cursorPosition,
    ],
  );

  useKeypress(handleInput, { isActive: true });

  const linesToRender = buffer.viewportVisualLines;
  const [cursorVisualRowAbsolute, cursorVisualColAbsolute] =
    buffer.visualCursor;
  const scrollVisualRow = buffer.visualScrollRow;

  return (
    <>
      <Box
        borderStyle="round"
        borderColor={
          shellModeActive ? theme.status.warning : theme.border.focused
        }
        paddingX={1}
      >
        <Text
          color={shellModeActive ? theme.status.warning : theme.text.accent}
        >
          {shellModeActive ? (
            reverseSearchActive ? (
              <Text color={theme.text.link}>(r:) </Text>
            ) : (
              '! '
            )
          ) : (
            '> '
          )}
        </Text>
        <Box flexGrow={1} flexDirection="column">
          {buffer.text.length === 0 && placeholder ? (
            focus ? (
              <Text>
                {chalk.inverse(placeholder.slice(0, 1))}
                <Text color={theme.text.secondary}>{placeholder.slice(1)}</Text>
              </Text>
            ) : (
              <Text color={theme.text.secondary}>{placeholder}</Text>
            )
          ) : (
            linesToRender.map((lineText, visualIdxInRenderedSet) => {
              const cursorVisualRow = cursorVisualRowAbsolute - scrollVisualRow;
              let display = cpSlice(lineText, 0, inputWidth);
              const currentVisualWidth = stringWidth(display);
              if (currentVisualWidth < inputWidth) {
                display = display + ' '.repeat(inputWidth - currentVisualWidth);
              }

              if (focus && visualIdxInRenderedSet === cursorVisualRow) {
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
        <Box paddingRight={2}>
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
      {reverseSearchActive && (
        <Box paddingRight={2}>
          <SuggestionsDisplay
            suggestions={reverseSearchCompletion.suggestions}
            activeIndex={reverseSearchCompletion.activeSuggestionIndex}
            isLoading={reverseSearchCompletion.isLoadingSuggestions}
            width={suggestionsWidth}
            scrollOffset={reverseSearchCompletion.visibleStartIndex}
            userInput={buffer.text}
          />
        </Box>
      )}
    </>
  );
};
