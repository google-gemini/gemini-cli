/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import clipboardy from 'clipboardy';
import { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { Box, Text, useStdout, type DOMElement } from 'ink';
import { SuggestionsDisplay, MAX_WIDTH } from './SuggestionsDisplay.js';
import { theme } from '../semantic-colors.js';
import { useInputHistory } from '../hooks/useInputHistory.js';
import { HalfLinePaddedBox } from './shared/HalfLinePaddedBox.js';
import {
  type TextBuffer,
  logicalPosToOffset,
  PASTED_TEXT_PLACEHOLDER_REGEX,
  getTransformUnderCursor,
} from './shared/text-buffer.js';
import {
  cpSlice,
  cpLen,
  toCodePoints,
  cpIndexToOffset,
} from '../utils/textUtils.js';
import chalk from 'chalk';
import stringWidth from 'string-width';
import { useShellHistory } from '../hooks/useShellHistory.js';
import { useReverseSearchCompletion } from '../hooks/useReverseSearchCompletion.js';
import {
  useCommandCompletion,
  CompletionMode,
} from '../hooks/useCommandCompletion.js';
import type { Key } from '../hooks/useKeypress.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { keyMatchers, Command } from '../keyMatchers.js';
import type { CommandContext, SlashCommand } from '../commands/types.js';
import type { Config } from '@google/gemini-cli-core';
import { ApprovalMode, coreEvents, debugLogger } from '@google/gemini-cli-core';
import {
  parseInputForHighlighting,
  parseSegmentsFromTokens,
} from '../utils/highlight.js';
import { useKittyKeyboardProtocol } from '../hooks/useKittyKeyboardProtocol.js';
import {
  clipboardHasImage,
  saveClipboardImage,
  cleanupOldClipboardImages,
} from '../utils/clipboardUtils.js';
import {
  isAutoExecutableCommand,
  isSlashCommand,
} from '../utils/commandUtils.js';
import * as path from 'node:path';
import { SCREEN_READER_USER_PREFIX } from '../textConstants.js';
import { DEFAULT_BACKGROUND_OPACITY } from '../constants.js';
import { getSafeLowColorBackground } from '../themes/color-utils.js';
import { isLowColorDepth } from '../utils/terminalUtils.js';
import { useShellFocusState } from '../contexts/ShellFocusContext.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { StreamingState } from '../types.js';
import { useMouseClick } from '../hooks/useMouseClick.js';
import { useMouse, type MouseEvent } from '../contexts/MouseContext.js';
import { useUIActions } from '../contexts/UIActionsContext.js';
import { useAlternateBuffer } from '../hooks/useAlternateBuffer.js';

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
  onSuggestionsVisibilityChange?: (visible: boolean) => void;
  vimHandleInput?: (key: Key) => boolean;
  isEmbeddedShellFocused?: boolean;
  setQueueErrorMessage: (message: string | null) => void;
  streamingState: StreamingState;
  popAllMessages?: () => string | undefined;
  suggestionsPosition?: 'above' | 'below';
  setBannerVisible: (visible: boolean) => void;
}

