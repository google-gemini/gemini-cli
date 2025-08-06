/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  TextBufferState,
  TextBufferAction,
  findNextWordStart,
  findPrevWordStart,
  findWordEnd,
  getOffsetFromPosition,
  getPositionFromOffsets,
  getLineRangeOffsets,
  replaceRangeInternal,
  pushUndo,
} from './text-buffer.js';
import { cpLen } from '../../utils/textUtils.js';

export type VimAction = Extract<
  TextBufferAction,
  | { type: 'vim_delete_word_forward' }
  | { type: 'vim_delete_word_backward' }
  | { type: 'vim_delete_word_end' }
  | { type: 'vim_change_word_forward' }
  | { type: 'vim_change_word_backward' }
  | { type: 'vim_change_word_end' }
  | { type: 'vim_delete_line' }
  | { type: 'vim_change_line' }
  | { type: 'vim_delete_to_end_of_line' }
  | { type: 'vim_change_to_end_of_line' }
  | { type: 'vim_change_movement' }
  | { type: 'vim_move_left' }
  | { type: 'vim_move_right' }
  | { type: 'vim_move_up' }
  | { type: 'vim_move_down' }
  | { type: 'vim_move_word_forward' }
  | { type: 'vim_move_word_backward' }
  | { type: 'vim_move_word_end' }
  | { type: 'vim_delete_char' }
  | { type: 'vim_insert_at_cursor' }
  | { type: 'vim_append_at_cursor' }
  | { type: 'vim_open_line_below' }
  | { type: 'vim_open_line_above' }
  | { type: 'vim_append_at_line_end' }
  | { type: 'vim_insert_at_line_start' }
  | { type: 'vim_move_to_line_start' }
  | { type: 'vim_move_to_line_end' }
  | { type: 'vim_move_to_first_nonwhitespace' }
  | { type: 'vim_move_to_first_line' }
  | { type: 'vim_move_to_last_line' }
  | { type: 'vim_move_to_line' }
  | { type: 'vim_escape_insert_mode' }
>;

