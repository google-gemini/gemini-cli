/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useCallback, useRef } from 'react';
import { Text, Box, type DOMElement } from 'ink';
import { useKeypress, type Key } from '../../hooks/useKeypress.js';
import chalk from 'chalk';
import { theme } from '../../semantic-colors.js';
import { expandPastePlaceholders, type TextBuffer } from './text-buffer.js';
import { cpSlice, cpIndexToOffset } from '../../utils/textUtils.js';
import { Command } from '../../key/keyMatchers.js';
import { useKeyMatchers } from '../../hooks/useKeyMatchers.js';
import { useMouseClick } from '../../hooks/useMouseClick.js';

export interface TextInputProps {
  buffer: TextBuffer;
  placeholder?: string;
  onSubmit?: (value: string) => void;
  onCancel?: () => void;
  focus?: boolean;
}

export function TextInput({
  buffer,
  placeholder = '',
  onSubmit,
  onCancel,
  focus = true,
}: TextInputProps): React.JSX.Element {
  const keyMatchers = useKeyMatchers();
  const containerRef = useRef<DOMElement>(null);

  const {
    text,
    handleInput,
    visualCursor,
    viewportVisualLines,
    visualScrollRow,
  } = buffer;
  const [cursorVisualRowAbsolute, cursorVisualColAbsolute] = visualCursor;

  useMouseClick(
    containerRef,
    (_event, relativeX, relativeY) => {
      if (focus) {
        const visRowAbsolute = visualScrollRow + relativeY;
        buffer.moveToVisualPosition(visRowAbsolute, relativeX);
      }
    },
    { isActive: focus, name: 'left-press' },
  );

  const handleKeyPress = useCallback(
    (key: Key) => {
      if (key.name === 'escape' && onCancel) {
        onCancel();
        return true;
      }

      if (keyMatchers[Command.SUBMIT](key) && onSubmit) {
        onSubmit(expandPastePlaceholders(text, buffer.pastedContent));
        return true;
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
      <Box ref={containerRef}>
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
    <Box ref={containerRef} flexDirection="column">
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