// The input content, input container, and input suggestions list may have different widths
export const calculatePromptWidths = (mainContentWidth: number) => {
  const FRAME_PADDING_AND_BORDER = 4; // Border (2) + padding (2)
  const PROMPT_PREFIX_WIDTH = 2; // '> ' or '! '

  const FRAME_OVERHEAD = FRAME_PADDING_AND_BORDER + PROMPT_PREFIX_WIDTH;
  const suggestionsWidth = Math.max(20, mainContentWidth);

  return {
    inputWidth: Math.max(mainContentWidth - FRAME_OVERHEAD, 1),
    containerWidth: mainContentWidth,
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
  onSuggestionsVisibilityChange,
  vimHandleInput,
  isEmbeddedShellFocused,
  setQueueErrorMessage,
  streamingState,
  popAllMessages,
  suggestionsPosition = 'below',
  setBannerVisible,
}) => {
  const { stdout } = useStdout();
  const { merged: settings } = useSettings();
  const kittyProtocol = useKittyKeyboardProtocol();
  const isShellFocused = useShellFocusState();
  const { setEmbeddedShellFocused, setShortcutsHelpVisible } = useUIActions();
  const {
    terminalWidth,
    activePtyId,
    history,
    terminalBackgroundColor,
    backgroundShells,
    backgroundShellHeight,
    shortcutsHelpVisible,
  } = useUIState();
  const [suppressCompletion, setSuppressCompletion] = useState(false);
  const escPressCount = useRef(0);
  const [showEscapePrompt, setShowEscapePrompt] = useState(false);
  const escapeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [recentUnsafePasteTime, setRecentUnsafePasteTime] = useState<
    number | null
  >(null);
  const pasteTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const innerBoxRef = useRef<DOMElement>(null);

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

  const completion = useCommandCompletion({
    buffer,
    cwd: config.getTargetDir(),
    slashCommands,
    commandContext,
    reverseSearchActive,
    shellModeActive,
    config,
    active: !suppressCompletion,
  });

  const reverseSearchCompletion = useReverseSearchCompletion(
    buffer,
    shellHistoryData,
    reverseSearchActive,
  );

  const reversedUserMessages = useMemo(
    () => [...userMessages].reverse(),
    [userMessages],
  );

  const commandSearchCompletion = useReverseSearchCompletion(
    buffer,
    reversedUserMessages,
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
    escPressCount.current = 0;
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
      let processedValue = submittedValue;
      if (buffer.pastedContent) {
        // Replace placeholders like [Pasted Text: 6 lines] with actual content
        processedValue = processedValue.replace(
          PASTED_TEXT_PLACEHOLDER_REGEX,
          (match) => buffer.pastedContent[match] || match,
        );
      }

      if (shellModeActive) {
        shellHistory.addCommandToHistory(processedValue);
      }
      // Clear the buffer *before* calling onSubmit to prevent potential re-submission
      // if onSubmit triggers a re-render while the buffer still holds the old value.
      buffer.setText('');
      onSubmit(processedValue);
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

  const handleSubmit = useCallback(
    (submittedValue: string) => {
      const trimmedMessage = submittedValue.trim();
      const isSlash = isSlashCommand(trimmedMessage);

      const isShell = shellModeActive;
      if (
        (isSlash || isShell) &&
        streamingState === StreamingState.Responding
      ) {
        setQueueErrorMessage(
          `${isShell ? 'Shell' : 'Slash'} commands cannot be queued`,
        );
        return;
      }
      handleSubmitAndClear(trimmedMessage);
    },
    [
      handleSubmitAndClear,
      shellModeActive,
      streamingState,
      setQueueErrorMessage,
    ],
  );

  const customSetTextAndResetCompletionSignal = useCallback(
    (newText: string, cursorPosition?: 'start' | 'end' | number) => {
      buffer.setText(newText, cursorPosition);
      setSuppressCompletion(true);
    },
    [buffer, setSuppressCompletion],
  );

  const inputHistory = useInputHistory({
    userMessages,
    onSubmit: handleSubmitAndClear,
    isActive:
      (!completion.showSuggestions || completion.suggestions.length === 1) &&
      !shellModeActive,
    currentQuery: buffer.text,
    currentCursorOffset: buffer.getOffset(),
    onChange: customSetTextAndResetCompletionSignal,
  });

  // Effect to reset completion if history navigation just occurred and set the text
  useEffect(() => {
    if (suppressCompletion) {
      resetCompletionState();
      resetReverseSearchCompletionState();
      resetCommandSearchCompletionState();
      setExpandedSuggestionIndex(-1);
    }
  }, [
    suppressCompletion,
    buffer.text,
    resetCompletionState,
    setSuppressCompletion,
    resetReverseSearchCompletionState,
    resetCommandSearchCompletionState,
    setExpandedSuggestionIndex,
  ]);

  // Helper function to handle loading queued messages into input
  // Returns true if we should continue with input history navigation
  const tryLoadQueuedMessages = useCallback(() => {
    if (buffer.text.trim() === '' && popAllMessages) {
      const allMessages = popAllMessages();
      if (allMessages) {
        buffer.setText(allMessages);
        return true;
      } else {
        // No queued messages, proceed with input history
        inputHistory.navigateUp();
      }
      return true; // We handled the up arrow key
    }
    return false;
  }, [buffer, popAllMessages, inputHistory]);

  // Handle clipboard image pasting with Ctrl+V
  const handleClipboardPaste = useCallback(async () => {
    if (shortcutsHelpVisible) {
      setShortcutsHelpVisible(false);
    }
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
          const offset = buffer.getOffset();

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

      if (settings.experimental?.useOSC52Paste) {
        stdout.write('\x1b]52;c;?\x07');
      } else {
        const textToInsert = await clipboardy.read();
        buffer.insert(textToInsert, { paste: true });
      }
    } catch (error) {
      debugLogger.error('Error handling paste:', error);
    }
  }, [
    buffer,
    config,
    stdout,
    settings,
    shortcutsHelpVisible,
    setShortcutsHelpVisible,
  ]);

  useMouseClick(
    innerBoxRef,
    (_event, relX, relY) => {
      setSuppressCompletion(true);
      if (isEmbeddedShellFocused) {
        setEmbeddedShellFocused(false);
      }
      const visualRow = buffer.visualScrollRow + relY;
      buffer.moveToVisualPosition(visualRow, relX);
    },
    { isActive: focus },
  );

  const isAlternateBuffer = useAlternateBuffer();

  // Double-click to expand/collapse paste placeholders
  useMouseClick(
    innerBoxRef,
    (_event, relX, relY) => {
      if (!isAlternateBuffer) return;

      const visualLine = buffer.viewportVisualLines[relY];
      if (!visualLine) return;

      // Even if we click past the end of the line, we might want to collapse an expanded paste
      const isPastEndOfLine = relX >= stringWidth(visualLine);

      const logicalPos = isPastEndOfLine
        ? null
        : buffer.getLogicalPositionFromVisual(
            buffer.visualScrollRow + relY,
            relX,
          );

      // Check for paste placeholder (collapsed state)
      if (logicalPos) {
        const transform = getTransformUnderCursor(
          logicalPos.row,
          logicalPos.col,
          buffer.transformationsByLine,
        );
        if (transform?.type === 'paste' && transform.id) {
          buffer.togglePasteExpansion(
            transform.id,
            logicalPos.row,
            logicalPos.col,
          );
          return;
        }
      }

      // If we didn't click a placeholder to expand, check if we are inside or after
      // an expanded paste region and collapse it.
      const row = buffer.visualScrollRow + relY;
      const expandedId = buffer.getExpandedPasteAtLine(row);
      if (expandedId) {
        buffer.togglePasteExpansion(
          expandedId,
          row,
          logicalPos?.col ?? relX, // Fallback to relX if past end of line
        );
      }
    },
    { isActive: focus, name: 'double-click' },
  );

  useMouse(
    (event: MouseEvent) => {
      if (event.name === 'right-release') {
        setSuppressCompletion(false);
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        handleClipboardPaste();
      }
    },
    { isActive: focus },
  );

  const handleInput = useCallback(
    (key: Key) => {
      // Determine if this keypress is a history navigation command
      const isHistoryUp =
        !shellModeActive &&
        (keyMatchers[Command.HISTORY_UP](key) ||
          (keyMatchers[Command.NAVIGATION_UP](key) &&
            (buffer.allVisualLines.length === 1 ||
              (buffer.visualCursor[0] === 0 && buffer.visualScrollRow === 0))));
      const isHistoryDown =
        !shellModeActive &&
        (keyMatchers[Command.HISTORY_DOWN](key) ||
          (keyMatchers[Command.NAVIGATION_DOWN](key) &&
            (buffer.allVisualLines.length === 1 ||
              buffer.visualCursor[0] === buffer.allVisualLines.length - 1)));

      const isHistoryNav = isHistoryUp || isHistoryDown;
      const isCursorMovement =
        keyMatchers[Command.MOVE_LEFT](key) ||
        keyMatchers[Command.MOVE_RIGHT](key) ||
        keyMatchers[Command.MOVE_UP](key) ||
        keyMatchers[Command.MOVE_DOWN](key) ||
        keyMatchers[Command.MOVE_WORD_LEFT](key) ||
        keyMatchers[Command.MOVE_WORD_RIGHT](key) ||
        keyMatchers[Command.HOME](key) ||
        keyMatchers[Command.END](key);

      const isSuggestionsNav =
        (completion.showSuggestions ||
          reverseSearchCompletion.showSuggestions ||
          commandSearchCompletion.showSuggestions) &&
        (keyMatchers[Command.COMPLETION_UP](key) ||
          keyMatchers[Command.COMPLETION_DOWN](key) ||
          keyMatchers[Command.EXPAND_SUGGESTION](key) ||
          keyMatchers[Command.COLLAPSE_SUGGESTION](key) ||
          keyMatchers[Command.ACCEPT_SUGGESTION](key));

      // Reset completion suppression if the user performs any action other than
      // history navigation or cursor movement.
      // We explicitly skip this if we are currently navigating suggestions.
      if (!isSuggestionsNav) {
        setSuppressCompletion(
          isHistoryNav || isCursorMovement || keyMatchers[Command.ESCAPE](key),
        );
      }

      // TODO(jacobr): this special case is likely not needed anymore.
      // We should probably stop supporting paste if the InputPrompt is not
      // focused.
      /// We want to handle paste even when not focused to support drag and drop.
      if (!focus && key.name !== 'paste') {
        return false;
      }

      // Handle escape to close shortcuts panel first, before letting it bubble
      // up for cancellation. This ensures pressing Escape once closes the panel,
      // and pressing again cancels the operation.
      if (shortcutsHelpVisible && key.name === 'escape') {
        setShortcutsHelpVisible(false);
        return true;
      }

      if (
        key.name === 'escape' &&
        (streamingState === StreamingState.Responding ||
          streamingState === StreamingState.WaitingForConfirmation)
      ) {
        return false;
      }

      if (key.name === 'paste') {
        if (shortcutsHelpVisible) {
          setShortcutsHelpVisible(false);
        }
        // Record paste time to prevent accidental auto-submission
        if (!isTerminalPasteTrusted(kittyProtocol.enabled)) {
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
        return true;
      }

      if (shortcutsHelpVisible) {
        if (key.sequence === '?' && key.insertable) {
          setShortcutsHelpVisible(false);
          buffer.handleInput(key);
          return true;
        }
        // Escape is handled earlier to ensure it closes the panel before
        // potentially cancelling an operation
        if (key.name === 'backspace' || key.sequence === '\b') {
          setShortcutsHelpVisible(false);
          return true;
        }
        if (key.insertable) {
          setShortcutsHelpVisible(false);
        }
      }

      if (
        key.sequence === '?' &&
        key.insertable &&
        !shortcutsHelpVisible &&
        buffer.text.length === 0
      ) {
        setShortcutsHelpVisible(true);
        return true;
      }

      if (vimHandleInput && vimHandleInput(key)) {
        return true;
      }

      // Reset ESC count and hide prompt on any non-ESC key
      if (key.name !== 'escape') {
        if (escPressCount.current > 0 || showEscapePrompt) {
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
        return true;
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
          return true;
        }
        if (commandSearchActive) {
          cancelSearch(
            setCommandSearchActive,
            commandSearchCompletion.resetCompletionState,
          );
          return true;
        }

        if (shellModeActive) {
          setShellModeActive(false);
          resetEscapeState();
          return true;
        }

        if (completion.showSuggestions) {
          completion.resetCompletionState();
          setExpandedSuggestionIndex(-1);
          resetEscapeState();
          return true;
        }

        // Handle double ESC
        if (escPressCount.current === 0) {
          escPressCount.current = 1;
          setShowEscapePrompt(true);
          if (escapeTimerRef.current) {
            clearTimeout(escapeTimerRef.current);
          }
          escapeTimerRef.current = setTimeout(() => {
            resetEscapeState();
          }, 500);
          return true;
        }

        // Second ESC
        resetEscapeState();
        if (buffer.text.length > 0) {
          buffer.setText('');
          resetCompletionState();
          return true;
        } else if (history.length > 0) {
          onSubmit('/rewind');
          return true;
        }
        coreEvents.emitFeedback('info', 'Nothing to rewind to');
        return true;
      }

      if (keyMatchers[Command.CLEAR_SCREEN](key)) {
        setBannerVisible(false);
        onClearScreen();
        return true;
      }

      if (shellModeActive && keyMatchers[Command.REVERSE_SEARCH](key)) {
        setReverseSearchActive(true);
        setTextBeforeReverseSearch(buffer.text);
        setCursorPosition(buffer.cursor);
        return true;
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
            return true;
          }
          if (keyMatchers[Command.NAVIGATION_DOWN](key)) {
            navigateDown();
            return true;
          }
          if (keyMatchers[Command.COLLAPSE_SUGGESTION](key)) {
            if (suggestions[activeSuggestionIndex].value.length >= MAX_WIDTH) {
              setExpandedSuggestionIndex(-1);
              return true;
            }
          }
          if (keyMatchers[Command.EXPAND_SUGGESTION](key)) {
            if (suggestions[activeSuggestionIndex].value.length >= MAX_WIDTH) {
              setExpandedSuggestionIndex(activeSuggestionIndex);
              return true;
            }
          }
          if (keyMatchers[Command.ACCEPT_SUGGESTION_REVERSE_SEARCH](key)) {
            sc.handleAutocomplete(activeSuggestionIndex);
            resetState();
            setActive(false);
            return true;
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
          return true;
        }

        // Prevent up/down from falling through to regular history navigation
        if (
          keyMatchers[Command.NAVIGATION_UP](key) ||
          keyMatchers[Command.NAVIGATION_DOWN](key)
        ) {
          return true;
        }
      }

      // If the command is a perfect match, pressing enter should execute it.
      // We prioritize execution unless the user is explicitly selecting a different suggestion.
      if (
        completion.isPerfectMatch &&
        completion.completionMode !== CompletionMode.AT &&
        keyMatchers[Command.RETURN](key) &&
        (!completion.showSuggestions || completion.activeSuggestionIndex <= 0)
      ) {
        handleSubmit(buffer.text);
        return true;
      }

      if (completion.showSuggestions) {
        if (completion.suggestions.length > 1) {
          if (keyMatchers[Command.COMPLETION_UP](key)) {
            completion.navigateUp();
            setExpandedSuggestionIndex(-1); // Reset expansion when navigating
            return true;
          }
          if (keyMatchers[Command.COMPLETION_DOWN](key)) {
            completion.navigateDown();
            setExpandedSuggestionIndex(-1); // Reset expansion when navigating
            return true;
          }
        }

        if (keyMatchers[Command.ACCEPT_SUGGESTION](key)) {
          if (completion.suggestions.length > 0) {
            const targetIndex =
              completion.activeSuggestionIndex === -1
                ? 0 // Default to the first if none is active
                : completion.activeSuggestionIndex;

            if (targetIndex < completion.suggestions.length) {
              const suggestion = completion.suggestions[targetIndex];

              const isEnterKey = key.name === 'return' && !key.ctrl;

              if (isEnterKey && buffer.text.startsWith('/')) {
                const { isArgumentCompletion, leafCommand } =
                  completion.slashCompletionRange;

                if (
                  isArgumentCompletion &&
                  isAutoExecutableCommand(leafCommand)
                ) {
                  // isArgumentCompletion guarantees leafCommand exists
                  const completedText = completion.getCompletedText(suggestion);
                  if (completedText) {
                    setExpandedSuggestionIndex(-1);
                    handleSubmit(completedText.trim());
                    return true;
                  }
                } else if (!isArgumentCompletion) {
                  // Existing logic for command name completion
                  const command =
                    completion.getCommandFromSuggestion(suggestion);

                  // Only auto-execute if the command has no completion function
                  // (i.e., it doesn't require an argument to be selected)
                  if (
                    command &&
                    isAutoExecutableCommand(command) &&
                    !command.completion
                  ) {
                    const completedText =
                      completion.getCompletedText(suggestion);

                    if (completedText) {
                      setExpandedSuggestionIndex(-1);
                      handleSubmit(completedText.trim());
                      return true;
                    }
                  }
                }
              }

              // Default behavior: auto-complete to prompt box
              completion.handleAutocomplete(targetIndex);
              setExpandedSuggestionIndex(-1); // Reset expansion after selection
            }
          }
          return true;
        }
      }

      // Handle Tab key for ghost text acceptance
      if (
        key.name === 'tab' &&
        !completion.showSuggestions &&
        completion.promptCompletion.text
      ) {
        completion.promptCompletion.accept();
        return true;
      }

      if (!shellModeActive) {
        if (keyMatchers[Command.REVERSE_SEARCH](key)) {
          setCommandSearchActive(true);
          setTextBeforeReverseSearch(buffer.text);
          setCursorPosition(buffer.cursor);
          return true;
        }

        if (isHistoryUp) {
          if (
            keyMatchers[Command.NAVIGATION_UP](key) &&
            buffer.visualCursor[1] > 0
          ) {
            buffer.move('home');
            return true;
          }
          // Check for queued messages first when input is empty
          // If no queued messages, inputHistory.navigateUp() is called inside tryLoadQueuedMessages
          if (tryLoadQueuedMessages()) {
            return true;
          }
          // Only navigate history if popAllMessages doesn't exist
          inputHistory.navigateUp();
          return true;
        }
        if (isHistoryDown) {
          if (
            keyMatchers[Command.NAVIGATION_DOWN](key) &&
            buffer.visualCursor[1] <
              cpLen(buffer.allVisualLines[buffer.visualCursor[0]] || '')
          ) {
            buffer.move('end');
            return true;
          }
          inputHistory.navigateDown();
          return true;
        }
      } else {
        // Shell History Navigation
        if (keyMatchers[Command.NAVIGATION_UP](key)) {
          if (
            (buffer.allVisualLines.length === 1 ||
              (buffer.visualCursor[0] === 0 && buffer.visualScrollRow === 0)) &&
            buffer.visualCursor[1] > 0
          ) {
            buffer.move('home');
            return true;
          }
          const prevCommand = shellHistory.getPreviousCommand();
          if (prevCommand !== null) buffer.setText(prevCommand);
          return true;
        }
        if (keyMatchers[Command.NAVIGATION_DOWN](key)) {
          if (
            (buffer.allVisualLines.length === 1 ||
              buffer.visualCursor[0] === buffer.allVisualLines.length - 1) &&
            buffer.visualCursor[1] <
              cpLen(buffer.allVisualLines[buffer.visualCursor[0]] || '')
          ) {
            buffer.move('end');
            return true;
          }
          const nextCommand = shellHistory.getNextCommand();
          if (nextCommand !== null) buffer.setText(nextCommand);
          return true;
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
            // wondering why it was completely ignored.
            buffer.newline();
            return true;
          }

          const [row, col] = buffer.cursor;
          const line = buffer.lines[row];
          const charBefore = col > 0 ? cpSlice(line, col - 1, col) : '';
          if (charBefore === '\\') {
            buffer.backspace();
            buffer.newline();
          } else {
            handleSubmit(buffer.text);
          }
        }
        return true;
      }

      // Newline insertion
      if (keyMatchers[Command.NEWLINE](key)) {
        buffer.newline();
        return true;
      }

      // Ctrl+A (Home) / Ctrl+E (End)
      if (keyMatchers[Command.HOME](key)) {
        buffer.move('home');
        return true;
      }
      if (keyMatchers[Command.END](key)) {
        buffer.move('end');
        return true;
      }

      // Kill line commands
      if (keyMatchers[Command.KILL_LINE_RIGHT](key)) {
        buffer.killLineRight();
        return true;
      }
      if (keyMatchers[Command.KILL_LINE_LEFT](key)) {
        buffer.killLineLeft();
        return true;
      }

      if (keyMatchers[Command.DELETE_WORD_BACKWARD](key)) {
        buffer.deleteWordLeft();
        return true;
      }

      // External editor
      if (keyMatchers[Command.OPEN_EXTERNAL_EDITOR](key)) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        buffer.openInExternalEditor();
        return true;
      }

      // Ctrl+V for clipboard paste
      if (keyMatchers[Command.PASTE_CLIPBOARD](key)) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        handleClipboardPaste();
        return true;
      }

      if (keyMatchers[Command.TOGGLE_BACKGROUND_SHELL](key)) {
        return false;
      }

      if (keyMatchers[Command.FOCUS_SHELL_INPUT](key)) {
        if (
          activePtyId ||
          (backgroundShells.size > 0 && backgroundShellHeight > 0)
        ) {
          setEmbeddedShellFocused(true);
          return true;
        }
        return false;
      }

      // Fall back to the text buffer's default input handling for all other keys
      const handled = buffer.handleInput(key);

      if (handled) {
        if (keyMatchers[Command.CLEAR_INPUT](key)) {
          resetCompletionState();
        }

        // Clear ghost text when user types regular characters (not navigation/control keys)
        if (
          completion.promptCompletion.text &&
          key.sequence &&
          key.sequence.length === 1 &&
          !key.alt &&
          !key.ctrl &&
          !key.cmd
        ) {
          completion.promptCompletion.clear();
          setExpandedSuggestionIndex(-1);
        }
      }
      return handled;
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
      handleSubmit,
      shellHistory,
      reverseSearchCompletion,
      handleClipboardPaste,
      resetCompletionState,
      showEscapePrompt,
      resetEscapeState,
      vimHandleInput,
      reverseSearchActive,
      textBeforeReverseSearch,
      cursorPosition,
      recentUnsafePasteTime,
      commandSearchActive,
      commandSearchCompletion,
      kittyProtocol.enabled,
      shortcutsHelpVisible,
      setShortcutsHelpVisible,
      tryLoadQueuedMessages,
      setBannerVisible,
      onSubmit,
      activePtyId,
      setEmbeddedShellFocused,
      backgroundShells.size,
      backgroundShellHeight,
      history,
      streamingState,
    ],
  );

  useKeypress(handleInput, {
    isActive: !isEmbeddedShellFocused,
    priority: true,
  });

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

  const useBackgroundColor = config.getUseBackgroundColor();
  const isLowColor = isLowColorDepth();
  const terminalBg = terminalBackgroundColor || 'black';

  // We should fallback to lines if the background color is disabled OR if it is
  // enabled but we are in a low color depth terminal where we don't have a safe
  // background color to use.
  const useLineFallback = useMemo(() => {
    if (!useBackgroundColor) {
      return true;
    }
    if (isLowColor) {
      return !getSafeLowColorBackground(terminalBg);
    }
    return false;
  }, [useBackgroundColor, isLowColor, terminalBg]);

  useEffect(() => {
    if (onSuggestionsVisibilityChange) {
      onSuggestionsVisibilityChange(shouldShowSuggestions);
    }
  }, [shouldShowSuggestions, onSuggestionsVisibilityChange]);

  const showAutoAcceptStyling =
    !shellModeActive && approvalMode === ApprovalMode.AUTO_EDIT;
  const showYoloStyling =
    !shellModeActive && approvalMode === ApprovalMode.YOLO;
  const showPlanStyling =
    !shellModeActive && approvalMode === ApprovalMode.PLAN;

  let statusColor: string | undefined;
  let statusText = '';
  if (shellModeActive) {
    statusColor = theme.ui.symbol;
    statusText = 'Shell mode';
  } else if (showYoloStyling) {
    statusColor = theme.status.error;
    statusText = 'YOLO mode';
  } else if (showPlanStyling) {
    statusColor = theme.status.success;
    statusText = 'Plan mode';
  } else if (showAutoAcceptStyling) {
    statusColor = theme.status.warning;
    statusText = 'Accepting edits';
  }

  const suggestionsNode = shouldShowSuggestions ? (
    <Box paddingRight={2}>
      <SuggestionsDisplay
        suggestions={activeCompletion.suggestions}
        activeIndex={activeCompletion.activeSuggestionIndex}
        isLoading={activeCompletion.isLoadingSuggestions}
        width={suggestionsWidth}
        scrollOffset={activeCompletion.visibleStartIndex}
        userInput={buffer.text}
        mode={
          completion.completionMode === CompletionMode.AT
            ? 'reverse'
            : buffer.text.startsWith('/') &&
                !reverseSearchActive &&
                !commandSearchActive
              ? 'slash'
              : 'reverse'
        }
        expandedIndex={expandedSuggestionIndex}
      />
    </Box>
  ) : null;

  const borderColor =
    isShellFocused && !isEmbeddedShellFocused
      ? (statusColor ?? theme.border.focused)
      : theme.border.default;

  return (
    <>
      {suggestionsPosition === 'above' && suggestionsNode}
      {useLineFallback ? (
        <Box
          borderStyle="round"
          borderTop={true}
          borderBottom={false}
          borderLeft={false}
          borderRight={false}
          borderColor={borderColor}
          width={terminalWidth}
          flexDirection="row"
          alignItems="flex-start"
          height={0}
        />
      ) : null}
      <HalfLinePaddedBox
        backgroundBaseColor={
          isShellFocused && !isEmbeddedShellFocused
            ? theme.border.focused
            : theme.border.default
        }
        backgroundOpacity={DEFAULT_BACKGROUND_OPACITY}
        useBackgroundColor={useBackgroundColor}
      >
        <Box
          flexGrow={1}
          flexDirection="row"
          paddingX={1}
          borderColor={borderColor}
          borderStyle={useLineFallback ? 'round' : undefined}
          borderTop={false}
          borderBottom={false}
          borderLeft={!useBackgroundColor}
          borderRight={!useBackgroundColor}
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
          <Box flexGrow={1} flexDirection="column" ref={innerBoxRef}>
            {buffer.text.length === 0 && placeholder ? (
              showCursor ? (
                <Text
                  terminalCursorFocus={showCursor}
                  terminalCursorPosition={0}
                >
                  {chalk.inverse(placeholder.slice(0, 1))}
                  <Text color={theme.text.secondary}>
                    {placeholder.slice(1)}
                  </Text>
                </Text>
              ) : (
                <Text color={theme.text.secondary}>{placeholder}</Text>
              )
            ) : (
              linesToRender
                .map((lineText: string, visualIdxInRenderedSet: number) => {
                  const absoluteVisualIdx =
                    scrollVisualRow + visualIdxInRenderedSet;
                  const mapEntry = buffer.visualToLogicalMap[absoluteVisualIdx];
                  if (!mapEntry) return null;

                  const cursorVisualRow =
                    cursorVisualRowAbsolute - scrollVisualRow;
                  const isOnCursorLine =
                    focus && visualIdxInRenderedSet === cursorVisualRow;

                  const renderedLine: React.ReactNode[] = [];

                  const [logicalLineIdx] = mapEntry;
                  const logicalLine = buffer.lines[logicalLineIdx] || '';
                  const transformations =
                    buffer.transformationsByLine[logicalLineIdx] ?? [];
                  const tokens = parseInputForHighlighting(
                    logicalLine,
                    logicalLineIdx,
                    transformations,
                    ...(focus && buffer.cursor[0] === logicalLineIdx
                      ? [buffer.cursor[1]]
                      : []),
                  );
                  const startColInTransformed =
                    buffer.visualToTransformedMap[absoluteVisualIdx] ?? 0;
                  const visualStartCol = startColInTransformed;
                  const visualEndCol = visualStartCol + cpLen(lineText);
                  const segments = parseSegmentsFromTokens(
                    tokens,
                    visualStartCol,
                    visualEndCol,
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
                          display,
                          relativeVisualColForHighlight - segStart,
                          relativeVisualColForHighlight - segStart + 1,
                        );
                        const highlighted = showCursor
                          ? chalk.inverse(charToHighlight)
                          : charToHighlight;
                        display =
                          cpSlice(
                            display,
                            0,
                            relativeVisualColForHighlight - segStart,
                          ) +
                          highlighted +
                          cpSlice(
                            display,
                            relativeVisualColForHighlight - segStart + 1,
                          );
                      }
                      charCount = segEnd;
                    } else {
                      // Advance the running counter even when not on cursor line
                      charCount += segLen;
                    }

                    const color =
                      seg.type === 'command' ||
                      seg.type === 'file' ||
                      seg.type === 'paste'
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
                      <Text
                        terminalCursorFocus={showCursor && isOnCursorLine}
                        terminalCursorPosition={cpIndexToOffset(
                          lineText,
                          cursorVisualColAbsolute,
                        )}
                      >
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
      </HalfLinePaddedBox>
      {useLineFallback ? (
        <Box
          borderStyle="round"
          borderTop={false}
          borderBottom={true}
          borderLeft={false}
          borderRight={false}
          borderColor={borderColor}
          width={terminalWidth}
          flexDirection="row"
          alignItems="flex-start"
          height={0}
        />
      ) : null}
      {suggestionsPosition === 'below' && suggestionsNode}
    </>
  );
};
