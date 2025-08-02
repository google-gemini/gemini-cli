/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

  // Memoize highlight ranges for performance.
  const highlightRanges = useMemo(() => {
    const ranges: Array<{ start: number; end: number }> = [];
    // Regex to find words starting with @ or / that are preceded by whitespace or start of string.
    const regex = /(?<=^|\s)[@/](?:\\ |\S)*/g;
    let match;
    while ((match = regex.exec(buffer.text)) !== null) {
      ranges.push({
        start: match.index,
        end: match.index + match[0].length,
      });
    }
    return ranges;
  }, [buffer.text]);

  // Memoize visual line info to map visual lines back to their offset in the original text.
  const visualLineInfos = useMemo(() => {
    const infos: Array<{ text: string; offset: number }> = [];
    const logicalLines = [...buffer.lines];
    let currentLogicalLine = logicalLines.shift() || '';
    let offset = 0;

    for (const visualLine of buffer.allVisualLines) {
      infos.push({ text: visualLine, offset });

      const visualLen = cpLen(visualLine);
      const logicalLen = cpLen(currentLogicalLine);

      if (visualLen < logicalLen) {
        offset += visualLen;
        currentLogicalLine = cpSlice(currentLogicalLine, visualLen);
      } else {
        offset += visualLen + 1; // +1 for newline
        currentLogicalLine = logicalLines.shift() || '';
      }
    }
    return infos;
  }, [buffer.lines, buffer.allVisualLines]);

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
          return;
        }
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
              const absoluteVisualIndex =
                visualIdxInRenderedSet + buffer.visualScrollRow;
              const lineInfo = visualLineInfos[absoluteVisualIndex];

              // This should not happen, but as a safeguard:
              if (!lineInfo) return null;

              const { offset: lineOffset } = lineInfo;
              const lineEndOffset = lineOffset + cpLen(lineText);

              const parts: Array<{
                text: string;
                color?: string;
                inverse?: boolean;
              }> = [];
              let lastIndex = 0;

              // Apply command/path highlighting
              for (const range of highlightRanges) {
                const start = Math.max(lineOffset, range.start);
                const end = Math.min(lineEndOffset, range.end);

                if (start < end) {
                  const preStart = start - lineOffset;
                  if (preStart > lastIndex) {
                    parts.push({
                      text: cpSlice(lineText, lastIndex, preStart),
                    });
                  }
                  parts.push({
                    text: cpSlice(lineText, preStart, end - lineOffset),
                    color: Colors.AccentPurple,
                  });
                  lastIndex = end - lineOffset;
                }
              }

              if (lastIndex < cpLen(lineText)) {
                parts.push({ text: cpSlice(lineText, lastIndex) });
              }

              // Pad line to full width
              const currentVisualWidth = stringWidth(lineText);
              if (currentVisualWidth < inputWidth) {
                parts.push({
                  text: ' '.repeat(inputWidth - currentVisualWidth),
                });
              }

              let finalParts = parts;
              const cursorVisualRow = cursorVisualRowAbsolute - scrollVisualRow;

              // Apply cursor highlighting
              if (focus && visualIdxInRenderedSet === cursorVisualRow) {
                const cursorCol = cursorVisualColAbsolute;
                let accumulatedWidth = 0;
                let foundCursor = false;

                const newParts: typeof parts = [];

                for (const part of parts) {
                  if (foundCursor) {
                    newParts.push(part);
                    continue;
                  }

                  const partWidth = cpLen(part.text);
                  if (
                    !foundCursor &&
                    accumulatedWidth + partWidth > cursorCol
                  ) {
                    const colInPart = cursorCol - accumulatedWidth;

                    // Before cursor
                    if (colInPart > 0) {
                      newParts.push({
                        ...part,
                        text: cpSlice(part.text, 0, colInPart),
                      });
                    }

                    // Cursor char
                    const cursorChar =
                      cpSlice(part.text, colInPart, colInPart + 1) || ' ';
                    newParts.push({
                      ...part,
                      text: cursorChar,
                      inverse: true,
                    });

                    // After cursor
                    if (colInPart < partWidth - 1) {
                      newParts.push({
                        ...part,
                        text: cpSlice(part.text, colInPart + 1),
                      });
                    }
                    foundCursor = true;
                  } else {
                    newParts.push(part);
                  }
                  accumulatedWidth += partWidth;
                }

                // Handle cursor at the very end of the line
                if (!foundCursor && accumulatedWidth === cursorCol) {
                  newParts.push({ text: ' ', inverse: true });
                }

                finalParts = newParts;
              }

              return (
                <Text key={`line-${visualIdxInRenderedSet}`}>
                  {finalParts.map((part, i) => (
                    <Text key={i} color={part.color} inverse={part.inverse}>
                      {part.text}
                    </Text>
                  ))}
                </Text>
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
