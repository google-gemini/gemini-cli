/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useCallback } from 'react';
import type { Key } from '../../hooks/useKeypress.js';
import { Text, Box } from 'ink';
import { useKeypress } from '../../hooks/useKeypress.js';
import chalk from 'chalk';
import { theme } from '../../semantic-colors.js';
import type { TextBuffer } from './text-buffer.js';
import { cpSlice } from '../../utils/textUtils.js';

export interface TextInputProps {
  buffer: TextBuffer;
  placeholder?: string;
  onSubmit?: (value: string) => void;
  onCancel?: () => void;
  mask?: string;
  focus?: boolean;
}

export function TextInput({
  buffer,
  placeholder = '',
  onSubmit,
  onCancel,
  mask,
  focus = true,
}: TextInputProps): React.JSX.Element {
  const { text, handleInput, visualCursor, viewportVisualLines } = buffer;

  const handleKeyPress = useCallback(
    (key: Key) => {
      if (key.name === 'escape') {
        onCancel?.();
        return;
      }

      if (key.name === 'return') {
        onSubmit?.(text);
        return;
      }

      handleInput(key);
    },
    [handleInput, onCancel, onSubmit, text],
  );

  useKeypress(handleKeyPress, { isActive: focus });

  const showPlaceholder = text.length === 0 && placeholder;

  // Since this is a single-line input, we only care about the first line.
  const lineText = viewportVisualLines[0] || '';
  const cursorCol = visualCursor[1];

  let content;
  if (showPlaceholder) {
    content = focus ? (
      <Text>
        {chalk.inverse(placeholder[0] || ' ')}
        <Text color={theme.text.secondary}>{placeholder.slice(1)}</Text>
      </Text>
    ) : (
      <Text color={theme.text.secondary}>{placeholder}</Text>
    );
  } else {
    const maskedLine = mask ? mask.repeat(lineText.length) : lineText;
    if (focus) {
      const charAtCursor = cpSlice(maskedLine, cursorCol, cursorCol + 1) || ' ';
      content = (
        <Text>
          {cpSlice(maskedLine, 0, cursorCol)}
          {chalk.inverse(charAtCursor)}
          {cpSlice(maskedLine, cursorCol + 1)}
        </Text>
      );
    } else {
      content = <Text>{maskedLine}</Text>;
    }
  }

  return <Box>{content}</Box>;
}
