/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  TextBufferState,
  TextBufferAction,
  getLineRangeOffsets,
  getPositionFromOffsets,
  replaceRangeInternal,
  pushUndo,
  isWordCharStrict,
  isWordCharWithCombining,
  isCombiningMark,
  findNextWordAcrossLines,
  findPrevWordAcrossLines,
  findWordEndInLine,
} from './text-buffer.js';
import { cpLen, toCodePoints } from '../../utils/textUtils.js';

// Check if we're at the end of a base word (on the last base character)
// Returns true if current position has a base character followed only by combining marks until non-word
function isAtEndOfBaseWord(lineCodePoints: string[], col: number): boolean {
  if (!isWordCharStrict(lineCodePoints[col])) return false;

  // Look ahead to see if we have only combining marks followed by non-word
  let i = col + 1;

  // Skip any combining marks
  while (i < lineCodePoints.length && isCombiningMark(lineCodePoints[i])) {
    i++;
  }

  // If we hit end of line or non-word character, we were at end of base word
  return i >= lineCodePoints.length || !isWordCharStrict(lineCodePoints[i]);
}

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
          // No more words, delete/change to end of current word or line
          const currentLine = lines[endRow] || '';
          const wordEnd = findWordEndInLine(currentLine, endCol);
          if (wordEnd !== null) {
            endCol = wordEnd + 1; // Include the character at word end
          } else {
            endCol = cpLen(currentLine);
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

    case 'vim_delete_to_end_of_line':
    case 'vim_change_to_end_of_line': {
      const currentLine = lines[cursorRow] || '';
      if (cursorCol < cpLen(currentLine)) {
        const nextState = pushUndo(state);
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

    case 'vim_move_word_end': {
      const { count } = action.payload;
      let row = cursorRow;
      let col = cursorCol;

      for (let i = 0; i < count; i++) {
        // Special handling for the first iteration when we're at end of word
        if (i === 0) {
          const currentLine = lines[row] || '';
          const lineCodePoints = toCodePoints(currentLine);

          // Check if we're at the end of a word (on the last base character)
          const atEndOfWord =
            col < lineCodePoints.length &&
            isWordCharStrict(lineCodePoints[col]) &&
            (col + 1 >= lineCodePoints.length ||
              !isWordCharWithCombining(lineCodePoints[col + 1]) ||
              // Or if we're on a base char followed only by combining marks until non-word
              (isWordCharStrict(lineCodePoints[col]) &&
                isAtEndOfBaseWord(lineCodePoints, col)));

          if (atEndOfWord) {
            // We're already at end of word, find next word end
            const nextWord = findNextWordAcrossLines(
              lines,
              row,
              col + 1,
              false,
            );
            if (nextWord) {
              row = nextWord.row;
              col = nextWord.col;
              continue;
            }
          }
        }

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
