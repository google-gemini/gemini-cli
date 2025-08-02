/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState, useRef } from 'react';
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
import { CommandContext, SlashCommand } from '../commands/types.js';
import { Config } from '@google/gemini-cli-core';
import {
  clipboardHasImage,
  saveClipboardImage,
  cleanupOldClipboardImages,
} from '../utils/clipboardUtils.js';
import * as path from 'path';
import { StreamingState } from '../types.js';

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
  streamingState: StreamingState;
  cancelCurrentRequest: () => void;
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
  streamingState,
  cancelCurrentRequest,
}) => {
  const [justNavigatedHistory, setJustNavigatedHistory] = useState(false);
  const preservedTextRef = useRef<string>('');

  const [dirs, setDirs] = useState<readonly string[]>(
    config.getWorkspaceContext().getDirectories(),
  );
  const dirsChanged = config.getWorkspaceContext().getDirectories();
  useEffect(() => {
    if (dirs.length !== dirsChanged.length) {
      setDirs(dirsChanged);
    }
  }, [dirs.length, dirsChanged]);

  const completion = useCompletion(
    buffer,
    dirs,
    config.getTargetDir(),
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

      // LIFECYCLE-BASED PRESERVATION: Always preserve non-shell text on submission.
      // Clear any existing preserved text since we're submitting new text.
      // This handles rapid submissions and ensures only the latest text is preserved.

      if (shellModeActive) {
        // Shell commands never stream to Gemini, no need to preserve
        preservedTextRef.current = '';
      } else {
        // Clear any old preserved text and preserve the new submission
        preservedTextRef.current = submittedValue;
      }

      // Clear the buffer *before* calling onSubmit to prevent potential re-submission
      // if onSubmit triggers a re-render while the buffer still holds the old value.
      buffer.setText('');
      onSubmit(submittedValue);
      resetCompletionState();
    },
    [onSubmit, buffer, resetCompletionState, shellModeActive, shellHistory],
    // Note: preservedTextRef doesn't need to be in dependencies as it's a ref
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
      setJustNavigatedHistory(false);
    }
  }, [
    justNavigatedHistory,
    buffer.text,
    resetCompletionState,
    setJustNavigatedHistory,
  ]);

  // Cleanup preserved text with timeout-based fallback to prevent memory leaks
  // We use buffer.text as dependency to trigger cleanup setup on each submission
  useEffect(() => {
    if (!preservedTextRef.current) return;

    // Clear very old preserved text (5 minutes) to prevent memory leaks
    const timeoutId = setTimeout(
      () => {
        preservedTextRef.current = '';
      },
      5 * 60 * 1000,
    ); // 5 minutes

    return () => clearTimeout(timeoutId);
  }, [buffer.text]); // Triggers on each submission when buffer.text changes

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

      if (key.name === 'escape') {
        if (shellModeActive) {
          setShellModeActive(false);
          return;
        }

        if (completion.showSuggestions) {
          completion.resetCompletionState();
          return;
        }

        // Phase 1: Always handle stream cancellation if currently streaming
        if (streamingState === StreamingState.Responding) {
          cancelCurrentRequest();
        }

        // Phase 2: Handle text restoration only if buffer is empty to prevent data loss
        if (preservedTextRef.current.trim() && buffer.text.length === 0) {
          const textToRestore = preservedTextRef.current;
          buffer.setText(textToRestore);
        }

        // Phase 3: Always clear preserved text to prevent state corruption
        preservedTextRef.current = '';
      }

      if (key.ctrl && key.name === 'l') {
        onClearScreen();
        return;
      }

      // If the command is a perfect match, pressing enter should execute it.
      if (completion.isPerfectMatch && key.name === 'return') {
        handleSubmitAndClear(buffer.text);
        return;
      }

      if (completion.showSuggestions) {
        if (completion.suggestions.length > 1) {
          if (key.name === 'up' || (key.ctrl && key.name === 'p')) {
            completion.navigateUp();
            return;
          }
          if (key.name === 'down' || (key.ctrl && key.name === 'n')) {
            completion.navigateDown();
            return;
          }
        }

        if (key.name === 'tab' || (key.name === 'return' && !key.ctrl)) {
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
        buffer.moveToOffset(cpLen(buffer.text));
        return;
      }
      // Ctrl+C (Clear input)
      if (key.ctrl && key.name === 'c') {
        if (buffer.text.length > 0) {
          buffer.setText('');
          resetCompletionState();
          // Also clear preserved text since user explicitly cleared input
          preservedTextRef.current = '';
          return;
        }
        return;
      }

      // Kill line commands - also clear preserved text if entire buffer gets cleared
      if (key.ctrl && key.name === 'k') {
        const { cursor, lines } = buffer;
        const [cursorRow, cursorCol] = cursor;
        const currentLine = lines[cursorRow] || '';
        const currentLineLen = cpLen(currentLine);
        
        // Simulate the exact killLineRight logic from TextBuffer reducer
        const simulatedLines = [...lines];
        if (cursorCol < currentLineLen) {
          // Case 1: Delete from cursor to end of current line
          simulatedLines[cursorRow] = cpSlice(currentLine, 0, cursorCol);
        } else if (cursorRow < lines.length - 1) {
          // Case 2: Join current line with next line (act as delete)
          const nextLineContent = lines[cursorRow + 1] || '';
          simulatedLines[cursorRow] = currentLine + nextLineContent;
          simulatedLines.splice(cursorRow + 1, 1);
        }
        // Case 3: No change if at end of last line
        
        buffer.killLineRight();

        // Only clear preserved text if the simulated result would be completely empty
        const simulatedText = simulatedLines.join('\n');
        if (simulatedText.trim() === '') {
          preservedTextRef.current = '';
        }
        return;
      }
      if (key.ctrl && key.name === 'u') {
        const { cursor, lines } = buffer;
        const [cursorRow, cursorCol] = cursor;
        const currentLine = lines[cursorRow] || '';
        
        // Simulate the exact killLineLeft logic from TextBuffer reducer
        const simulatedLines = [...lines];
        if (cursorCol > 0) {
          // Case 1: Delete from start of line to cursor position
          simulatedLines[cursorRow] = cpSlice(currentLine, cursorCol);
        }
        // Case 2: No change if cursor is at column 0
        
        buffer.killLineLeft();

        // Only clear preserved text if the simulated result would be completely empty
        const simulatedText = simulatedLines.join('\n');
        if (simulatedText.trim() === '') {
          preservedTextRef.current = '';
        }
        return;
      }

      // External editor
      const isCtrlX = key.ctrl && (key.name === 'x' || key.sequence === '\x18');
      if (isCtrlX) {
        buffer.openInExternalEditor();
        return;
      }

      // Ctrl+V for clipboard image paste
      if (key.ctrl && key.name === 'v') {
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
      handleClipboardImage,
      resetCompletionState,
      vimHandleInput,
      streamingState,
      cancelCurrentRequest,
      // Note: preservedTextRef doesn't need to be in dependencies as it's a ref
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
