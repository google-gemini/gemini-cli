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
  isWordCharStrict,
  isWordCharWithCombining,
  isCombiningMark,
  findNextWordAcrossLines,
  findPrevWordAcrossLines,
  findWordEndInLine,
  findNextBigWordAcrossLines,
  findPrevBigWordAcrossLines,
  findBigWordEndInLine,
} from './text-buffer.js';
import { cpLen, toCodePoints, cpSlice } from '../../utils/textUtils.js';
// import { assumeExhaustive } from '../../../utils/checks.js';

function findPairForward(
  lines: string[],
  startRow: number,
  startCol: number,
  openChar: string,
  closeChar: string,
): { row: number; col: number } | null {
  let depth = 0;
  for (let row = startRow; row < lines.length; row++) {
    const line = lines[row] || '';
    const chars = toCodePoints(line);
    const colStart = row === startRow ? startCol : 0;

    for (let col = colStart; col < chars.length; col++) {
      const char = chars[col];
      if (char === openChar) {
        depth++;
      } else if (char === closeChar) {
        if (depth === 0) return { row, col };
        depth--;
      }
    }
  }
  return null;
}

function findPairBackward(
  lines: string[],
  startRow: number,
  startCol: number,
  closeChar: string,
  openChar: string,
): { row: number; col: number } | null {
  let depth = 0;
  for (let row = startRow; row >= 0; row--) {
    const line = lines[row] || '';
    const chars = toCodePoints(line);
    const colStart = row === startRow ? startCol : chars.length - 1;

    for (let col = colStart; col >= 0; col--) {
      const char = chars[col];
      if (char === closeChar) {
        depth++;
      } else if (char === openChar) {
        if (depth === 0) return { row, col };
        depth--;
      }
    }
  }
  return null;
}

