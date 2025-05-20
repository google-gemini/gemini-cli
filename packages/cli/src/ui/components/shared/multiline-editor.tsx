/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useTextBuffer, cpSlice, cpLen } from './text-buffer.js';
import chalk from 'chalk';
import { Box, Text, useInput, useStdin, Key } from 'ink';
import React from 'react';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { Colors } from '../../colors.js';
import stringWidth from 'string-width';

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
      if (isCtrlX) {
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
        if (
          buffer.visualCursor[0] === 0 &&
          buffer.visualScrollRow === 0 &&
          navigateUp
        ) {
          navigateUp();
          return;
        }
      }

      if (key.downArrow) {
        if (
          buffer.visualCursor[0] === buffer.allVisualLines.length - 1 &&
          navigateDown
        ) {
          navigateDown();
          return;
        }
      }

      buffer.handleInput(input, key as Record<string, boolean>);
    },
    { isActive: focus },
  );

  const linesToRender = buffer.viewportVisualLines; // This is the subset of visual lines for display
  const [cursorVisualRowAbsolute, cursorVisualColAbsolute] =
    buffer.visualCursor; // This is relative to *all* visual lines
  const scrollVisualRow = buffer.visualScrollRow;
  // scrollHorizontalCol removed as it's always 0 due to word wrap

  return (
    <Box flexDirection="column">
      {buffer.text.length === 0 && placeholder ? (
        <Text color={Colors.SubtleComment}>{placeholder}</Text>
      ) : (
        linesToRender.map((lineText, visualIdxInRenderedSet) => {
          // cursorVisualRow is the cursor's row index within the currently *rendered* set of visual lines
          const cursorVisualRow = cursorVisualRowAbsolute - scrollVisualRow;

          let display = cpSlice(
            lineText,
            0, // Start from 0 as horizontal scroll is disabled
            effectiveWidth, // This is still code point based for slicing
          );
          // Pad based on visual width
          const currentVisualWidth = stringWidth(display);
          if (currentVisualWidth < effectiveWidth) {
            display = display + ' '.repeat(effectiveWidth - currentVisualWidth);
          }

          if (visualIdxInRenderedSet === cursorVisualRow) {
            const relativeVisualColForHighlight = cursorVisualColAbsolute; // Directly use absolute as horizontal scroll is 0

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
          return <Text key={visualIdxInRenderedSet}>{display}</Text>;
        })
      )}
    </Box>
  );
};
