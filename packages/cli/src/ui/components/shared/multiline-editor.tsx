/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useTextBuffer } from './text-buffer.js';
import chalk from 'chalk';
import { Box, Text, useInput, useStdin, Key } from 'ink';
import React from 'react';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { Colors } from '../../colors.js';

export interface MultilineTextEditorProps {
  // Initial contents.
  readonly initialText?: string;

  // Placeholder text.
  readonly placeholder?: string;

  // Visible width.
  readonly width?: number;

  // Visible height.
  readonly height?: number;

  // Called when the user submits (plain <Enter> key).
  readonly onSubmit?: (text: string) => void;

  // Capture keyboard input.
  readonly focus?: boolean;

  // Called when the internal text buffer updates.
  readonly onChange?: (text: string) => void;

  // Called when the user attempts to navigate past the start of the editor
  // with the up arrow.
  readonly navigateUp?: () => void;

  // Called when the user attempts to navigate past the end of the editor
  // with the down arrow.
  readonly navigateDown?: () => void;

  // Called on all key events to allow the caller. Returns true if the
  // event was handled and should not be passed to the editor.
  readonly inputPreprocessor?: (input: string, key: Key) => boolean;

  // Optional initial cursor position (character offset)
  readonly initialCursorOffset?: number;

  readonly widthUsedByParent: number;

  readonly widthFraction?: number;
}

export const MultilineTextEditor = ({
  initialText = '',
  placeholder = '',
  width,
  height = 10,
  onSubmit,
  focus = true,
  onChange,
  initialCursorOffset,
  widthUsedByParent,
  widthFraction = 1,
  navigateUp,
  navigateDown,
  inputPreprocessor,
}: MultilineTextEditorProps): React.ReactElement => {
  const terminalSize = useTerminalSize();
  const effectiveWidth = Math.max(
    20,
    width ??
      Math.round(terminalSize.columns * widthFraction) - widthUsedByParent,
  );

  const { stdin, setRawMode } = useStdin();

  const buffer = useTextBuffer({
    initialText,
    initialCursorOffset,
    viewport: { height, width: effectiveWidth },
    stdin,
    setRawMode,
    onChange, // Pass onChange to the hook
  });

  useInput(
    (input, key) => {
      if (!focus) {
        return;
      }

      if (inputPreprocessor?.(input, key) === true) {
        return;
      }

      const isCtrlX =
        (key.ctrl && (input === 'x' || input === '\x18')) || input === '\x18';
      const isCtrlE =
        (key.ctrl && (input === 'e' || input === '\x05')) ||
        input === '\x05' ||
        (!key.ctrl &&
          input === 'e' &&
          input.length === 1 &&
          input.charCodeAt(0) === 5);
      if (isCtrlX || isCtrlE) {
        buffer.openInExternalEditor();
        return;
      }

      if (
        process.env['TEXTBUFFER_DEBUG'] === '1' ||
        process.env['TEXTBUFFER_DEBUG'] === 'true'
      ) {
        console.log('[MultilineTextEditor] event', { input, key });
      }

      if (input.startsWith('[') && input.endsWith('u')) {
        const m = input.match(/^\[([0-9]+);([0-9]+)u$/);
        if (m && m[1] === '13') {
          const mod = Number(m[2]);
          const hasCtrl = Math.floor(mod / 4) % 2 === 1;
          if (hasCtrl) {
            if (onSubmit) {
              onSubmit(buffer.text);
            }
          } else {
            buffer.newline();
          }
          return;
        }
      }

      if (input.startsWith('[27;') && input.endsWith('~')) {
        const m = input.match(/^\[27;([0-9]+);13~$/);
        if (m) {
          const mod = Number(m[1]);
          const hasCtrl = Math.floor(mod / 4) % 2 === 1;
          if (hasCtrl) {
            if (onSubmit) {
              onSubmit(buffer.text);
            }
          } else {
            buffer.newline();
          }
          return;
        }
      }

      if (input === '\n') {
        buffer.newline();
        return;
      }

      if (input === '\r') {
        if (onSubmit) {
          onSubmit(buffer.text);
        }
        return;
      }

      if (key.upArrow) {
        if (buffer.cursor[0] === 0 && navigateUp) {
          navigateUp();
          return;
        }
      }

      if (key.downArrow) {
        if (buffer.cursor[0] === buffer.lines.length - 1 && navigateDown) {
          navigateDown();
          return;
        }
      }

      buffer.handleInput(input, key as Record<string, boolean>);
    },
    { isActive: focus },
  );

  const visibleLines = buffer.visibleLines;
  const [cursorRow, cursorCol] = buffer.cursor;
  const [scrollRow, scrollCol] = buffer.scroll;

  return (
    <Box flexDirection="column">
      {buffer.text.length === 0 && placeholder ? (
        <Text color={Colors.SubtleComment}>{placeholder}</Text>
      ) : (
        visibleLines.map((lineText, idx) => {
          const absoluteRow = scrollRow + idx;
          let display = lineText.slice(scrollCol, scrollCol + effectiveWidth);
          if (display.length < effectiveWidth) {
            display = display.padEnd(effectiveWidth, ' ');
          }

          if (absoluteRow === cursorRow) {
            const relativeCol = cursorCol - scrollCol;
            const highlightCol = relativeCol;

            if (highlightCol >= 0 && highlightCol < effectiveWidth) {
              const charToHighlight = display[highlightCol] || ' ';
              const highlighted = chalk.inverse(charToHighlight);
              display =
                display.slice(0, highlightCol) +
                highlighted +
                display.slice(highlightCol + 1);
            } else if (relativeCol === effectiveWidth) {
              display =
                display.slice(0, effectiveWidth - 1) + chalk.inverse(' ');
            }
          }
          return <Text key={idx}>{display}</Text>;
        })
      )}
    </Box>
  );
};
