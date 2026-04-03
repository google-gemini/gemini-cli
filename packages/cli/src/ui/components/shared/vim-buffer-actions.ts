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
  | { type: 'vim_delete_char_before' }
  | { type: 'vim_toggle_case' }
  | { type: 'vim_replace_char' }
  | { type: 'vim_find_char_forward' }
  | { type: 'vim_find_char_backward' }
  | { type: 'vim_delete_to_char_forward' }
  | { type: 'vim_delete_to_char_backward' }
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
  | { type: 'vim_yank_line' }
  | { type: 'vim_yank_word_forward' }
  | { type: 'vim_yank_big_word_forward' }
  | { type: 'vim_yank_word_end' }
  | { type: 'vim_yank_big_word_end' }
  | { type: 'vim_yank_to_end_of_line' }
  | { type: 'vim_paste_after' }
  | { type: 'vim_paste_before' }
>;

/**
 * Find the Nth occurrence of `char` in `codePoints`, starting at `start` and
 * stepping by `direction` (+1 forward, -1 backward). Returns the index or -1.
 */
function findCharInLine(
  codePoints: string[],
  char: string,
  count: number,
  start: number,
  direction: 1 | -1,
): number {
  let found = -1;
  let hits = 0;
  for (
    let i = start;
    direction === 1 ? i < codePoints.length : i >= 0;
    i += direction
  ) {
    if (codePoints[i] === char) {
      hits++;
      if (hits >= count) {
        found = i;
        break;
      }
    }
  }
  return found;
}

/**
 * In NORMAL mode the cursor can never rest past the last character of a line.
 * Call this after any delete action that stays in NORMAL mode to enforce that
 * invariant. Change actions must NOT use this — they immediately enter INSERT
 * mode where the cursor is allowed to sit at the end of the line.
 */
function clampNormalCursor(state: TextBufferState): TextBufferState {
  const line = state.lines[state.cursorRow] || '';
  const len = cpLen(line);
  const maxCol = Math.max(0, len - 1);
  if (state.cursorCol <= maxCol) return state;
  return { ...state, cursorCol: maxCol };
}

