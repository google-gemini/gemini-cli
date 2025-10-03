/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useCallback, useEffect, useState, useRef } from 'react';
import { Box, Text } from 'ink';
import { SuggestionsDisplay, MAX_WIDTH } from './SuggestionsDisplay.js';
import { theme } from '../semantic-colors.js';
import { useInputHistory } from '../hooks/useInputHistory.js';
import type { TextBuffer } from './shared/text-buffer.js';
import { logicalPosToOffset } from './shared/text-buffer.js';
import { cpSlice, cpLen, toCodePoints } from '../utils/textUtils.js';
import chalk from 'chalk';
import stringWidth from 'string-width';
import { useShellHistory } from '../hooks/useShellHistory.js';
import { useReverseSearchCompletion } from '../hooks/useReverseSearchCompletion.js';
import { useCommandCompletion } from '../hooks/useCommandCompletion.js';
import type { Key } from '../hooks/useKeypress.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { keyMatchers, Command } from '../keyMatchers.js';
import type { CommandContext, SlashCommand } from '../commands/types.js';
import type { Config } from '@google/gemini-cli-core';
import { ApprovalMode } from '@google/gemini-cli-core';
import {
  parseInputForHighlighting,
  buildSegmentsForVisualSlice,
} from '../utils/highlight.js';
import { useKittyKeyboardProtocol } from '../hooks/useKittyKeyboardProtocol.js';
import {
  clipboardHasImage,
  saveClipboardImage,
  cleanupOldClipboardImages,
} from '../utils/clipboardUtils.js';
import * as path from 'node:path';
import { SCREEN_READER_USER_PREFIX } from '../textConstants.js';
import { useShellFocusState } from '../contexts/ShellFocusContext.js';

/**
 * Returns if the terminal can be trusted to handle paste events atomically
 * rather than potentially sending multiple paste events separated by line
 * breaks which could trigger unintended command execution.
 */
export function isTerminalPasteTrusted(
  kittyProtocolSupported: boolean,
): boolean {
  // Ideally we could trust all VSCode family terminals as well but it appears
  // we cannot as Cursor users on windows reported being impacted by this
  // issue (https://github.com/google-gemini/gemini-cli/issues/3763).
  return kittyProtocolSupported;
}

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
  approvalMode: ApprovalMode;
  onEscapePromptChange?: (showPrompt: boolean) => void;
  vimHandleInput?: (key: Key) => boolean;
  isEmbeddedShellFocused?: boolean;
}

