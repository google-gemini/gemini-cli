/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TextBufferState, TextBufferAction } from './text-buffer.js';
import {
  getLineRangeOffsets,
  getPositionFromOffsets,
  replaceRangeInternal,
  pushUndo,
  detachExpandedPaste,
  isCombiningMark,
  findNextWordAcrossLines,
  findPrevWordAcrossLines,
  findNextBigWordAcrossLines,
  findPrevBigWordAcrossLines,
  findWordEndInLine,
  findBigWordEndInLine,
} from './text-buffer.js';
import { cpLen, toCodePoints } from '../../utils/textUtils.js';
import { assumeExhaustive } from '@google/gemini-cli-core';

export type VimAction = Extract<
  TextBufferAction,
  | { type: 'vim_delete_word_forward' }
  | { type: 'vim_delete_word_backward' }
  | { type: 'vim_delete_word_end' }
  | { type: 'vim_delete_big_word_forward' }
  | { type: 'vim_delete_big_word_backward' }
  | { type: 'vim_delete_big_word_end' }
  | { type: 'vim_change_word_forward' }
  | { type: 'vim_change_word_backward' }
  | { type: 'vim_change_word_end' }
  | { type: 'vim_change_big_word_forward' }
  | { type: 'vim_change_big_word_backward' }
  | { type: 'vim_change_big_word_end' }
  | { type: 'vim_delete_line' }
  | { type: 'vim_change_line' }
  | { type: 'vim_delete_to_end_of_line' }
  | { type: 'vim_delete_to_start_of_line' }
  | { type: 'vim_delete_to_first_nonwhitespace' }
  | { type: 'vim_change_to_end_of_line' }
  | { type: 'vim_change_to_start_of_line' }
  | { type: 'vim_change_to_first_nonwhitespace' }
  | { type: 'vim_delete_to_first_line' }
  | { type: 'vim_delete_to_last_line' }
  | { type: 'vim_change_movement' }
  | { type: 'vim_move_left' }
  | { type: 'vim_move_right' }
  | { type: 'vim_move_up' }
  | { type: 'vim_move_down' }
  | { type: 'vim_move_word_forward' }
  | { type: 'vim_move_word_backward' }
  | { type: 'vim_move_word_end' }
  | { type: 'vim_move_big_word_forward' }
  | { type: 'vim_move_big_word_backward' }
  | { type: 'vim_move_big_word_end' }
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

  switch (action.type) {
    case 'vim_delete_word_forward':
    case 'vim_change_word_forward': {
      const { count } = action.payload;
      let endRow = cursorRow;
      let endCol = cursorCol;

      for (let i = 0; i < count; i++) {
        const nextWord = findNextWordAcrossLines(lines, endRow, endCol, true);
        if (nextWord) {
          endRow = nextWord.row;
          endCol = nextWord.col;
        } else {
          // No more words. Check if we can delete to the end of the current word.
          const currentLine = lines[endRow] || '';
          const wordEnd = findWordEndInLine(currentLine, endCol);

          if (wordEnd !== null) {
            // Found word end, delete up to (and including) it
            endCol = wordEnd + 1;
          }
          // If wordEnd is null, we are likely on trailing whitespace, so do nothing.
          break;
        }
      }

      if (endRow !== cursorRow || endCol !== cursorCol) {
        const nextState = detachExpandedPaste(pushUndo(state));
        return replaceRangeInternal(
          nextState,
          cursorRow,
          cursorCol,
          endRow,
          endCol,
          '',
        );
      }
      return state;
    }

    case 'vim_delete_big_word_forward':
    case 'vim_change_big_word_forward': {
      const { count } = action.payload;
      let endRow = cursorRow;
      let endCol = cursorCol;

      for (let i = 0; i < count; i++) {
        const nextWord = findNextBigWordAcrossLines(
          lines,
          endRow,
          endCol,
          true,
        );
        if (nextWord) {
          endRow = nextWord.row;
          endCol = nextWord.col;
        } else {
          // No more words. Check if we can delete to the end of the current big word.
          const currentLine = lines[endRow] || '';
          const wordEnd = findBigWordEndInLine(currentLine, endCol);

          if (wordEnd !== null) {
            endCol = wordEnd + 1;
          }
          break;
        }
      }

      if (endRow !== cursorRow || endCol !== cursorCol) {
        const nextState = pushUndo(state);
        return replaceRangeInternal(
          nextState,
          cursorRow,
          cursorCol,
          endRow,
          endCol,
          '',
        );
      }
      return state;
    }

    case 'vim_delete_word_backward':
    case 'vim_change_word_backward': {
      const { count } = action.payload;
      let startRow = cursorRow;
      let startCol = cursorCol;

      for (let i = 0; i < count; i++) {
        const prevWord = findPrevWordAcrossLines(lines, startRow, startCol);
        if (prevWord) {
          startRow = prevWord.row;
          startCol = prevWord.col;
        } else {
          break;
        }
      }

      if (startRow !== cursorRow || startCol !== cursorCol) {
        const nextState = detachExpandedPaste(pushUndo(state));
        return replaceRangeInternal(
          nextState,
          startRow,
          startCol,
          cursorRow,
          cursorCol,
          '',
        );
      }
      return state;
    }

    case 'vim_delete_big_word_backward':
    case 'vim_change_big_word_backward': {
      const { count } = action.payload;
      let startRow = cursorRow;
      let startCol = cursorCol;

      for (let i = 0; i < count; i++) {
        const prevWord = findPrevBigWordAcrossLines(lines, startRow, startCol);
        if (prevWord) {
          startRow = prevWord.row;
          startCol = prevWord.col;
        } else {
          break;
        }
      }

      if (startRow !== cursorRow || startCol !== cursorCol) {
        const nextState = pushUndo(state);
        return replaceRangeInternal(
          nextState,
          startRow,
          startCol,
          cursorRow,
          cursorCol,
          '',
        );
      }
      return state;
    }

    case 'vim_delete_word_end':
    case 'vim_change_word_end': {
      const { count } = action.payload;
      let row = cursorRow;
      let col = cursorCol;
      let endRow = cursorRow;
      let endCol = cursorCol;

      for (let i = 0; i < count; i++) {
        const wordEnd = findNextWordAcrossLines(lines, row, col, false);
        if (wordEnd) {
          endRow = wordEnd.row;
          endCol = wordEnd.col + 1; // Include the character at word end
          // For next iteration, move to start of next word
          if (i < count - 1) {
            const nextWord = findNextWordAcrossLines(
              lines,
              wordEnd.row,
              wordEnd.col + 1,
              true,
            );
            if (nextWord) {
              row = nextWord.row;
              col = nextWord.col;
            } else {
              break; // No more words
            }
          }
        } else {
          break;
        }
      }

      // Ensure we don't go past the end of the last line
      if (endRow < lines.length) {
        const lineLen = cpLen(lines[endRow] || '');
        endCol = Math.min(endCol, lineLen);
      }

      if (endRow !== cursorRow || endCol !== cursorCol) {
        const nextState = detachExpandedPaste(pushUndo(state));
        return replaceRangeInternal(
          nextState,
          cursorRow,
          cursorCol,
          endRow,
          endCol,
          '',
        );
      }
      return state;
    }

    case 'vim_delete_big_word_end':
    case 'vim_change_big_word_end': {
      const { count } = action.payload;
      let row = cursorRow;
      let col = cursorCol;
      let endRow = cursorRow;
      let endCol = cursorCol;

      for (let i = 0; i < count; i++) {
        const wordEnd = findNextBigWordAcrossLines(lines, row, col, false);
        if (wordEnd) {
          endRow = wordEnd.row;
          endCol = wordEnd.col + 1; // Include the character at word end
          // For next iteration, move to start of next word
          if (i < count - 1) {
            const nextWord = findNextBigWordAcrossLines(
              lines,
              wordEnd.row,
              wordEnd.col + 1,
              true,
            );
            if (nextWord) {
              row = nextWord.row;
              col = nextWord.col;
            } else {
              break; // No more words
            }
          }
        } else {
          break;
        }
      }

      // Ensure we don't go past the end of the last line
      if (endRow < lines.length) {
        const lineLen = cpLen(lines[endRow] || '');
        endCol = Math.min(endCol, lineLen);
      }

      if (endRow !== cursorRow || endCol !== cursorCol) {
        const nextState = pushUndo(state);
        return replaceRangeInternal(
          nextState,
          cursorRow,
          cursorCol,
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
        const nextState = detachExpandedPaste(pushUndo(state));
        return {
          ...nextState,
          lines: [''],
          cursorRow: 0,
          cursorCol: 0,
          preferredCol: null,
        };
      }

      const nextState = detachExpandedPaste(pushUndo(state));
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
      const nextState = detachExpandedPaste(pushUndo(state));

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

    case 'vim_delete_to_end_of_line':
    case 'vim_change_to_end_of_line': {
      const { count } = action.payload;
      const currentLine = lines[cursorRow] || '';
      const totalLines = lines.length;

      if (count === 1) {
        // Single line: delete from cursor to end of current line
        if (cursorCol < cpLen(currentLine)) {
          const nextState = detachExpandedPaste(pushUndo(state));
          return replaceRangeInternal(
            nextState,
            cursorRow,
            cursorCol,
            cursorRow,
            cpLen(currentLine),
            '',
          );
        }
        return state;
      } else {
        // Multi-line: delete from cursor to end of current line, plus (count-1) entire lines below
        // For example, 2D = delete to EOL + delete next line entirely
        const linesToDelete = Math.min(count - 1, totalLines - cursorRow - 1);
        const endRow = cursorRow + linesToDelete;

        if (endRow === cursorRow) {
          // No additional lines to delete, just delete to EOL
          if (cursorCol < cpLen(currentLine)) {
            const nextState = detachExpandedPaste(pushUndo(state));
            return replaceRangeInternal(
              nextState,
              cursorRow,
              cursorCol,
              cursorRow,
              cpLen(currentLine),
              '',
            );
          }
          return state;
        }

        // Delete from cursor position to end of endRow (including newlines)
        const nextState = detachExpandedPaste(pushUndo(state));
        const endLine = lines[endRow] || '';
        return replaceRangeInternal(
          nextState,
          cursorRow,
          cursorCol,
          endRow,
          cpLen(endLine),
          '',
        );
      }
    }

    case 'vim_delete_to_start_of_line': {
      if (cursorCol > 0) {
        const nextState = detachExpandedPaste(pushUndo(state));
        return replaceRangeInternal(
          nextState,
          cursorRow,
          0,
          cursorRow,
          cursorCol,
          '',
        );
      }
      return state;
    }

    case 'vim_delete_to_first_nonwhitespace': {
      // Delete from cursor to first non-whitespace character (vim 'd^')
      const currentLine = lines[cursorRow] || '';
      const lineCodePoints = toCodePoints(currentLine);
      let firstNonWs = 0;
      while (
        firstNonWs < lineCodePoints.length &&
        /\s/.test(lineCodePoints[firstNonWs])
      ) {
        firstNonWs++;
      }
      // If line is all whitespace, firstNonWs would be lineCodePoints.length
      // In VIM, ^ on whitespace-only line goes to column 0
      if (firstNonWs >= lineCodePoints.length) {
        firstNonWs = 0;
      }
      // Delete between cursor and first non-whitespace (whichever direction)
      if (cursorCol !== firstNonWs) {
        const startCol = Math.min(cursorCol, firstNonWs);
        const endCol = Math.max(cursorCol, firstNonWs);
        const nextState = detachExpandedPaste(pushUndo(state));
        return replaceRangeInternal(
          nextState,
          cursorRow,
          startCol,
          cursorRow,
          endCol,
          '',
        );
      }
      return state;
    }

    case 'vim_change_to_start_of_line': {
      // Change from cursor to start of line (vim 'c0')
      if (cursorCol > 0) {
        const nextState = detachExpandedPaste(pushUndo(state));
        return replaceRangeInternal(
          nextState,
          cursorRow,
          0,
          cursorRow,
          cursorCol,
          '',
        );
      }
      return state;
    }

    case 'vim_change_to_first_nonwhitespace': {
      // Change from cursor to first non-whitespace character (vim 'c^')
      const currentLine = lines[cursorRow] || '';
      const lineCodePoints = toCodePoints(currentLine);
      let firstNonWs = 0;
      while (
        firstNonWs < lineCodePoints.length &&
        /\s/.test(lineCodePoints[firstNonWs])
      ) {
        firstNonWs++;
      }
      // If line is all whitespace, firstNonWs would be lineCodePoints.length
      // In VIM, ^ on whitespace-only line goes to column 0
      if (firstNonWs >= lineCodePoints.length) {
        firstNonWs = 0;
      }
      // Change between cursor and first non-whitespace (whichever direction)
      if (cursorCol !== firstNonWs) {
        const startCol = Math.min(cursorCol, firstNonWs);
        const endCol = Math.max(cursorCol, firstNonWs);
        const nextState = detachExpandedPaste(pushUndo(state));
        return replaceRangeInternal(
          nextState,
          cursorRow,
          startCol,
          cursorRow,
          endCol,
          '',
        );
      }
      return state;
    }

    case 'vim_delete_to_first_line': {
      // Delete from first line (or line N if count given) to current line (vim 'dgg' or 'd5gg')
      // count is the target line number (1-based), or 0 for first line
      const { count } = action.payload;
      const totalLines = lines.length;

      // Determine target row (0-based)
      // count=0 means go to first line, count=N means go to line N (1-based)
      let targetRow: number;
      if (count > 0) {
        targetRow = Math.min(count - 1, totalLines - 1);
      } else {
        targetRow = 0;
      }

      // Determine the range to delete (from min to max row, inclusive)
      const startRow = Math.min(cursorRow, targetRow);
      const endRow = Math.max(cursorRow, targetRow);
      const linesToDelete = endRow - startRow + 1;

      if (linesToDelete >= totalLines) {
        // Deleting all lines - keep one empty line
        const nextState = detachExpandedPaste(pushUndo(state));
        return {
          ...nextState,
          lines: [''],
          cursorRow: 0,
          cursorCol: 0,
          preferredCol: null,
        };
      }

      const nextState = detachExpandedPaste(pushUndo(state));
      const newLines = [...nextState.lines];
      newLines.splice(startRow, linesToDelete);

      // Cursor goes to start of the deleted range, clamped to valid bounds
      const newCursorRow = Math.min(startRow, newLines.length - 1);

      return {
        ...nextState,
        lines: newLines,
        cursorRow: newCursorRow,
        cursorCol: 0,
        preferredCol: null,
      };
    }

    case 'vim_delete_to_last_line': {
      // Delete from current line to last line (vim 'dG') or to line N (vim 'd5G')
      // count is the target line number (1-based), or 0 for last line
      const { count } = action.payload;
      const totalLines = lines.length;

      // Determine target row (0-based)
      // count=0 means go to last line, count=N means go to line N (1-based)
      let targetRow: number;
      if (count > 0) {
        targetRow = Math.min(count - 1, totalLines - 1);
      } else {
        targetRow = totalLines - 1;
      }

      // Determine the range to delete (from min to max row, inclusive)
      const startRow = Math.min(cursorRow, targetRow);
      const endRow = Math.max(cursorRow, targetRow);
      const linesToDelete = endRow - startRow + 1;

      if (linesToDelete >= totalLines) {
        // Deleting all lines - keep one empty line
        const nextState = detachExpandedPaste(pushUndo(state));
        return {
          ...nextState,
          lines: [''],
          cursorRow: 0,
          cursorCol: 0,
          preferredCol: null,
        };
      }

      const nextState = detachExpandedPaste(pushUndo(state));
      const newLines = [...nextState.lines];
      newLines.splice(startRow, linesToDelete);

      // Move cursor to the start of the deleted range (or last line if needed)
      const newCursorRow = Math.min(startRow, newLines.length - 1);

      return {
        ...nextState,
        lines: newLines,
        cursorRow: newCursorRow,
        cursorCol: 0,
        preferredCol: null,
      };
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
            detachExpandedPaste(pushUndo(state)),
            cursorRow,
            startCol,
            cursorRow,
            cursorCol,
            '',
          );
        }

        case 'j': {
          // Down - delete/change current line + count lines below
          const linesToChange = Math.min(count + 1, totalLines - cursorRow);
          if (linesToChange > 0) {
            if (linesToChange >= totalLines) {
              // Deleting all lines - keep one empty line
              const nextState = detachExpandedPaste(pushUndo(state));
              return {
                ...nextState,
                lines: [''],
                cursorRow: 0,
                cursorCol: 0,
                preferredCol: null,
              };
            }

            const nextState = detachExpandedPaste(pushUndo(state));
            const newLines = [...nextState.lines];
            newLines.splice(cursorRow, linesToChange);

            return {
              ...nextState,
              lines: newLines,
              cursorRow: Math.min(cursorRow, newLines.length - 1),
              cursorCol: 0,
              preferredCol: null,
            };
          }
          return state;
        }

        case 'k': {
          // Up - delete/change current line + count lines above
          const startRow = Math.max(0, cursorRow - count);
          const linesToChange = cursorRow - startRow + 1;

          if (linesToChange > 0) {
            if (linesToChange >= totalLines) {
              // Deleting all lines - keep one empty line
              const nextState = detachExpandedPaste(pushUndo(state));
              return {
                ...nextState,
                lines: [''],
                cursorRow: 0,
                cursorCol: 0,
                preferredCol: null,
              };
            }

            const nextState = detachExpandedPaste(pushUndo(state));
            const newLines = [...nextState.lines];
            newLines.splice(startRow, linesToChange);

            return {
              ...nextState,
              lines: newLines,
              cursorRow: Math.min(startRow, newLines.length - 1),
              cursorCol: 0,
              preferredCol: null,
            };
          }
          return state;
        }

        case 'l': {
          // Right
          // Change N characters to the right
          return replaceRangeInternal(
            detachExpandedPaste(pushUndo(state)),
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

          // Skip over combining marks - don't let cursor land on them
          const currentLinePoints = toCodePoints(currentLine);
          while (
            newCol < currentLinePoints.length &&
            isCombiningMark(currentLinePoints[newCol]) &&
            newCol < lineLength - 1
          ) {
            newCol++;
          }
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
      const targetLine = lines[newRow] || '';
      const targetLineLength = cpLen(targetLine);
      const newCol = Math.min(
        cursorCol,
        targetLineLength > 0 ? targetLineLength - 1 : 0,
      );

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
      const targetLine = lines[newRow] || '';
      const targetLineLength = cpLen(targetLine);
      const newCol = Math.min(
        cursorCol,
        targetLineLength > 0 ? targetLineLength - 1 : 0,
      );

      return {
        ...state,
        cursorRow: newRow,
        cursorCol: newCol,
        preferredCol: null,
      };
    }

    case 'vim_move_word_forward': {
      const { count } = action.payload;
      let row = cursorRow;
      let col = cursorCol;

      for (let i = 0; i < count; i++) {
        const nextWord = findNextWordAcrossLines(lines, row, col, true);
        if (nextWord) {
          row = nextWord.row;
          col = nextWord.col;
        } else {
          // No more words to move to
          break;
        }
      }

      return {
        ...state,
        cursorRow: row,
        cursorCol: col,
        preferredCol: null,
      };
    }

    case 'vim_move_big_word_forward': {
      const { count } = action.payload;
      let row = cursorRow;
      let col = cursorCol;

      for (let i = 0; i < count; i++) {
        const nextWord = findNextBigWordAcrossLines(lines, row, col, true);
        if (nextWord) {
          row = nextWord.row;
          col = nextWord.col;
        } else {
          // No more words to move to
          break;
        }
      }

      return {
        ...state,
        cursorRow: row,
        cursorCol: col,
        preferredCol: null,
      };
    }

    case 'vim_move_word_backward': {
      const { count } = action.payload;
      let row = cursorRow;
      let col = cursorCol;

      for (let i = 0; i < count; i++) {
        const prevWord = findPrevWordAcrossLines(lines, row, col);
        if (prevWord) {
          row = prevWord.row;
          col = prevWord.col;
        } else {
          break;
        }
      }

      return {
        ...state,
        cursorRow: row,
        cursorCol: col,
        preferredCol: null,
      };
    }

    case 'vim_move_big_word_backward': {
      const { count } = action.payload;
      let row = cursorRow;
      let col = cursorCol;

      for (let i = 0; i < count; i++) {
        const prevWord = findPrevBigWordAcrossLines(lines, row, col);
        if (prevWord) {
          row = prevWord.row;
          col = prevWord.col;
        } else {
          break;
        }
      }

      return {
        ...state,
        cursorRow: row,
        cursorCol: col,
        preferredCol: null,
      };
    }

    case 'vim_move_word_end': {
      const { count } = action.payload;
      let row = cursorRow;
      let col = cursorCol;

      for (let i = 0; i < count; i++) {
        const wordEnd = findNextWordAcrossLines(lines, row, col, false);
        if (wordEnd) {
          row = wordEnd.row;
          col = wordEnd.col;
        } else {
          break;
        }
      }

      return {
        ...state,
        cursorRow: row,
        cursorCol: col,
        preferredCol: null,
      };
    }

    case 'vim_move_big_word_end': {
      const { count } = action.payload;
      let row = cursorRow;
      let col = cursorCol;

      for (let i = 0; i < count; i++) {
        const wordEnd = findNextBigWordAcrossLines(lines, row, col, false);
        if (wordEnd) {
          row = wordEnd.row;
          col = wordEnd.col;
        } else {
          break;
        }
      }

      return {
        ...state,
        cursorRow: row,
        cursorCol: col,
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
        const nextState = detachExpandedPaste(pushUndo(state));
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
      const nextState = detachExpandedPaste(pushUndo(state));

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
      const nextState = detachExpandedPaste(pushUndo(state));

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
      const lineCodePoints = toCodePoints(currentLine);
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
      const lineCodePoints = toCodePoints(currentLine);
      while (col < lineCodePoints.length && /\s/.test(lineCodePoints[col])) {
        col++;
      }

      // If line is all whitespace or empty, ^ goes to column 0 (standard Vim behavior)
      if (col >= lineCodePoints.length) {
        col = 0;
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
      assumeExhaustive(action);
      return state;
    }
  }
}