/** Extract the text that will be removed by a delete/yank operation. */
function extractRange(
  lines: string[],
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number,
): string {
  if (startRow === endRow) {
    return toCodePoints(lines[startRow] || '')
      .slice(startCol, endCol)
      .join('');
  }
  const parts: string[] = [];
  parts.push(
    toCodePoints(lines[startRow] || '')
      .slice(startCol)
      .join(''),
  );
  for (let r = startRow + 1; r < endRow; r++) {
    parts.push(lines[r] || '');
  }
  parts.push(
    toCodePoints(lines[endRow] || '')
      .slice(0, endCol)
      .join(''),
  );
  return parts.join('\n');
}

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
        const yankedText = extractRange(
          lines,
          cursorRow,
          cursorCol,
          endRow,
          endCol,
        );
        const nextState = detachExpandedPaste(pushUndo(state));
        const newState = replaceRangeInternal(
          nextState,
          cursorRow,
          cursorCol,
          endRow,
          endCol,
          '',
        );
        if (action.type === 'vim_delete_word_forward') {
          return {
            ...clampNormalCursor(newState),
            yankRegister: { text: yankedText, linewise: false },
          };
        }
        return newState;
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
        const yankedText = extractRange(
          lines,
          cursorRow,
          cursorCol,
          endRow,
          endCol,
        );
        const nextState = pushUndo(state);
        const newState = replaceRangeInternal(
          nextState,
          cursorRow,
          cursorCol,
          endRow,
          endCol,
          '',
        );
        if (action.type === 'vim_delete_big_word_forward') {
          return {
            ...clampNormalCursor(newState),
            yankRegister: { text: yankedText, linewise: false },
          };
        }
        return newState;
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
        const yankedText = extractRange(
          lines,
          cursorRow,
          cursorCol,
          endRow,
          endCol,
        );
        const nextState = detachExpandedPaste(pushUndo(state));
        const newState = replaceRangeInternal(
          nextState,
          cursorRow,
          cursorCol,
          endRow,
          endCol,
          '',
        );
        if (action.type === 'vim_delete_word_end') {
          return {
            ...clampNormalCursor(newState),
            yankRegister: { text: yankedText, linewise: false },
          };
        }
        return newState;
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
        const yankedText = extractRange(
          lines,
          cursorRow,
          cursorCol,
          endRow,
          endCol,
        );
        const nextState = pushUndo(state);
        const newState = replaceRangeInternal(
          nextState,
          cursorRow,
          cursorCol,
          endRow,
          endCol,
          '',
        );
        if (action.type === 'vim_delete_big_word_end') {
          return {
            ...clampNormalCursor(newState),
            yankRegister: { text: yankedText, linewise: false },
          };
        }
        return newState;
      }
      return state;
    }

    case 'vim_delete_line': {
      const { count } = action.payload;
      if (lines.length === 0) return state;

      const linesToDelete = Math.min(count, lines.length - cursorRow);
      const totalLines = lines.length;
      const yankedText = lines
        .slice(cursorRow, cursorRow + linesToDelete)
        .join('\n');

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
          yankRegister: { text: yankedText, linewise: true },
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
        yankRegister: { text: yankedText, linewise: true },
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
      const isDelete = action.type === 'vim_delete_to_end_of_line';

      if (count === 1) {
        // Single line: delete from cursor to end of current line
        if (cursorCol < cpLen(currentLine)) {
          const yankedText = extractRange(
            lines,
            cursorRow,
            cursorCol,
            cursorRow,
            cpLen(currentLine),
          );
          const nextState = detachExpandedPaste(pushUndo(state));
          const newState = replaceRangeInternal(
            nextState,
            cursorRow,
            cursorCol,
            cursorRow,
            cpLen(currentLine),
            '',
          );
          if (isDelete) {
            return {
              ...clampNormalCursor(newState),
              yankRegister: { text: yankedText, linewise: false },
            };
          }
          return newState;
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
            const yankedText = extractRange(
              lines,
              cursorRow,
              cursorCol,
              cursorRow,
              cpLen(currentLine),
            );
            const nextState = detachExpandedPaste(pushUndo(state));
            const newState = replaceRangeInternal(
              nextState,
              cursorRow,
              cursorCol,
              cursorRow,
              cpLen(currentLine),
              '',
            );
            if (isDelete) {
              return {
                ...clampNormalCursor(newState),
                yankRegister: { text: yankedText, linewise: false },
              };
            }
            return newState;
          }
          return state;
        }

        // Delete from cursor position to end of endRow (including newlines)
        const endLine = lines[endRow] || '';
        const yankedText = extractRange(
          lines,
          cursorRow,
          cursorCol,
          endRow,
          cpLen(endLine),
        );
        const nextState = detachExpandedPaste(pushUndo(state));
        const newState = replaceRangeInternal(
          nextState,
          cursorRow,
          cursorCol,
          endRow,
          cpLen(endLine),
          '',
        );
        if (isDelete) {
          return {
            ...clampNormalCursor(newState),
            yankRegister: { text: yankedText, linewise: false },
          };
        }
        return newState;
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
        const deletedText = toCodePoints(currentLine)
          .slice(cursorCol, cursorCol + deleteCount)
          .join('');
        const nextState = detachExpandedPaste(pushUndo(state));
        const newState = replaceRangeInternal(
          nextState,
          cursorRow,
          cursorCol,
          cursorRow,
          cursorCol + deleteCount,
          '',
        );
        return {
          ...clampNormalCursor(newState),
          yankRegister: { text: deletedText, linewise: false },
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

    case 'vim_delete_char_before': {
      const { count } = action.payload;
      if (cursorCol > 0) {
        const deleteStart = Math.max(0, cursorCol - count);
        const deletedText = toCodePoints(lines[cursorRow] || '')
          .slice(deleteStart, cursorCol)
          .join('');
        const nextState = detachExpandedPaste(pushUndo(state));
        const newState = replaceRangeInternal(
          nextState,
          cursorRow,
          deleteStart,
          cursorRow,
          cursorCol,
          '',
        );
        return {
          ...newState,
          yankRegister: { text: deletedText, linewise: false },
        };
      }
      return state;
    }

    case 'vim_toggle_case': {
      const { count } = action.payload;
      const currentLine = lines[cursorRow] || '';
      const lineLen = cpLen(currentLine);
      if (cursorCol >= lineLen) return state;
      const end = Math.min(cursorCol + count, lineLen);
      const codePoints = toCodePoints(currentLine);
      for (let i = cursorCol; i < end; i++) {
        const ch = codePoints[i];
        const upper = ch.toUpperCase();
        const lower = ch.toLowerCase();
        codePoints[i] = ch === upper ? lower : upper;
      }
      const newLine = codePoints.join('');
      const nextState = detachExpandedPaste(pushUndo(state));
      const newLines = [...nextState.lines];
      newLines[cursorRow] = newLine;
      const newCol = Math.min(end, lineLen > 0 ? lineLen - 1 : 0);
      return {
        ...nextState,
        lines: newLines,
        cursorCol: newCol,
        preferredCol: null,
      };
    }

    case 'vim_replace_char': {
      const { char, count } = action.payload;
      const currentLine = lines[cursorRow] || '';
      const lineLen = cpLen(currentLine);
      if (cursorCol >= lineLen) return state;
      const replaceCount = Math.min(count, lineLen - cursorCol);
      const replacement = char.repeat(replaceCount);
      const nextState = detachExpandedPaste(pushUndo(state));
      const resultState = replaceRangeInternal(
        nextState,
        cursorRow,
        cursorCol,
        cursorRow,
        cursorCol + replaceCount,
        replacement,
      );
      return {
        ...resultState,
        cursorCol: cursorCol + replaceCount - 1,
        preferredCol: null,
      };
    }

    case 'vim_delete_to_char_forward': {
      const { char, count, till } = action.payload;
      const lineCodePoints = toCodePoints(lines[cursorRow] || '');
      const found = findCharInLine(
        lineCodePoints,
        char,
        count,
        cursorCol + 1,
        1,
      );
      if (found === -1) return state;
      const endCol = till ? found : found + 1;
      const yankedText = lineCodePoints.slice(cursorCol, endCol).join('');
      const nextState = detachExpandedPaste(pushUndo(state));
      return {
        ...clampNormalCursor(
          replaceRangeInternal(
            nextState,
            cursorRow,
            cursorCol,
            cursorRow,
            endCol,
            '',
          ),
        ),
        yankRegister: { text: yankedText, linewise: false },
      };
    }

    case 'vim_delete_to_char_backward': {
      const { char, count, till } = action.payload;
      const lineCodePoints = toCodePoints(lines[cursorRow] || '');
      const found = findCharInLine(
        lineCodePoints,
        char,
        count,
        cursorCol - 1,
        -1,
      );
      if (found === -1) return state;
      const startCol = till ? found + 1 : found;
      const endCol = cursorCol + 1; // inclusive: cursor char is part of the deletion
      if (startCol >= endCol) return state;
      const yankedText = lineCodePoints.slice(startCol, endCol).join('');
      const nextState = detachExpandedPaste(pushUndo(state));
      const resultState = replaceRangeInternal(
        nextState,
        cursorRow,
        startCol,
        cursorRow,
        endCol,
        '',
      );
      return {
        ...clampNormalCursor({
          ...resultState,
          cursorCol: startCol,
          preferredCol: null,
        }),
        yankRegister: { text: yankedText, linewise: false },
      };
    }

    case 'vim_find_char_forward': {
      const { char, count, till } = action.payload;
      const lineCodePoints = toCodePoints(lines[cursorRow] || '');
      const found = findCharInLine(
        lineCodePoints,
        char,
        count,
        cursorCol + 1,
        1,
      );
      if (found === -1) return state;
      const newCol = till ? Math.max(cursorCol, found - 1) : found;
      return { ...state, cursorCol: newCol, preferredCol: null };
    }

    case 'vim_find_char_backward': {
      const { char, count, till } = action.payload;
      const lineCodePoints = toCodePoints(lines[cursorRow] || '');
      const found = findCharInLine(
        lineCodePoints,
        char,
        count,
        cursorCol - 1,
        -1,
      );
      if (found === -1) return state;
      const newCol = till ? Math.min(cursorCol, found + 1) : found;
      return { ...state, cursorCol: newCol, preferredCol: null };
    }

    case 'vim_yank_line': {
      const { count } = action.payload;
      const linesToYank = Math.min(count, lines.length - cursorRow);
      const text = lines.slice(cursorRow, cursorRow + linesToYank).join('\n');
      return { ...state, yankRegister: { text, linewise: true } };
    }

    case 'vim_yank_word_forward': {
      const { count } = action.payload;
      let endRow = cursorRow;
      let endCol = cursorCol;

      for (let i = 0; i < count; i++) {
        const nextWord = findNextWordAcrossLines(lines, endRow, endCol, true);
        if (nextWord) {
          endRow = nextWord.row;
          endCol = nextWord.col;
        } else {
          const currentLine = lines[endRow] || '';
          const wordEnd = findWordEndInLine(currentLine, endCol);
          if (wordEnd !== null) {
            endCol = wordEnd + 1;
          }
          break;
        }
      }

      if (endRow !== cursorRow || endCol !== cursorCol) {
        const yankedText = extractRange(
          lines,
          cursorRow,
          cursorCol,
          endRow,
          endCol,
        );
        return {
          ...state,
          yankRegister: { text: yankedText, linewise: false },
        };
      }
      return state;
    }

    case 'vim_yank_big_word_forward': {
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
          const currentLine = lines[endRow] || '';
          const wordEnd = findBigWordEndInLine(currentLine, endCol);
          if (wordEnd !== null) {
            endCol = wordEnd + 1;
          }
          break;
        }
      }

      if (endRow !== cursorRow || endCol !== cursorCol) {
        const yankedText = extractRange(
          lines,
          cursorRow,
          cursorCol,
          endRow,
          endCol,
        );
        return {
          ...state,
          yankRegister: { text: yankedText, linewise: false },
        };
      }
      return state;
    }

    case 'vim_yank_word_end': {
      const { count } = action.payload;
      let row = cursorRow;
      let col = cursorCol;
      let endRow = cursorRow;
      let endCol = cursorCol;

      for (let i = 0; i < count; i++) {
        const wordEnd = findNextWordAcrossLines(lines, row, col, false);
        if (wordEnd) {
          endRow = wordEnd.row;
          endCol = wordEnd.col + 1;
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
              break;
            }
          }
        } else {
          break;
        }
      }

      if (endRow < lines.length) {
        endCol = Math.min(endCol, cpLen(lines[endRow] || ''));
      }

      if (endRow !== cursorRow || endCol !== cursorCol) {
        const yankedText = extractRange(
          lines,
          cursorRow,
          cursorCol,
          endRow,
          endCol,
        );
        return {
          ...state,
          yankRegister: { text: yankedText, linewise: false },
        };
      }
      return state;
    }

    case 'vim_yank_big_word_end': {
      const { count } = action.payload;
      let row = cursorRow;
      let col = cursorCol;
      let endRow = cursorRow;
      let endCol = cursorCol;

      for (let i = 0; i < count; i++) {
        const wordEnd = findNextBigWordAcrossLines(lines, row, col, false);
        if (wordEnd) {
          endRow = wordEnd.row;
          endCol = wordEnd.col + 1;
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
              break;
            }
          }
        } else {
          break;
        }
      }

      if (endRow < lines.length) {
        endCol = Math.min(endCol, cpLen(lines[endRow] || ''));
      }

      if (endRow !== cursorRow || endCol !== cursorCol) {
        const yankedText = extractRange(
          lines,
          cursorRow,
          cursorCol,
          endRow,
          endCol,
        );
        return {
          ...state,
          yankRegister: { text: yankedText, linewise: false },
        };
      }
      return state;
    }

    case 'vim_yank_to_end_of_line': {
      const currentLine = lines[cursorRow] || '';
      const lineLen = cpLen(currentLine);
      if (cursorCol < lineLen) {
        const yankedText = toCodePoints(currentLine).slice(cursorCol).join('');
        return {
          ...state,
          yankRegister: { text: yankedText, linewise: false },
        };
      }
      return state;
    }

    case 'vim_paste_after': {
      const { count } = action.payload;
      const reg = state.yankRegister;
      if (!reg) return state;

      const nextState = detachExpandedPaste(pushUndo(state));

      if (reg.linewise) {
        // Insert lines BELOW cursorRow
        const pasteText = (reg.text + '\n').repeat(count).slice(0, -1); // N copies, no trailing newline
        const pasteLines = pasteText.split('\n');
        const newLines = [...nextState.lines];
        newLines.splice(cursorRow + 1, 0, ...pasteLines);
        return {
          ...nextState,
          lines: newLines,
          cursorRow: cursorRow + 1,
          cursorCol: 0,
          preferredCol: null,
        };
      } else {
        // Insert after cursor (at cursorCol + 1)
        const currentLine = nextState.lines[cursorRow] || '';
        const lineLen = cpLen(currentLine);
        const insertCol = Math.min(cursorCol + 1, lineLen);
        const pasteText = reg.text.repeat(count);
        const newState = replaceRangeInternal(
          nextState,
          cursorRow,
          insertCol,
          cursorRow,
          insertCol,
          pasteText,
        );
        // replaceRangeInternal leaves cursorCol one past the last inserted char;
        // step back by 1 to land on the last pasted character.
        const pasteLength = pasteText.length;
        return clampNormalCursor({
          ...newState,
          cursorCol: Math.max(
            0,
            newState.cursorCol - (pasteLength > 0 ? 1 : 0),
          ),
          preferredCol: null,
        });
      }
    }

    case 'vim_paste_before': {
      const { count } = action.payload;
      const reg = state.yankRegister;
      if (!reg) return state;

      const nextState = detachExpandedPaste(pushUndo(state));

      if (reg.linewise) {
        // Insert lines ABOVE cursorRow
        const pasteText = (reg.text + '\n').repeat(count).slice(0, -1);
        const pasteLines = pasteText.split('\n');
        const newLines = [...nextState.lines];
        newLines.splice(cursorRow, 0, ...pasteLines);
        return {
          ...nextState,
          lines: newLines,
          cursorRow,
          cursorCol: 0,
          preferredCol: null,
        };
      } else {
        // Insert at cursorCol (not +1)
        const pasteText = reg.text.repeat(count);
        const newState = replaceRangeInternal(
          nextState,
          cursorRow,
          cursorCol,
          cursorRow,
          cursorCol,
          pasteText,
        );
        // replaceRangeInternal leaves cursorCol one past the last inserted char;
        // step back by 1 to land on the last pasted character.
        const pasteLength = pasteText.length;
        return clampNormalCursor({
          ...newState,
          cursorCol: Math.max(
            0,
            newState.cursorCol - (pasteLength > 0 ? 1 : 0),
          ),
          preferredCol: null,
        });
      }
    }

    default: {
      // This should never happen if TypeScript is working correctly
      assumeExhaustive(action);
      return state;
    }
  }
}
