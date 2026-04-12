/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useCallback, useRef } from 'react';
import { Text, Box } from 'ink';
import { useKeypress, type Key } from '../../hooks/useKeypress.js';
import chalk from 'chalk';
import { theme } from '../../semantic-colors.js';
import { expandPastePlaceholders, type TextBuffer } from './text-buffer.js';
import { cpSlice, cpIndexToOffset } from '../../utils/textUtils.js';
import { Command } from '../../key/keyMatchers.js';
import { useKeyMatchers } from '../../hooks/useKeyMatchers.js';

export interface TextInputProps {
  buffer: TextBuffer;
  placeholder?: string;
  onSubmit?: (value: string) => void;
  onCancel?: () => void;
  focus?: boolean;
}

/**
 * Guard window (ms) after a paste event during which Enter is treated as a
 * newline rather than a submit.  This mirrors the protection in InputPrompt
 * and prevents accidental auto-submission on terminals that deliver a trailing
 * Return in the same data chunk as the bracketed-paste end sequence.  40 ms is
 * well below human reaction time yet long enough to cover same-tick delivery.
 */
const PASTE_SUBMIT_GUARD_MS = 40;

export function TextInput({
  buffer,
  placeholder = '',
  onSubmit,
  onCancel,
  focus = true,
}: TextInputProps): React.JSX.Element {
  const keyMatchers = useKeyMatchers();
  const {
    text,
    handleInput,
    visualCursor,
    viewportVisualLines,
    visualScrollRow,
  } = buffer;
  const [cursorVisualRowAbsolute, cursorVisualColAbsolute] = visualCursor;

  // Track recent paste events to prevent accidental auto-submission.
  // Uses refs (not state) so the value is always current inside the
  // keypress callback regardless of React's render cycle.
  const recentPasteTimeRef = useRef<number | null>(null);
  const pasteGuardTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleKeyPress = useCallback(
    (key: Key) => {
      if (key.name === 'escape' && onCancel) {
        onCancel();
        return true;
      }

      if (keyMatchers[Command.SUBMIT](key) && onSubmit) {
        if (recentPasteTimeRef.current !== null) {
          // A paste just occurred — treat this Enter as a newline to avoid
          // submitting stale content from the pre-paste render closure.
          handleInput({
            ...key,
            name: 'enter',
            shift: true,
            sequence: '\r',
          });
          return true;
        }
        onSubmit(expandPastePlaceholders(text, buffer.pastedContent));
        return true;
      }

      // Record paste events so the SUBMIT guard above can detect them.
      if (key.name === 'paste') {
        recentPasteTimeRef.current = Date.now();
        if (pasteGuardTimerRef.current) {
          clearTimeout(pasteGuardTimerRef.current);
        }
        pasteGuardTimerRef.current = setTimeout(() => {
          recentPasteTimeRef.current = null;
          pasteGuardTimerRef.current = null;
        }, PASTE_SUBMIT_GUARD_MS);
      }

      const handled = handleInput(key);
      return handled;
    },
    [handleInput, onCancel, onSubmit, text, buffer.pastedContent, keyMatchers],
  );

  useKeypress(handleKeyPress, { isActive: focus, priority: true });

  const showPlaceholder = text.length === 0 && placeholder;

  if (showPlaceholder) {
    return (
      <Box>
        {focus ? (
          <Text terminalCursorFocus={focus} terminalCursorPosition={0}>
            {chalk.inverse(placeholder[0] || ' ')}
            <Text color={theme.text.secondary}>{placeholder.slice(1)}</Text>
          </Text>
        ) : (
          <Text color={theme.text.secondary}>{placeholder}</Text>
        )}
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {viewportVisualLines.map((lineText, idx) => {
        const currentVisualRow = visualScrollRow + idx;
        const isCursorLine =
          focus && currentVisualRow === cursorVisualRowAbsolute;

        const lineDisplay = isCursorLine
          ? cpSlice(lineText, 0, cursorVisualColAbsolute) +
            chalk.inverse(
              cpSlice(
                lineText,
                cursorVisualColAbsolute,
                cursorVisualColAbsolute + 1,
              ) || ' ',
            ) +
            cpSlice(lineText, cursorVisualColAbsolute + 1)
          : lineText;

        return (
          <Box key={idx} height={1}>
            <Text
              terminalCursorFocus={isCursorLine}
              terminalCursorPosition={cpIndexToOffset(
                lineText,
                cursorVisualColAbsolute,
              )}
            >
              {lineDisplay}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