// The input content, input container, and input suggestions list may have different widths
export const calculatePromptWidths = (terminalWidth: number) => {
  const widthFraction = 0.9;
  const FRAME_PADDING_AND_BORDER = 4; // Border (2) + padding (2)
  const PROMPT_PREFIX_WIDTH = 2; // '> ' or '! '
  const MIN_CONTENT_WIDTH = 2;

  const innerContentWidth =
    Math.floor(terminalWidth * widthFraction) -
    FRAME_PADDING_AND_BORDER -
    PROMPT_PREFIX_WIDTH;

  const inputWidth = Math.max(MIN_CONTENT_WIDTH, innerContentWidth);
  const FRAME_OVERHEAD = FRAME_PADDING_AND_BORDER + PROMPT_PREFIX_WIDTH;
  const containerWidth = inputWidth + FRAME_OVERHEAD;
  const suggestionsWidth = Math.max(20, Math.floor(terminalWidth * 1.0));

  return {
    inputWidth,
    containerWidth,
    suggestionsWidth,
    frameOverhead: FRAME_OVERHEAD,
  } as const;
};

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
  approvalMode,
  onEscapePromptChange,
  vimHandleInput,
  isEmbeddedShellFocused,
}) => {
  const kittyProtocol = useKittyKeyboardProtocol();
  const isShellFocused = useShellFocusState();
  const [justNavigatedHistory, setJustNavigatedHistory] = useState(false);
  const [escPressCount, setEscPressCount] = useState(0);
  const [showEscapePrompt, setShowEscapePrompt] = useState(false);
  const escapeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [recentUnsafePasteTime, setRecentUnsafePasteTime] = useState<
    number | null
  >(null);
  const pasteTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
  const [commandSearchActive, setCommandSearchActive] = useState(false);
  const [textBeforeReverseSearch, setTextBeforeReverseSearch] = useState('');
  const [cursorPosition, setCursorPosition] = useState<[number, number]>([
    0, 0,
  ]);
  const [expandedSuggestionIndex, setExpandedSuggestionIndex] =
    useState<number>(-1);
  const shellHistory = useShellHistory(config.getProjectRoot());
  const shellHistoryData = shellHistory.history;

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
    shellHistoryData,
    reverseSearchActive,
  );

  const commandSearchCompletion = useReverseSearchCompletion(
    buffer,
    userMessages,
    commandSearchActive,
  );

  const resetCompletionState = completion.resetCompletionState;
  const resetReverseSearchCompletionState =
    reverseSearchCompletion.resetCompletionState;
  const resetCommandSearchCompletionState =
    commandSearchCompletion.resetCompletionState;

  const showCursor = focus && isShellFocused && !isEmbeddedShellFocused;

  const resetEscapeState = useCallback(() => {
    if (escapeTimerRef.current) {
      clearTimeout(escapeTimerRef.current);
      escapeTimerRef.current = null;
    }
    setEscPressCount(0);
    setShowEscapePrompt(false);
  }, []);

  // Notify parent component about escape prompt state changes
  useEffect(() => {
    if (onEscapePromptChange) {
      onEscapePromptChange(showEscapePrompt);
    }
  }, [showEscapePrompt, onEscapePromptChange]);

  // Clear escape prompt timer on unmount
  useEffect(
    () => () => {
      if (escapeTimerRef.current) {
        clearTimeout(escapeTimerRef.current);
      }
      if (pasteTimeoutRef.current) {
        clearTimeout(pasteTimeoutRef.current);
      }
    },
    [],
  );

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
      resetCommandSearchCompletionState();
      setExpandedSuggestionIndex(-1);
      setJustNavigatedHistory(false);
    }
  }, [
    justNavigatedHistory,
    buffer.text,
    resetCompletionState,
    setJustNavigatedHistory,
    resetReverseSearchCompletionState,
    resetCommandSearchCompletionState,
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
      // TODO(jacobr): this special case is likely not needed anymore.
      // We should probably stop supporting paste if the InputPrompt is not
      // focused.
      /// We want to handle paste even when not focused to support drag and drop.
      if (!focus && !key.paste) {
        return;
      }

      if (key.paste) {
        // Record paste time to prevent accidental auto-submission
        if (!isTerminalPasteTrusted(kittyProtocol.supported)) {
          setRecentUnsafePasteTime(Date.now());

          // Clear any existing paste timeout
          if (pasteTimeoutRef.current) {
            clearTimeout(pasteTimeoutRef.current);
          }

          // Clear the paste protection after a very short delay to prevent
          // false positives.
          // Due to how we use a reducer for text buffer state updates, it is
          // reasonable to expect that key events that are really part of the
          // same paste will be processed in the same event loop tick. 40ms
          // is chosen arbitrarily as it is faster than a typical human
          // could go from pressing paste to pressing enter. The fastest typists
          // can type at 200 words per minute which roughly translates to 50ms
          // per letter.
          pasteTimeoutRef.current = setTimeout(() => {
            setRecentUnsafePasteTime(null);
            pasteTimeoutRef.current = null;
          }, 40);
        }
        // Ensure we never accidentally interpret paste as regular input.
        buffer.handleInput(key);
        return;
      }

      if (vimHandleInput && vimHandleInput(key)) {
        return;
      }

      // Reset ESC count and hide prompt on any non-ESC key
      if (key.name !== 'escape') {
        if (escPressCount > 0 || showEscapePrompt) {
          resetEscapeState();
        }
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
        const cancelSearch = (
          setActive: (active: boolean) => void,
          resetCompletion: () => void,
        ) => {
          setActive(false);
          resetCompletion();
          buffer.setText(textBeforeReverseSearch);
          const offset = logicalPosToOffset(
            buffer.lines,
            cursorPosition[0],
            cursorPosition[1],
          );
          buffer.moveToOffset(offset);
          setExpandedSuggestionIndex(-1);
        };

        if (reverseSearchActive) {
          cancelSearch(
            setReverseSearchActive,
            reverseSearchCompletion.resetCompletionState,
          );
          return;
        }
        if (commandSearchActive) {
          cancelSearch(
            setCommandSearchActive,
            commandSearchCompletion.resetCompletionState,
          );
          return;
        }

        if (shellModeActive) {
          setShellModeActive(false);
          resetEscapeState();
          return;
        }

        if (completion.showSuggestions) {
          completion.resetCompletionState();
          setExpandedSuggestionIndex(-1);
          resetEscapeState();
          return;
        }

        // Handle double ESC for clearing input
        if (escPressCount === 0) {
          if (buffer.text === '') {
            return;
          }
          setEscPressCount(1);
          setShowEscapePrompt(true);
          if (escapeTimerRef.current) {
            clearTimeout(escapeTimerRef.current);
          }
          escapeTimerRef.current = setTimeout(() => {
            resetEscapeState();
          }, 500);
        } else {
          // clear input and immediately reset state
          buffer.setText('');
          resetCompletionState();
          resetEscapeState();
        }
        return;
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

      if (reverseSearchActive || commandSearchActive) {
        const isCommandSearch = commandSearchActive;

        const sc = isCommandSearch
          ? commandSearchCompletion
          : reverseSearchCompletion;

        const {
          activeSuggestionIndex,
          navigateUp,
          navigateDown,
          showSuggestions,
          suggestions,
        } = sc;
        const setActive = isCommandSearch
          ? setCommandSearchActive
          : setReverseSearchActive;
        const resetState = sc.resetCompletionState;

        if (showSuggestions) {
          if (keyMatchers[Command.NAVIGATION_UP](key)) {
            navigateUp();
            return;
          }
          if (keyMatchers[Command.NAVIGATION_DOWN](key)) {
            navigateDown();
            return;
          }
          if (keyMatchers[Command.COLLAPSE_SUGGESTION](key)) {
            if (suggestions[activeSuggestionIndex].value.length >= MAX_WIDTH) {
              setExpandedSuggestionIndex(-1);
              return;
            }
          }
          if (keyMatchers[Command.EXPAND_SUGGESTION](key)) {
            if (suggestions[activeSuggestionIndex].value.length >= MAX_WIDTH) {
              setExpandedSuggestionIndex(activeSuggestionIndex);
              return;
            }
          }
          if (keyMatchers[Command.ACCEPT_SUGGESTION_REVERSE_SEARCH](key)) {
            sc.handleAutocomplete(activeSuggestionIndex);
            resetState();
            setActive(false);
            return;
          }
        }

        if (keyMatchers[Command.SUBMIT_REVERSE_SEARCH](key)) {
          const textToSubmit =
            showSuggestions && activeSuggestionIndex > -1
              ? suggestions[activeSuggestionIndex].value
              : buffer.text;
          handleSubmitAndClear(textToSubmit);
          resetState();
          setActive(false);
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
            setExpandedSuggestionIndex(-1); // Reset expansion when navigating
            return;
          }
          if (keyMatchers[Command.COMPLETION_DOWN](key)) {
            completion.navigateDown();
            setExpandedSuggestionIndex(-1); // Reset expansion when navigating
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
              setExpandedSuggestionIndex(-1); // Reset expansion after selection
            }
          }
          return;
        }
      }

      // Handle Tab key for ghost text acceptance
      if (
        key.name === 'tab' &&
        !completion.showSuggestions &&
        completion.promptCompletion.text
      ) {
        completion.promptCompletion.accept();
        return;
      }

      if (!shellModeActive) {
        if (keyMatchers[Command.REVERSE_SEARCH](key)) {
          setCommandSearchActive(true);
          setTextBeforeReverseSearch(buffer.text);
          setCursorPosition(buffer.cursor);
          return;
        }

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
          // Check if a paste operation occurred recently to prevent accidental auto-submission
          if (recentUnsafePasteTime !== null) {
            // Paste occurred recently in a terminal where we don't trust pastes
            // to be reported correctly so assume this paste was really a
            // newline that was part of the paste.
            // This has the added benefit that in the worst case at least users
            // get some feedback that their keypress was handled rather than
            // wondering why it was completey ignored.
            buffer.newline();
            return;
          }

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
        return;
      }
      // Ctrl+C (Clear input)
      if (keyMatchers[Command.CLEAR_INPUT](key)) {
        if (buffer.text.length > 0) {
          buffer.setText('');
          resetCompletionState();
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

      if (keyMatchers[Command.DELETE_WORD_BACKWARD](key)) {
        buffer.deleteWordLeft();
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

      // Clear ghost text when user types regular characters (not navigation/control keys)
      if (
        completion.promptCompletion.text &&
        key.sequence &&
        key.sequence.length === 1 &&
        !key.ctrl &&
        !key.meta
      ) {
        completion.promptCompletion.clear();
        setExpandedSuggestionIndex(-1);
      }
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
      escPressCount,
      showEscapePrompt,
      resetEscapeState,
      vimHandleInput,
      reverseSearchActive,
      textBeforeReverseSearch,
      cursorPosition,
      recentUnsafePasteTime,
      commandSearchActive,
      commandSearchCompletion,
      kittyProtocol.supported,
    ],
  );

  useKeypress(handleInput, { isActive: !isEmbeddedShellFocused });

  const linesToRender = buffer.viewportVisualLines;
  const [cursorVisualRowAbsolute, cursorVisualColAbsolute] =
    buffer.visualCursor;
  const scrollVisualRow = buffer.visualScrollRow;

  const getGhostTextLines = useCallback(() => {
    if (
      !completion.promptCompletion.text ||
      !buffer.text ||
      !completion.promptCompletion.text.startsWith(buffer.text)
    ) {
      return { inlineGhost: '', additionalLines: [] };
    }

    const ghostSuffix = completion.promptCompletion.text.slice(
      buffer.text.length,
    );
    if (!ghostSuffix) {
      return { inlineGhost: '', additionalLines: [] };
    }

    const currentLogicalLine = buffer.lines[buffer.cursor[0]] || '';
    const cursorCol = buffer.cursor[1];

    const textBeforeCursor = cpSlice(currentLogicalLine, 0, cursorCol);
    const usedWidth = stringWidth(textBeforeCursor);
    const remainingWidth = Math.max(0, inputWidth - usedWidth);

    const ghostTextLinesRaw = ghostSuffix.split('\n');
    const firstLineRaw = ghostTextLinesRaw.shift() || '';

    let inlineGhost = '';
    let remainingFirstLine = '';

    if (stringWidth(firstLineRaw) <= remainingWidth) {
      inlineGhost = firstLineRaw;
    } else {
      const words = firstLineRaw.split(' ');
      let currentLine = '';
      let wordIdx = 0;
      for (const word of words) {
        const prospectiveLine = currentLine ? `${currentLine} ${word}` : word;
        if (stringWidth(prospectiveLine) > remainingWidth) {
          break;
        }
        currentLine = prospectiveLine;
        wordIdx++;
      }
      inlineGhost = currentLine;
      if (words.length > wordIdx) {
        remainingFirstLine = words.slice(wordIdx).join(' ');
      }
    }

    const linesToWrap = [];
    if (remainingFirstLine) {
      linesToWrap.push(remainingFirstLine);
    }
    linesToWrap.push(...ghostTextLinesRaw);
    const remainingGhostText = linesToWrap.join('\n');

    const additionalLines: string[] = [];
    if (remainingGhostText) {
      const textLines = remainingGhostText.split('\n');
      for (const textLine of textLines) {
        const words = textLine.split(' ');
        let currentLine = '';

        for (const word of words) {
          const prospectiveLine = currentLine ? `${currentLine} ${word}` : word;
          const prospectiveWidth = stringWidth(prospectiveLine);

          if (prospectiveWidth > inputWidth) {
            if (currentLine) {
              additionalLines.push(currentLine);
            }

            let wordToProcess = word;
            while (stringWidth(wordToProcess) > inputWidth) {
              let part = '';
              const wordCP = toCodePoints(wordToProcess);
              let partWidth = 0;
              let splitIndex = 0;
              for (let i = 0; i < wordCP.length; i++) {
                const char = wordCP[i];
                const charWidth = stringWidth(char);
                if (partWidth + charWidth > inputWidth) {
                  break;
                }
                part += char;
                partWidth += charWidth;
                splitIndex = i + 1;
              }
              additionalLines.push(part);
              wordToProcess = cpSlice(wordToProcess, splitIndex);
            }
            currentLine = wordToProcess;
          } else {
            currentLine = prospectiveLine;
          }
        }
        if (currentLine) {
          additionalLines.push(currentLine);
        }
      }
    }

    return { inlineGhost, additionalLines };
  }, [
    completion.promptCompletion.text,
    buffer.text,
    buffer.lines,
    buffer.cursor,
    inputWidth,
  ]);

  const { inlineGhost, additionalLines } = getGhostTextLines();
  const getActiveCompletion = () => {
    if (commandSearchActive) return commandSearchCompletion;
    if (reverseSearchActive) return reverseSearchCompletion;
    return completion;
  };

  const activeCompletion = getActiveCompletion();
  const shouldShowSuggestions = activeCompletion.showSuggestions;

  const showAutoAcceptStyling =
    !shellModeActive && approvalMode === ApprovalMode.AUTO_EDIT;
  const showYoloStyling =
    !shellModeActive && approvalMode === ApprovalMode.YOLO;

  let statusColor: string | undefined;
  let statusText = '';
  if (shellModeActive) {
    statusColor = theme.ui.symbol;
    statusText = 'Shell mode';
  } else if (showYoloStyling) {
    statusColor = theme.status.error;
    statusText = 'YOLO mode';
  } else if (showAutoAcceptStyling) {
    statusColor = theme.status.warning;
    statusText = 'Accepting edits';
  }

  return (
    <>
      <Box
        borderStyle="round"
        borderColor={
          isShellFocused && !isEmbeddedShellFocused
            ? (statusColor ?? theme.border.focused)
            : theme.border.default
        }
        paddingX={1}
      >
        <Text
          color={statusColor ?? theme.text.accent}
          aria-label={statusText || undefined}
        >
          {shellModeActive ? (
            reverseSearchActive ? (
              <Text
                color={theme.text.link}
                aria-label={SCREEN_READER_USER_PREFIX}
              >
                (r:){' '}
              </Text>
            ) : (
              '!'
            )
          ) : commandSearchActive ? (
            <Text color={theme.text.accent}>(r:) </Text>
          ) : showYoloStyling ? (
            '*'
          ) : (
            '>'
          )}{' '}
        </Text>
        <Box flexGrow={1} flexDirection="column">
          {buffer.text.length === 0 && placeholder ? (
            showCursor ? (
              <Text>
                {chalk.inverse(placeholder.slice(0, 1))}
                <Text color={theme.text.secondary}>{placeholder.slice(1)}</Text>
              </Text>
            ) : (
              <Text color={theme.text.secondary}>{placeholder}</Text>
            )
          ) : (
            linesToRender
              .map((lineText, visualIdxInRenderedSet) => {
                const absoluteVisualIdx =
                  scrollVisualRow + visualIdxInRenderedSet;
                const mapEntry = buffer.visualToLogicalMap[absoluteVisualIdx];
                const cursorVisualRow =
                  cursorVisualRowAbsolute - scrollVisualRow;
                const isOnCursorLine =
                  focus && visualIdxInRenderedSet === cursorVisualRow;

                const renderedLine: React.ReactNode[] = [];

                const [logicalLineIdx, logicalStartCol] = mapEntry;
                const logicalLine = buffer.lines[logicalLineIdx] || '';
                const tokens = parseInputForHighlighting(
                  logicalLine,
                  logicalLineIdx,
                );

                const visualStart = logicalStartCol;
                const visualEnd = logicalStartCol + cpLen(lineText);
                const segments = buildSegmentsForVisualSlice(
                  tokens,
                  visualStart,
                  visualEnd,
                );

                let charCount = 0;
                segments.forEach((seg, segIdx) => {
                  const segLen = cpLen(seg.text);
                  let display = seg.text;

                  if (isOnCursorLine) {
                    const relativeVisualColForHighlight =
                      cursorVisualColAbsolute;
                    const segStart = charCount;
                    const segEnd = segStart + segLen;
                    if (
                      relativeVisualColForHighlight >= segStart &&
                      relativeVisualColForHighlight < segEnd
                    ) {
                      const charToHighlight = cpSlice(
                        seg.text,
                        relativeVisualColForHighlight - segStart,
                        relativeVisualColForHighlight - segStart + 1,
                      );
                      const highlighted = showCursor
                        ? chalk.inverse(charToHighlight)
                        : charToHighlight;
                      display =
                        cpSlice(
                          seg.text,
                          0,
                          relativeVisualColForHighlight - segStart,
                        ) +
                        highlighted +
                        cpSlice(
                          seg.text,
                          relativeVisualColForHighlight - segStart + 1,
                        );
                    }
                    charCount = segEnd;
                  }

                  const color =
                    seg.type === 'command' || seg.type === 'file'
                      ? theme.text.accent
                      : theme.text.primary;

                  renderedLine.push(
                    <Text key={`token-${segIdx}`} color={color}>
                      {display}
                    </Text>,
                  );
                });

                const currentLineGhost = isOnCursorLine ? inlineGhost : '';
                if (
                  isOnCursorLine &&
                  cursorVisualColAbsolute === cpLen(lineText)
                ) {
                  if (!currentLineGhost) {
                    renderedLine.push(
                      <Text key={`cursor-end-${cursorVisualColAbsolute}`}>
                        {showCursor ? chalk.inverse(' ') : ' '}
                      </Text>,
                    );
                  }
                }

                const showCursorBeforeGhost =
                  focus &&
                  isOnCursorLine &&
                  cursorVisualColAbsolute === cpLen(lineText) &&
                  currentLineGhost;

                return (
                  <Box key={`line-${visualIdxInRenderedSet}`} height={1}>
                    <Text>
                      {renderedLine}
                      {showCursorBeforeGhost &&
                        (showCursor ? chalk.inverse(' ') : ' ')}
                      {currentLineGhost && (
                        <Text color={theme.text.secondary}>
                          {currentLineGhost}
                        </Text>
                      )}
                    </Text>
                  </Box>
                );
              })
              .concat(
                additionalLines.map((ghostLine, index) => {
                  const padding = Math.max(
                    0,
                    inputWidth - stringWidth(ghostLine),
                  );
                  return (
                    <Text
                      key={`ghost-line-${index}`}
                      color={theme.text.secondary}
                    >
                      {ghostLine}
                      {' '.repeat(padding)}
                    </Text>
                  );
                }),
              )
          )}
        </Box>
      </Box>
      {shouldShowSuggestions && (
        <Box paddingRight={2}>
          <SuggestionsDisplay
            suggestions={activeCompletion.suggestions}
            activeIndex={activeCompletion.activeSuggestionIndex}
            isLoading={activeCompletion.isLoadingSuggestions}
            width={suggestionsWidth}
            scrollOffset={activeCompletion.visibleStartIndex}
            userInput={buffer.text}
            mode={
              buffer.text.startsWith('/') &&
              !reverseSearchActive &&
              !commandSearchActive
                ? 'slash'
                : 'reverse'
            }
            expandedIndex={expandedSuggestionIndex}
          />
        </Box>
      )}
    </>
  );
};