export function handleVimAction(
  state: TextBufferState,
  action: VimAction,
): TextBufferState {
  const { lines, cursorRow, cursorCol } = state;
  // Cache text join to avoid repeated calculations for word operations
  let text: string | null = null;
  const getText = () => text ?? (text = lines.join('\n'));

  switch (action.type) {
    case 'vim_delete_word_forward': {
      const { count } = action.payload;
      const currentOffset = getOffsetFromPosition(cursorRow, cursorCol, lines);

      let endOffset = currentOffset;
      let searchOffset = currentOffset;

      for (let i = 0; i < count; i++) {
        const nextWordOffset = findNextWordStart(getText(), searchOffset);
        if (nextWordOffset > searchOffset) {
          searchOffset = nextWordOffset;
          endOffset = nextWordOffset;
        } else {
          // If no next word, delete to end of current word
          const wordEndOffset = findWordEnd(getText(), searchOffset);
          endOffset = Math.min(wordEndOffset + 1, getText().length);
          break;
        }
      }

      if (endOffset > currentOffset) {
        const nextState = pushUndo(state);
        const { startRow, startCol, endRow, endCol } = getPositionFromOffsets(
          currentOffset,
          endOffset,
          nextState.lines,
        );
        return replaceRangeInternal(
          nextState,
          startRow,
          startCol,
          endRow,
          endCol,
          '',
        );
      }
      return state;
    }

    case 'vim_delete_word_backward': {
      const { count } = action.payload;
      const currentOffset = getOffsetFromPosition(cursorRow, cursorCol, lines);

      let startOffset = currentOffset;
      let searchOffset = currentOffset;

      for (let i = 0; i < count; i++) {
        const prevWordOffset = findPrevWordStart(getText(), searchOffset);
        if (prevWordOffset < searchOffset) {
          searchOffset = prevWordOffset;
          startOffset = prevWordOffset;
        } else {
          break;
        }
      }

      if (startOffset < currentOffset) {
        const nextState = pushUndo(state);
        const { startRow, startCol, endRow, endCol } = getPositionFromOffsets(
          startOffset,
          currentOffset,
          nextState.lines,
        );
        const newState = replaceRangeInternal(
          nextState,
          startRow,
          startCol,
          endRow,
          endCol,
          '',
        );
        // Cursor is already at the correct position after deletion
        return newState;
      }
      return state;
    }

    case 'vim_delete_word_end': {
      const { count } = action.payload;
      const currentOffset = getOffsetFromPosition(cursorRow, cursorCol, lines);

      let offset = currentOffset;
      let endOffset = currentOffset;

      for (let i = 0; i < count; i++) {
        const wordEndOffset = findWordEnd(getText(), offset);
        if (wordEndOffset >= offset) {
          endOffset = wordEndOffset + 1; // Include the character at word end
          // For next iteration, move to start of next word
          if (i < count - 1) {
            const nextWordStart = findNextWordStart(
              getText(),
              wordEndOffset + 1,
            );
            offset = nextWordStart;
            if (nextWordStart <= wordEndOffset) {
              break; // No more words
            }
          }
        } else {
          break;
        }
      }

      endOffset = Math.min(endOffset, getText().length);

      if (endOffset > currentOffset) {
        const nextState = pushUndo(state);
        const { startRow, startCol, endRow, endCol } = getPositionFromOffsets(
          currentOffset,
          endOffset,
          nextState.lines,
        );
        return replaceRangeInternal(
          nextState,
          startRow,
          startCol,
          endRow,
          endCol,
          '',
        );
      }
      return state;
    }

    case 'vim_change_word_forward': {
      const { count } = action.payload;
      const currentOffset = getOffsetFromPosition(cursorRow, cursorCol, lines);

      let searchOffset = currentOffset;
      let endOffset = currentOffset;

      for (let i = 0; i < count; i++) {
        const nextWordOffset = findNextWordStart(getText(), searchOffset);
        if (nextWordOffset > searchOffset) {
          searchOffset = nextWordOffset;
          endOffset = nextWordOffset;
        } else {
          // If no next word, change to end of current word
          const wordEndOffset = findWordEnd(getText(), searchOffset);
          endOffset = Math.min(wordEndOffset + 1, getText().length);
          break;
        }
      }

      if (endOffset > currentOffset) {
        const nextState = pushUndo(state);
        const { startRow, startCol, endRow, endCol } = getPositionFromOffsets(
          currentOffset,
          endOffset,
          nextState.lines,
        );
        return replaceRangeInternal(
          nextState,
          startRow,
          startCol,
          endRow,
          endCol,
          '',
        );
      }
      return state;
    }

    case 'vim_change_word_backward': {
      const { count } = action.payload;
      const currentOffset = getOffsetFromPosition(cursorRow, cursorCol, lines);

      let startOffset = currentOffset;
      let searchOffset = currentOffset;

      for (let i = 0; i < count; i++) {
        const prevWordOffset = findPrevWordStart(getText(), searchOffset);
        if (prevWordOffset < searchOffset) {
          searchOffset = prevWordOffset;
          startOffset = prevWordOffset;
        } else {
          break;
        }
      }

      if (startOffset < currentOffset) {
        const nextState = pushUndo(state);
        const { startRow, startCol, endRow, endCol } = getPositionFromOffsets(
          startOffset,
          currentOffset,
          nextState.lines,
        );
        return replaceRangeInternal(
          nextState,
          startRow,
          startCol,
          endRow,
          endCol,
          '',
        );
      }
      return state;
    }

    case 'vim_change_word_end': {
      const { count } = action.payload;
      const currentOffset = getOffsetFromPosition(cursorRow, cursorCol, lines);

      let offset = currentOffset;
      let endOffset = currentOffset;

      for (let i = 0; i < count; i++) {
        const wordEndOffset = findWordEnd(getText(), offset);
        if (wordEndOffset >= offset) {
          endOffset = wordEndOffset + 1; // Include the character at word end
          // For next iteration, move to start of next word
          if (i < count - 1) {
            const nextWordStart = findNextWordStart(
              getText(),
              wordEndOffset + 1,
            );
            offset = nextWordStart;
            if (nextWordStart <= wordEndOffset) {
              break; // No more words
            }
          }
        } else {
          break;
        }
      }

      endOffset = Math.min(endOffset, getText().length);

      if (endOffset !== currentOffset) {
        const nextState = pushUndo(state);
        const { startRow, startCol, endRow, endCol } = getPositionFromOffsets(
          Math.min(currentOffset, endOffset),
          Math.max(currentOffset, endOffset),
          nextState.lines,
        );
        return replaceRangeInternal(
          nextState,
          startRow,
          startCol,
          endRow,
          endCol,
          '',
        );
      }
      return state;
    }

    case 'vim_delete_line': {
      const { count } = action.payload;
      if (lines.length === 0) return state;

      const linesToDelete = Math.min(count, lines.length - cursorRow);
      const totalLines = lines.length;

      if (totalLines === 1 || linesToDelete >= totalLines) {
        // If there's only one line, or we're deleting all remaining lines,
        // clear the content but keep one empty line (text editors should never be completely empty)
        const nextState = pushUndo(state);
        return {
          ...nextState,
          lines: [''],
          cursorRow: 0,
          cursorCol: 0,
          preferredCol: null,
        };
      }

      const nextState = pushUndo(state);
      const newLines = [...nextState.lines];
      newLines.splice(cursorRow, linesToDelete);

      // Adjust cursor position
      const newCursorRow = Math.min(cursorRow, newLines.length - 1);
      const newCursorCol = 0; // Vim places cursor at beginning of line after dd

      return {
        ...nextState,
        lines: newLines,
        cursorRow: newCursorRow,
        cursorCol: newCursorCol,
        preferredCol: null,
      };
    }

    case 'vim_change_line': {
      const { count } = action.payload;
      if (lines.length === 0) return state;

      const linesToChange = Math.min(count, lines.length - cursorRow);
      const nextState = pushUndo(state);

      const { startOffset, endOffset } = getLineRangeOffsets(
        cursorRow,
        linesToChange,
        nextState.lines,
      );
      const { startRow, startCol, endRow, endCol } = getPositionFromOffsets(
        startOffset,
        endOffset,
        nextState.lines,
      );
      return replaceRangeInternal(
        nextState,
        startRow,
        startCol,
        endRow,
        endCol,
        '',
      );
    }

    case 'vim_delete_to_end_of_line': {
      const currentLine = lines[cursorRow] || '';
      if (cursorCol < currentLine.length) {
        const nextState = pushUndo(state);
        return replaceRangeInternal(
          nextState,
          cursorRow,
          cursorCol,
          cursorRow,
          currentLine.length,
          '',
        );
      }
      return state;
    }

    case 'vim_change_to_end_of_line': {
      const currentLine = lines[cursorRow] || '';
      if (cursorCol < currentLine.length) {
        const nextState = pushUndo(state);
        return replaceRangeInternal(
          nextState,
          cursorRow,
          cursorCol,
          cursorRow,
          currentLine.length,
          '',
        );
      }
      return state;
    }

    case 'vim_change_movement': {
      const { movement, count } = action.payload;
      const totalLines = lines.length;

      switch (movement) {
        case 'h': {
          // Left
          // Change N characters to the left
          const startCol = Math.max(0, cursorCol - count);
          return replaceRangeInternal(
            pushUndo(state),
            cursorRow,
            startCol,
            cursorRow,
            cursorCol,
            '',
          );
        }

        case 'j': {
          // Down
          const linesToChange = Math.min(count, totalLines - cursorRow);
          if (linesToChange > 0) {
            if (totalLines === 1) {
              const currentLine = state.lines[0] || '';
              return replaceRangeInternal(
                pushUndo(state),
                0,
                0,
                0,
                cpLen(currentLine),
                '',
              );
            } else {
              const nextState = pushUndo(state);
              const { startOffset, endOffset } = getLineRangeOffsets(
                cursorRow,
                linesToChange,
                nextState.lines,
              );
              const { startRow, startCol, endRow, endCol } =
                getPositionFromOffsets(startOffset, endOffset, nextState.lines);
              return replaceRangeInternal(
                nextState,
                startRow,
                startCol,
                endRow,
                endCol,
                '',
              );
            }
          }
          return state;
        }

        case 'k': {
          // Up
          const upLines = Math.min(count, cursorRow + 1);
          if (upLines > 0) {
            if (state.lines.length === 1) {
              const currentLine = state.lines[0] || '';
              return replaceRangeInternal(
                pushUndo(state),
                0,
                0,
                0,
                cpLen(currentLine),
                '',
              );
            } else {
              const startRow = Math.max(0, cursorRow - count + 1);
              const linesToChange = cursorRow - startRow + 1;
              const nextState = pushUndo(state);
              const { startOffset, endOffset } = getLineRangeOffsets(
                startRow,
                linesToChange,
                nextState.lines,
              );
              const {
                startRow: newStartRow,
                startCol,
                endRow,
                endCol,
              } = getPositionFromOffsets(
                startOffset,
                endOffset,
                nextState.lines,
              );
              const resultState = replaceRangeInternal(
                nextState,
                newStartRow,
                startCol,
                endRow,
                endCol,
                '',
              );
              return {
                ...resultState,
                cursorRow: startRow,
                cursorCol: 0,
              };
            }
          }
          return state;
        }

        case 'l': {
          // Right
          // Change N characters to the right
          return replaceRangeInternal(
            pushUndo(state),
            cursorRow,
            cursorCol,
            cursorRow,
            Math.min(cpLen(lines[cursorRow] || ''), cursorCol + count),
            '',
          );
        }

        default:
          return state;
      }
    }

    case 'vim_move_left': {
      const { count } = action.payload;
      const { cursorRow, cursorCol, lines } = state;
      let newRow = cursorRow;
      let newCol = cursorCol;

      for (let i = 0; i < count; i++) {
        if (newCol > 0) {
          newCol--;
        } else if (newRow > 0) {
          // Move to end of previous line
          newRow--;
          const prevLine = lines[newRow] || '';
          const prevLineLength = cpLen(prevLine);
          // Position on last character, or column 0 for empty lines
          newCol = prevLineLength === 0 ? 0 : prevLineLength - 1;
        }
      }

      return {
        ...state,
        cursorRow: newRow,
        cursorCol: newCol,
        preferredCol: null,
      };
    }

    case 'vim_move_right': {
      const { count } = action.payload;
      const { cursorRow, cursorCol, lines } = state;
      let newRow = cursorRow;
      let newCol = cursorCol;

      for (let i = 0; i < count; i++) {
        const currentLine = lines[newRow] || '';
        const lineLength = cpLen(currentLine);
        // Don't move past the last character of the line
        // For empty lines, stay at column 0; for non-empty lines, don't go past last character
        if (lineLength === 0) {
          // Empty line - try to move to next line
          if (newRow < lines.length - 1) {
            newRow++;
            newCol = 0;
          }
        } else if (newCol < lineLength - 1) {
          newCol++;
        } else if (newRow < lines.length - 1) {
          // At end of line - move to beginning of next line
          newRow++;
          newCol = 0;
        }
      }

      return {
        ...state,
        cursorRow: newRow,
        cursorCol: newCol,
        preferredCol: null,
      };
    }

    case 'vim_move_up': {
      const { count } = action.payload;
      const { cursorRow, cursorCol, lines } = state;
      const newRow = Math.max(0, cursorRow - count);
      const newCol = Math.min(cursorCol, cpLen(lines[newRow] || ''));

      return {
        ...state,
        cursorRow: newRow,
        cursorCol: newCol,
        preferredCol: null,
      };
    }

    case 'vim_move_down': {
      const { count } = action.payload;
      const { cursorRow, cursorCol, lines } = state;
      const newRow = Math.min(lines.length - 1, cursorRow + count);
      const newCol = Math.min(cursorCol, cpLen(lines[newRow] || ''));

      return {
        ...state,
        cursorRow: newRow,
        cursorCol: newCol,
        preferredCol: null,
      };
    }

    case 'vim_move_word_forward': {
      const { count } = action.payload;
      let offset = getOffsetFromPosition(cursorRow, cursorCol, lines);

      for (let i = 0; i < count; i++) {
        const nextWordOffset = findNextWordStart(getText(), offset);
        if (nextWordOffset > offset) {
          offset = nextWordOffset;
        } else {
          // No more words to move to
          break;
        }
      }

      const { startRow, startCol } = getPositionFromOffsets(
        offset,
        offset,
        lines,
      );
      return {
        ...state,
        cursorRow: startRow,
        cursorCol: startCol,
        preferredCol: null,
      };
    }

    case 'vim_move_word_backward': {
      const { count } = action.payload;
      let offset = getOffsetFromPosition(cursorRow, cursorCol, lines);

      for (let i = 0; i < count; i++) {
        offset = findPrevWordStart(getText(), offset);
      }

      const { startRow, startCol } = getPositionFromOffsets(
        offset,
        offset,
        lines,
      );
      return {
        ...state,
        cursorRow: startRow,
        cursorCol: startCol,
        preferredCol: null,
      };
    }

    case 'vim_move_word_end': {
      const { count } = action.payload;
      let offset = getOffsetFromPosition(cursorRow, cursorCol, lines);

      for (let i = 0; i < count; i++) {
        offset = findWordEnd(getText(), offset);
      }

      const { startRow, startCol } = getPositionFromOffsets(
        offset,
        offset,
        lines,
      );
      return {
        ...state,
        cursorRow: startRow,
        cursorCol: startCol,
        preferredCol: null,
      };
    }

    case 'vim_delete_char': {
      const { count } = action.payload;
      const { cursorRow, cursorCol, lines } = state;
      const currentLine = lines[cursorRow] || '';
      const lineLength = cpLen(currentLine);

      if (cursorCol < lineLength) {
        const deleteCount = Math.min(count, lineLength - cursorCol);
        const nextState = pushUndo(state);
        return replaceRangeInternal(
          nextState,
          cursorRow,
          cursorCol,
          cursorRow,
          cursorCol + deleteCount,
          '',
        );
      }
      return state;
    }

    case 'vim_insert_at_cursor': {
      // Just return state - mode change is handled elsewhere
      return state;
    }

    case 'vim_append_at_cursor': {
      const { cursorRow, cursorCol, lines } = state;
      const currentLine = lines[cursorRow] || '';
      const newCol = cursorCol < cpLen(currentLine) ? cursorCol + 1 : cursorCol;

      return {
        ...state,
        cursorCol: newCol,
        preferredCol: null,
      };
    }

    case 'vim_open_line_below': {
      const { cursorRow, lines } = state;
      const nextState = pushUndo(state);

      // Insert newline at end of current line
      const endOfLine = cpLen(lines[cursorRow] || '');
      return replaceRangeInternal(
        nextState,
        cursorRow,
        endOfLine,
        cursorRow,
        endOfLine,
        '\n',
      );
    }

    case 'vim_open_line_above': {
      const { cursorRow } = state;
      const nextState = pushUndo(state);

      // Insert newline at beginning of current line
      const resultState = replaceRangeInternal(
        nextState,
        cursorRow,
        0,
        cursorRow,
        0,
        '\n',
      );

      // Move cursor to the new line above
      return {
        ...resultState,
        cursorRow,
        cursorCol: 0,
      };
    }

    case 'vim_append_at_line_end': {
      const { cursorRow, lines } = state;
      const lineLength = cpLen(lines[cursorRow] || '');

      return {
        ...state,
        cursorCol: lineLength,
        preferredCol: null,
      };
    }

    case 'vim_insert_at_line_start': {
      const { cursorRow, lines } = state;
      const currentLine = lines[cursorRow] || '';
      let col = 0;

      // Find first non-whitespace character using proper Unicode handling
      const lineCodePoints = [...currentLine]; // Proper Unicode iteration
      while (col < lineCodePoints.length && /\s/.test(lineCodePoints[col])) {
        col++;
      }

      return {
        ...state,
        cursorCol: col,
        preferredCol: null,
      };
    }

    case 'vim_move_to_line_start': {
      return {
        ...state,
        cursorCol: 0,
        preferredCol: null,
      };
    }

    case 'vim_move_to_line_end': {
      const { cursorRow, lines } = state;
      const lineLength = cpLen(lines[cursorRow] || '');

      return {
        ...state,
        cursorCol: lineLength > 0 ? lineLength - 1 : 0,
        preferredCol: null,
      };
    }

    case 'vim_move_to_first_nonwhitespace': {
      const { cursorRow, lines } = state;
      const currentLine = lines[cursorRow] || '';
      let col = 0;

      // Find first non-whitespace character using proper Unicode handling
      const lineCodePoints = [...currentLine]; // Proper Unicode iteration
      while (col < lineCodePoints.length && /\s/.test(lineCodePoints[col])) {
        col++;
      }

      return {
        ...state,
        cursorCol: col,
        preferredCol: null,
      };
    }

    case 'vim_move_to_first_line': {
      return {
        ...state,
        cursorRow: 0,
        cursorCol: 0,
        preferredCol: null,
      };
    }

    case 'vim_move_to_last_line': {
      const { lines } = state;
      const lastRow = lines.length - 1;

      return {
        ...state,
        cursorRow: lastRow,
        cursorCol: 0,
        preferredCol: null,
      };
    }

    case 'vim_move_to_line': {
      const { lineNumber } = action.payload;
      const { lines } = state;
      const targetRow = Math.min(Math.max(0, lineNumber - 1), lines.length - 1);

      return {
        ...state,
        cursorRow: targetRow,
        cursorCol: 0,
        preferredCol: null,
      };
    }

    case 'vim_escape_insert_mode': {
      // Move cursor left if not at beginning of line (vim behavior when exiting insert mode)
      const { cursorCol } = state;
      const newCol = cursorCol > 0 ? cursorCol - 1 : 0;

      return {
        ...state,
        cursorCol: newCol,
        preferredCol: null,
      };
    }

    default: {
      // This should never happen if TypeScript is working correctly
      const _exhaustiveCheck: never = action;
      return state;
    }
  }
}