function findMatchingPair(
  lines: string[],
  cursorRow: number,
  cursorCol: number,
): { row: number; col: number } | null {
  const currentLine = lines[cursorRow] || '';
  const codePoints = toCodePoints(currentLine);

  const pairs: Record<string, string> = {
    '(': ')',
    '{': '}',
    '[': ']',
    '<': '>',
  };
  const reversePairs: Record<string, string> = {
    ')': '(',
    '}': '{',
    ']': '[',
    '>': '<',
  };

  // 1. Check if we need to scan forward to find a pair
  let activeCol = cursorCol;
  let char = codePoints[activeCol];

  if (!pairs[char] && !reversePairs[char]) {
    // Scan forward on current line
    for (let i = cursorCol + 1; i < codePoints.length; i++) {
      const c = codePoints[i];
      if (pairs[c] || reversePairs[c]) {
        activeCol = i;
        char = c;
        break;
      }
    }
  }

  if (pairs[char]) {
    return findPairForward(lines, cursorRow, activeCol + 1, char, pairs[char]);
  } else if (reversePairs[char]) {
    return findPairBackward(
      lines,
      cursorRow,
      activeCol - 1,
      char,
      reversePairs[char],
    );
  }

  return null;
}

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
  | { type: 'vim_change_to_end_of_line' }
  | { type: 'vim_delete_to_line_start' }
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
  | { type: 'vim_delete_char_before'; payload: { count: number } }
  | { type: 'vim_toggle_case'; payload: { count: number } }
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
  | { type: 'vim_set_selection_anchor' }
  | { type: 'vim_clear_selection' }
  | {
      type: 'vim_search';
      payload: { query: string; direction: 'forward' | 'backward' };
    }
  | { type: 'vim_search_next'; payload: { direction: 'forward' | 'backward' } }
  | { type: 'vim_yank'; payload: { text: string } }
  | { type: 'vim_yank_selection' }
  | { type: 'vim_paste'; payload: { direction: 'before' | 'after' } }
  | { type: 'vim_replace_char'; payload: { char: string } }
  | {
      type: 'vim_find_char';
      payload: {
        char: string;
        direction: 'forward' | 'backward';
        type: 'inclusive' | 'exclusive';
      };
    }
  | { type: 'vim_move_to_matching_pair' }
  | { type: 'vim_delete_inner_word'; payload: { count: number } }
  | { type: 'vim_change_inner_word'; payload: { count: number } }
  | { type: 'vim_yank_inner_word'; payload: { count: number } }
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
          // No more words, delete/change to end of current word or line
          const currentLine = lines[endRow] || '';
          const wordEnd = findBigWordEndInLine(currentLine, endCol);
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

    case 'vim_delete_to_line_start': {
      if (cursorCol > 0) {
        const nextState = pushUndo(state);
        const result = replaceRangeInternal(
          nextState,
          cursorRow,
          0,
          cursorRow,
          cursorCol,
          '',
        );
        return {
          ...result,
          cursorCol: 0,
        };
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
      const { cursorRow, cursorCol, lines, preferredCol } = state;
      const newRow = Math.max(0, cursorRow - count);
      const targetLine = lines[newRow] || '';
      const targetLineLength = cpLen(targetLine);

      // Use preferred column if available, otherwise current column
      let newPreferredCol = preferredCol;
      if (newPreferredCol === null) {
        newPreferredCol = cursorCol;
      }

      const newCol = Math.min(
        newPreferredCol,
        targetLineLength > 0 ? targetLineLength - 1 : 0,
      );

      return {
        ...state,
        cursorRow: newRow,
        cursorCol: newCol,
        preferredCol: newPreferredCol,
      };
    }

    case 'vim_move_down': {
      const { count } = action.payload;
      const { cursorRow, cursorCol, lines, preferredCol } = state;
      const newRow = Math.min(lines.length - 1, cursorRow + count);
      const targetLine = lines[newRow] || '';
      const targetLineLength = cpLen(targetLine);

      // Use preferred column if available, otherwise current column
      let newPreferredCol = preferredCol;
      if (newPreferredCol === null) {
        newPreferredCol = cursorCol;
      }

      const newCol = Math.min(
        newPreferredCol,
        targetLineLength > 0 ? targetLineLength - 1 : 0,
      );

      return {
        ...state,
        cursorRow: newRow,
        cursorCol: newCol,
        preferredCol: newPreferredCol,
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

    case 'vim_move_big_word_end': {
      const { count } = action.payload;
      let row = cursorRow;
      let col = cursorCol;

      for (let i = 0; i < count; i++) {
        // Special handling for the first iteration when we're at end of word
        if (i === 0) {
          const currentLine = lines[row] || '';
          const lineCodePoints = toCodePoints(currentLine);

          // Check if we're at the end of a big word (non-whitespace followed by whitespace or EOL)
          // We must be on a non-whitespace character.
          // Note: isWhitespace handles regular spaces.
          // This logic mimics standard vim 'E': if at end of word, go to end of NEXT word.

          const isBigWordChar =
            col < lineCodePoints.length && !/\s/.test(lineCodePoints[col]);
          const nextIsWhitespaceOrEOL =
            col + 1 >= lineCodePoints.length ||
            /\s/.test(lineCodePoints[col + 1]);

          if (isBigWordChar && nextIsWhitespaceOrEOL) {
            // We're already at end of big word, find next big word end
            const nextWord = findNextBigWordAcrossLines(
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
      const { selectionAnchor, cursorRow, cursorCol, lines } = state;

      if (selectionAnchor) {
        const nextState = pushUndo(state);
        // Calculate min/max for the range
        let startRow;
        let startCol;
        let endRow;
        let endCol;
        if (
          selectionAnchor[0] < cursorRow ||
          (selectionAnchor[0] === cursorRow && selectionAnchor[1] < cursorCol)
        ) {
          startRow = selectionAnchor[0];
          startCol = selectionAnchor[1];
          endRow = cursorRow;
          endCol = cursorCol;
        } else {
          startRow = cursorRow;
          startCol = cursorCol;
          endRow = selectionAnchor[0];
          endCol = selectionAnchor[1];
        }

        // For inclusive selection (like Vim visual mode), we need to include the character at endCol.
        // replaceRangeInternal is inclusive of start, exclusive of end? No, replaceRangeInternal implementation:
        // const prefix = cpSlice(currentLine(startRow), 0, sCol);
        // const suffix = cpSlice(currentLine(endRow), eCol);
        // So it removes everything from sCol up to (but not including) eCol?
        // Let's check replaceRangeInternal implementation details in text-buffer.ts...
        // Ah, it takes endCol.
        // If we want to delete character at endCol, we should pass endCol + 1.

        return {
          ...replaceRangeInternal(
            nextState,
            startRow,
            startCol,
            endRow,
            endCol + 1,
            '',
          ),
          selectionAnchor: null,
        };
      }

      const { count } = action.payload;
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

    case 'vim_delete_char_before': {
      const { count } = action.payload;
      const { cursorRow, cursorCol } = state;

      if (cursorCol > 0) {
        const deleteCount = Math.min(count, cursorCol);
        const startCol = cursorCol - deleteCount;
        const nextState = pushUndo(state);
        const result = replaceRangeInternal(
          nextState,
          cursorRow,
          startCol,
          cursorRow,
          cursorCol,
          '',
        );
        return {
          ...result,
          cursorCol: startCol,
        };
      }
      return state;
    }

    case 'vim_toggle_case': {
      const { count } = action.payload;
      const { cursorRow, cursorCol, lines } = state;
      const currentLine = lines[cursorRow] || '';
      const lineCodePoints = toCodePoints(currentLine);

      if (cursorCol < lineCodePoints.length) {
        const nextState = pushUndo(state);
        const endCol = Math.min(cursorCol + count, lineCodePoints.length);

        let newText = '';
        for (let i = cursorCol; i < endCol; i++) {
          const char = lineCodePoints[i];
          if (char === char.toUpperCase()) {
            newText += char.toLowerCase();
          } else {
            newText += char.toUpperCase();
          }
        }

        const result = replaceRangeInternal(
          nextState,
          cursorRow,
          cursorCol,
          cursorRow,
          endCol,
          newText,
        );

        // Move cursor forward
        return {
          ...result,
          cursorCol: Math.min(endCol, lineCodePoints.length - 1),
        };
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

    case 'vim_set_selection_anchor': {
      const { cursorRow, cursorCol } = state;
      return {
        ...state,
        selectionAnchor: [cursorRow, cursorCol],
      };
    }

    case 'vim_clear_selection': {
      return {
        ...state,
        selectionAnchor: null,
      };
    }

    case 'vim_search': {
      const { query, direction } = action.payload;
      const { lines, cursorRow, cursorCol } = state;
      let foundRow = -1;
      let foundCol = -1;

      // Forward search logic
      if (direction === 'forward') {
        const currentLine = lines[cursorRow] || '';
        // Search current line from next char
        const idx = currentLine.indexOf(query, cursorCol + 1);
        if (idx !== -1) {
          foundRow = cursorRow;
          foundCol = idx;
        } else {
          // Search subsequent lines
          for (let i = cursorRow + 1; i < lines.length; i++) {
            const line = lines[i];
            const idx = line.indexOf(query);
            if (idx !== -1) {
              foundRow = i;
              foundCol = idx;
              break;
            }
          }
          // Wrap around
          if (foundRow === -1) {
            for (let i = 0; i <= cursorRow; i++) {
              const line = lines[i];
              const idx = line.indexOf(query);
              if (idx !== -1 && (i < cursorRow || idx < cursorCol)) {
                foundRow = i;
                foundCol = idx;
                break;
              }
            }
          }
        }
      } else {
        // Backward search logic
        const currentLine = lines[cursorRow] || '';
        // Search current line before current char
        // lastIndexOf searches backwards fromIndex
        const idx = currentLine.lastIndexOf(query, cursorCol - 1);
        if (idx !== -1) {
          foundRow = cursorRow;
          foundCol = idx;
        } else {
          // Search previous lines
          for (let i = cursorRow - 1; i >= 0; i--) {
            const line = lines[i];
            const idx = line.lastIndexOf(query);
            if (idx !== -1) {
              foundRow = i;
              foundCol = idx;
              break;
            }
          }
          // Wrap around (search from end)
          if (foundRow === -1) {
            for (let i = lines.length - 1; i >= cursorRow; i--) {
              const line = lines[i];
              const idx = line.lastIndexOf(query);
              if (idx !== -1 && (i > cursorRow || idx > cursorCol)) {
                foundRow = i;
                foundCol = idx;
                break;
              }
            }
          }
        }
      }

      if (foundRow !== -1) {
        return {
          ...state,
          cursorRow: foundRow,
          cursorCol: foundCol,
          preferredCol: null,
          lastSearchQuery: query,
        };
      }

      return { ...state, lastSearchQuery: query };
    }

    case 'vim_search_next': {
      const { lastSearchQuery } = state;
      if (!lastSearchQuery) return state;

      // Re-dispatch vim_search with saved query
      // Since we are in reducer, we call logic recursively or duplicate it.
      // Duplicating for simplicity/safety to avoid recursion limit.
      const query = lastSearchQuery;
      const direction = action.payload.direction; // 'forward' (n) or 'backward' (N)

      // TODO: Respect direction (n vs N). Currently assuming forward 'n'.
      // If direction is 'backward', we need backward search logic.
      // For now, implementing 'forward' (n) logic which is same as vim_search.

      const { lines, cursorRow, cursorCol } = state;
      let foundRow = -1;
      let foundCol = -1;

      // Forward search logic
      if (direction === 'forward') {
        const currentLine = lines[cursorRow] || '';
        const idx = currentLine.indexOf(query, cursorCol + 1);
        if (idx !== -1) {
          foundRow = cursorRow;
          foundCol = idx;
        } else {
          for (let i = cursorRow + 1; i < lines.length; i++) {
            const line = lines[i];
            const idx = line.indexOf(query);
            if (idx !== -1) {
              foundRow = i;
              foundCol = idx;
              break;
            }
          }
          if (foundRow === -1) {
            for (let i = 0; i <= cursorRow; i++) {
              const line = lines[i];
              const idx = line.indexOf(query);
              if (idx !== -1 && (i < cursorRow || idx < cursorCol)) {
                foundRow = i;
                foundCol = idx;
                break;
              }
            }
          }
        }
      } else {
        // Backward search logic
        const currentLine = lines[cursorRow] || '';
        const idx = currentLine.lastIndexOf(query, cursorCol - 1);
        if (idx !== -1) {
          foundRow = cursorRow;
          foundCol = idx;
        } else {
          for (let i = cursorRow - 1; i >= 0; i--) {
            const line = lines[i];
            const idx = line.lastIndexOf(query);
            if (idx !== -1) {
              foundRow = i;
              foundCol = idx;
              break;
            }
          }
          if (foundRow === -1) {
            for (let i = lines.length - 1; i >= cursorRow; i--) {
              const line = lines[i];
              const idx = line.lastIndexOf(query);
              if (idx !== -1 && (i > cursorRow || idx > cursorCol)) {
                foundRow = i;
                foundCol = idx;
                break;
              }
            }
          }
        }
      }

      if (foundRow !== -1) {
        return {
          ...state,
          cursorRow: foundRow,
          cursorCol: foundCol,
          preferredCol: null,
        };
      }
      return state;
    }

    case 'vim_yank': {
      return {
        ...state,
        clipboard: action.payload.text,
      };
    }

    case 'vim_yank_selection': {
      const { selectionAnchor, cursorRow, cursorCol, lines } = state;
      if (!selectionAnchor) return state;

      let startRow;
      let startCol;
      let endRow;
      let endCol;
      if (
        selectionAnchor[0] < cursorRow ||
        (selectionAnchor[0] === cursorRow && selectionAnchor[1] < cursorCol)
      ) {
        startRow = selectionAnchor[0];
        startCol = selectionAnchor[1];
        endRow = cursorRow;
        endCol = cursorCol;
      } else {
        startRow = cursorRow;
        startCol = cursorCol;
        endRow = selectionAnchor[0];
        endCol = selectionAnchor[1];
      }

      // getPositionFromOffsets logic might be needed if we want to support raw offset ranges,
      // but here we have row/cols.
      // We need to extract text from [startRow, startCol] to [endRow, endCol] inclusive.

      let yankedText = '';
      if (startRow === endRow) {
        yankedText = cpSlice(lines[startRow] || '', startCol, endCol + 1);
      } else {
        // First line
        yankedText += cpSlice(lines[startRow] || '', startCol) + '\n';
        // Middle lines
        for (let i = startRow + 1; i < endRow; i++) {
          yankedText += (lines[i] || '') + '\n';
        }
        // Last line
        yankedText += cpSlice(lines[endRow] || '', 0, endCol + 1);
      }

      return {
        ...state,
        clipboard: yankedText,
      };
    }

    case 'vim_paste': {
      const { clipboard, cursorRow, cursorCol, lines } = state;
      if (!clipboard) return state;

      const { direction } = action.payload;
      const nextState = pushUndo(state);

      if (direction === 'after') {
        // 'p': paste after cursor
        const currentLine = lines[cursorRow] || '';
        // If pasting multiple lines (text contains newline)
        if (clipboard.includes('\n')) {
          // However, for 'p' of a block, it usually starts on the next line if it was linewise.
          // If clipboard ends with \n, treat as linewise.
          if (clipboard.endsWith('\n')) {
            // Insert below current line
            const endOfLine = cpLen(currentLine);
            return replaceRangeInternal(
              nextState,
              cursorRow,
              endOfLine, // append at end
              cursorRow,
              endOfLine,
              '\n' + clipboard.slice(0, -1), // remove trailing newline for insertion, but prepend newline to put it on next line
            );
          }

          // Charwise paste after cursor
          const insertCol = Math.min(cursorCol + 1, cpLen(currentLine));
          return replaceRangeInternal(
            nextState,
            cursorRow,
            insertCol,
            cursorRow,
            insertCol,
            clipboard,
          );
        } else {
          // Single line paste after cursor
          const insertCol = Math.min(cursorCol + 1, cpLen(currentLine));
          return replaceRangeInternal(
            nextState,
            cursorRow,
            insertCol,
            cursorRow,
            insertCol,
            clipboard,
          );
        }
      } else {
        // 'P': paste before cursor
        // If linewise
        if (clipboard.includes('\n') && clipboard.endsWith('\n')) {
          // Insert above current line
          return replaceRangeInternal(
            nextState,
            cursorRow,
            0,
            cursorRow,
            0,
            clipboard,
          );
        }

        // Charwise paste before cursor
        return replaceRangeInternal(
          nextState,
          cursorRow,
          cursorCol,
          cursorRow,
          cursorCol,
          clipboard,
        );
      }
    }

    case 'vim_replace_char': {
      const { char } = action.payload;
      const { cursorRow, cursorCol, lines } = state;
      const currentLine = lines[cursorRow] || '';

      if (cursorCol < cpLen(currentLine)) {
        const nextState = pushUndo(state);
        return replaceRangeInternal(
          nextState,
          cursorRow,
          cursorCol,
          cursorRow,
          cursorCol + 1,
          char,
        );
      }
      return state; // Nothing to replace at end of line
    }

    case 'vim_find_char': {
      const { char, direction, type } = action.payload;
      const { lines, cursorRow, cursorCol } = state;
      const currentLine = lines[cursorRow] || '';
      const lineCodePoints = toCodePoints(currentLine);

      let newCol = -1;
      if (direction === 'forward') {
        // Start search after current cursor position
        const startSearchCol = cursorCol + 1;
        for (let i = startSearchCol; i < lineCodePoints.length; i++) {
          if (lineCodePoints[i] === char) {
            newCol = i;
            break;
          }
        }
      } else {
        // backward
        // Start search before current cursor position
        const startSearchCol = cursorCol - 1;
        for (let i = startSearchCol; i >= 0; i--) {
          if (lineCodePoints[i] === char) {
            newCol = i;
            break;
          }
        }
      }

      if (newCol !== -1) {
        // Adjust column based on type (inclusive/exclusive)
        let finalCol = newCol;
        if (type === 'exclusive') {
          finalCol = direction === 'forward' ? newCol - 1 : newCol + 1;
        }

        // Ensure finalCol is within bounds
        finalCol = Math.max(0, Math.min(finalCol, cpLen(currentLine) - 1));

        return {
          ...state,
          cursorCol: finalCol,
          preferredCol: null,
        };
      }
      return state; // Character not found
    }

    case 'vim_move_to_matching_pair': {
      const match = findMatchingPair(lines, cursorRow, cursorCol);
      if (match) {
        return {
          ...state,
          cursorRow: match.row,
          cursorCol: match.col,
          preferredCol: null,
        };
      }
      return state;
    }

    case 'vim_delete_inner_word':
    case 'vim_change_inner_word':
    case 'vim_yank_inner_word': {
      // Find inner word bounds
      const currentLine = lines[cursorRow] || '';
      const lineCodePoints = toCodePoints(currentLine);
      if (lineCodePoints.length === 0) return state;

      // Handle empty line case?
      // If line empty, nothing to select.

      let startCol = cursorCol;
      let endCol = cursorCol;

      // Ensure cursor is within bounds
      if (startCol >= lineCodePoints.length)
        startCol = lineCodePoints.length - 1;

      const charUnderCursor = lineCodePoints[startCol];
      const isWordChar =
        isWordCharStrict(charUnderCursor) ||
        isWordCharWithCombining(charUnderCursor);
      // Wait, simplistic "inner word" logic:
      // If on whitespace, select sequence of whitespace.
      // If on word char, select sequence of word chars.
      // Note: "isWordCharWithCombining" handles base + marks.

      const checkType = (char: string) => {
        if (!char) return false;
        const isW = isWordCharStrict(char) || isWordCharWithCombining(char);
        if (isWordChar) return isW;
        // If we started on non-word, we look for non-word?
        // Standard vim iw: "inner word".
        // If on word: select word.
        // If on whitespace: select whitespace.
        // If on symbol: select symbol sequence? No, standard 'w' treats symbols as words too if not whitespace.
        // Let's assume standard "word" vs "non-word" where non-word includes punctuation unless we use isWordCharStrict logic properly.
        // Our helper `findWordEndInLine` uses `isWordCharStrict` logic.
        return isW === isWordChar;
      };

      // Scan back
      while (startCol > 0 && checkType(lineCodePoints[startCol - 1])) {
        startCol--;
      }
      // Scan forward
      while (
        endCol < lineCodePoints.length - 1 &&
        checkType(lineCodePoints[endCol + 1])
      ) {
        endCol++;
      }

      // Now we have [startCol, endCol] inclusive.
      // Yank logic
      if (action.type === 'vim_yank_inner_word') {
        const text = cpSlice(currentLine, startCol, endCol + 1);
        return { ...state, clipboard: text };
      }

      const nextState = pushUndo(state);
      const resultState = replaceRangeInternal(
        nextState,
        cursorRow,
        startCol,
        cursorRow,
        endCol + 1, // exclusive end
        '',
      );

      if (action.type === 'vim_change_inner_word') {
        // Switch to insert mode is handled by caller (useVim) if we return state?
        // No, handleVimAction just modifies buffer.
        // useVim needs to switch mode.
        // But for change, we usually want to verify we actually changed something?
        // Yes.
        return resultState;
      }

      return resultState;
    }

    default: {
      // This should never happen if TypeScript is working correctly

      // assumeExhaustive(action);

      return state;
    }
  }
}
