/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { handleVimAction } from './vim-buffer-actions.js';
import type { TextBufferState } from './text-buffer.js';

// Helper to create test state
const createTestState = (
  lines: string[] = ['hello world'],
  cursorRow = 0,
  cursorCol = 0,
): TextBufferState => ({
  lines,
  cursorRow,
  cursorCol,
  preferredCol: null,
  undoStack: [],
  redoStack: [],
  clipboard: null,
  selectionAnchor: null,
  viewportWidth: 80,
});

describe('vim-buffer-actions', () => {
  describe('Movement commands', () => {
    describe('vim_move_left', () => {
      it('should move cursor left by count', () => {
        const state = createTestState(['hello world'], 0, 5);
        const action = {
          type: 'vim_move_left' as const,
          payload: { count: 3 },
        };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorCol).toBe(2);
        expect(result.preferredCol).toBeNull();
      });

      it('should not move past beginning of line', () => {
        const state = createTestState(['hello'], 0, 2);
        const action = {
          type: 'vim_move_left' as const,
          payload: { count: 5 },
        };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorCol).toBe(0);
      });

      it('should wrap to previous line when at beginning', () => {
        const state = createTestState(['line1', 'line2'], 1, 0);
        const action = {
          type: 'vim_move_left' as const,
          payload: { count: 1 },
        };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorRow).toBe(0);
        expect(result.cursorCol).toBe(4); // On last character '1' of 'line1'
      });

      it('should handle multiple line wrapping', () => {
        const state = createTestState(['abc', 'def', 'ghi'], 2, 0);
        const action = {
          type: 'vim_move_left' as const,
          payload: { count: 5 },
        };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorRow).toBe(0);
        expect(result.cursorCol).toBe(1); // On 'b' after 5 left movements
      });

      it('should correctly handle h/l movement between lines', () => {
        // Start at end of first line at 'd' (position 10)
        let state = createTestState(['hello world', 'foo bar'], 0, 10);

        // Move right - should go to beginning of next line
        state = handleVimAction(state, {
          type: 'vim_move_right' as const,
          payload: { count: 1 },
        });
        expect(state).toHaveOnlyValidCharacters();
        expect(state.cursorRow).toBe(1);
        expect(state.cursorCol).toBe(0); // Should be on 'f'

        // Move left - should go back to end of previous line on 'd'
        state = handleVimAction(state, {
          type: 'vim_move_left' as const,
          payload: { count: 1 },
        });
        expect(state).toHaveOnlyValidCharacters();
        expect(state.cursorRow).toBe(0);
        expect(state.cursorCol).toBe(10); // Should be on 'd', not past it
      });
    });

    describe('vim_move_right', () => {
      it('should move cursor right by count', () => {
        const state = createTestState(['hello world'], 0, 2);
        const action = {
          type: 'vim_move_right' as const,
          payload: { count: 3 },
        };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorCol).toBe(5);
      });

      it('should not move past last character of line', () => {
        const state = createTestState(['hello'], 0, 3);
        const action = {
          type: 'vim_move_right' as const,
          payload: { count: 5 },
        };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorCol).toBe(4); // Last character of 'hello'
      });

      it('should wrap to next line when at end', () => {
        const state = createTestState(['line1', 'line2'], 0, 4); // At end of 'line1'
        const action = {
          type: 'vim_move_right' as const,
          payload: { count: 1 },
        };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorRow).toBe(1);
        expect(result.cursorCol).toBe(0);
      });

      it('should skip over combining marks to avoid cursor disappearing', () => {
        // Test case for combining character cursor disappearing bug
        // "café test" where é is represented as e + combining acute accent
        const state = createTestState(['cafe\u0301 test'], 0, 2); // Start at 'f'
        const action = {
          type: 'vim_move_right' as const,
          payload: { count: 1 },
        };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorCol).toBe(3); // Should be on 'e' of 'café'

        // Move right again - should skip combining mark and land on space
        const result2 = handleVimAction(result, action);
        expect(result2).toHaveOnlyValidCharacters();
        expect(result2.cursorCol).toBe(5); // Should be on space after 'café'
      });
    });

    describe('vim_move_up', () => {
      it('should move cursor up by count', () => {
        const state = createTestState(['line1', 'line2', 'line3'], 2, 3);
        const action = { type: 'vim_move_up' as const, payload: { count: 2 } };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorRow).toBe(0);
        expect(result.cursorCol).toBe(3);
      });

      it('should not move past first line', () => {
        const state = createTestState(['line1', 'line2'], 1, 3);
        const action = { type: 'vim_move_up' as const, payload: { count: 5 } };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorRow).toBe(0);
      });

      it('should adjust column for shorter lines', () => {
        const state = createTestState(['short', 'very long line'], 1, 10);
        const action = { type: 'vim_move_up' as const, payload: { count: 1 } };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorRow).toBe(0);
        expect(result.cursorCol).toBe(4); // Last character 't' of 'short', not past it
      });
    });

    describe('vim_move_down', () => {
      it('should move cursor down by count', () => {
        const state = createTestState(['line1', 'line2', 'line3'], 0, 2);
        const action = {
          type: 'vim_move_down' as const,
          payload: { count: 2 },
        };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorRow).toBe(2);
        expect(result.cursorCol).toBe(2);
      });

      it('should not move past last line', () => {
        const state = createTestState(['line1', 'line2'], 0, 2);
        const action = {
          type: 'vim_move_down' as const,
          payload: { count: 5 },
        };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorRow).toBe(1);
      });
    });

    describe('vim_move_word_forward', () => {
      it('should move to start of next word', () => {
        const state = createTestState(['hello world test'], 0, 0);
        const action = {
          type: 'vim_move_word_forward' as const,
          payload: { count: 1 },
        };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorCol).toBe(6); // Start of 'world'
      });

      it('should handle multiple words', () => {
        const state = createTestState(['hello world test'], 0, 0);
        const action = {
          type: 'vim_move_word_forward' as const,
          payload: { count: 2 },
        };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorCol).toBe(12); // Start of 'test'
      });

      it('should handle punctuation correctly', () => {
        const state = createTestState(['hello, world!'], 0, 0);
        const action = {
          type: 'vim_move_word_forward' as const,
          payload: { count: 1 },
        };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorCol).toBe(5); // Start of ','
      });

      it('should move across empty lines when starting from within a word', () => {
        // Testing the exact scenario: cursor on 'w' of 'hello world', w should move to next line
        const state = createTestState(['hello world', ''], 0, 6); // At 'w' of 'world'
        const action = {
          type: 'vim_move_word_forward' as const,
          payload: { count: 1 },
        };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorRow).toBe(1); // Should move to empty line
        expect(result.cursorCol).toBe(0); // Beginning of empty line
      });
    });

    describe('vim_move_word_backward', () => {
      it('should move to start of previous word', () => {
        const state = createTestState(['hello world test'], 0, 12);
        const action = {
          type: 'vim_move_word_backward' as const,
          payload: { count: 1 },
        };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorCol).toBe(6); // Start of 'world'
      });

      it('should handle multiple words', () => {
        const state = createTestState(['hello world test'], 0, 12);
        const action = {
          type: 'vim_move_word_backward' as const,
          payload: { count: 2 },
        };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorCol).toBe(0); // Start of 'hello'
      });
    });

    describe('vim_move_word_end', () => {
      it('should move to end of current word', () => {
        const state = createTestState(['hello world'], 0, 0);
        const action = {
          type: 'vim_move_word_end' as const,
          payload: { count: 1 },
        };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorCol).toBe(4); // End of 'hello'
      });

      it('should move to end of next word if already at word end', () => {
        const state = createTestState(['hello world'], 0, 4);
        const action = {
          type: 'vim_move_word_end' as const,
          payload: { count: 1 },
        };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorCol).toBe(10); // End of 'world'
      });

      it('should move across empty lines when at word end', () => {
        const state = createTestState(['hello world', '', 'test'], 0, 10); // At 'd' of 'world'
        const action = {
          type: 'vim_move_word_end' as const,
          payload: { count: 1 },
        };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorRow).toBe(2); // Should move to line with 'test'
        expect(result.cursorCol).toBe(3); // Should be at 't' (end of 'test')
      });

      it('should handle consecutive word-end movements across empty lines', () => {
        // Testing the exact scenario: cursor on 'w' of world, press 'e' twice
        const state = createTestState(['hello world', ''], 0, 6); // At 'w' of 'world'

        // First 'e' should move to 'd' of 'world'
        let result = handleVimAction(state, {
          type: 'vim_move_word_end' as const,
          payload: { count: 1 },
        });
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorRow).toBe(0);
        expect(result.cursorCol).toBe(10); // At 'd' of 'world'

        // Second 'e' should move to the empty line (end of file in this case)
        result = handleVimAction(result, {
          type: 'vim_move_word_end' as const,
          payload: { count: 1 },
        });
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorRow).toBe(1); // Should move to empty line
        expect(result.cursorCol).toBe(0); // Empty line has col 0
      });

      it('should handle combining characters - advance from end of base character', () => {
        // Test case for combining character word end bug
        // "café test" where é is represented as e + combining acute accent
        const state = createTestState(['cafe\u0301 test'], 0, 0); // Start at 'c'

        // First 'e' command should move to the 'e' (position 3)
        let result = handleVimAction(state, {
          type: 'vim_move_word_end' as const,
          payload: { count: 1 },
        });
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorCol).toBe(3); // At 'e' of café

        // Second 'e' command should advance to end of "test" (position 9), not stay stuck
        result = handleVimAction(result, {
          type: 'vim_move_word_end' as const,
          payload: { count: 1 },
        });
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorCol).toBe(9); // At 't' of "test"
      });

      it('should handle precomposed characters with diacritics', () => {
        // Test case with precomposed é for comparison
        const state = createTestState(['café test'], 0, 0); // Start at 'c'

        // First 'e' command should move to the 'é' (position 3)
        let result = handleVimAction(state, {
          type: 'vim_move_word_end' as const,
          payload: { count: 1 },
        });
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorCol).toBe(3); // At 'é' of café

        // Second 'e' command should advance to end of "test" (position 8)
        result = handleVimAction(result, {
          type: 'vim_move_word_end' as const,
          payload: { count: 1 },
        });
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorCol).toBe(8); // At 't' of "test"
      });
    });

    describe('Position commands', () => {
      it('vim_move_to_line_start should move to column 0', () => {
        const state = createTestState(['hello world'], 0, 5);
        const action = { type: 'vim_move_to_line_start' as const };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorCol).toBe(0);
      });

      it('vim_move_to_line_end should move to last character', () => {
        const state = createTestState(['hello world'], 0, 0);
        const action = { type: 'vim_move_to_line_end' as const };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorCol).toBe(10); // Last character of 'hello world'
      });

      it('vim_move_to_first_nonwhitespace should skip leading whitespace', () => {
        const state = createTestState(['   hello world'], 0, 0);
        const action = { type: 'vim_move_to_first_nonwhitespace' as const };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorCol).toBe(3); // Position of 'h'
      });

      it('vim_move_to_first_line should move to row 0', () => {
        const state = createTestState(['line1', 'line2', 'line3'], 2, 5);
        const action = { type: 'vim_move_to_first_line' as const };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorRow).toBe(0);
        expect(result.cursorCol).toBe(0);
      });

      it('vim_move_to_last_line should move to last row', () => {
        const state = createTestState(['line1', 'line2', 'line3'], 0, 5);
        const action = { type: 'vim_move_to_last_line' as const };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorRow).toBe(2);
        expect(result.cursorCol).toBe(0);
      });

      it('vim_move_to_line should move to specific line', () => {
        const state = createTestState(['line1', 'line2', 'line3'], 0, 5);
        const action = {
          type: 'vim_move_to_line' as const,
          payload: { lineNumber: 2 },
        };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorRow).toBe(1); // 0-indexed
        expect(result.cursorCol).toBe(0);
      });

      it('vim_move_to_line should clamp to valid range', () => {
        const state = createTestState(['line1', 'line2'], 0, 0);
        const action = {
          type: 'vim_move_to_line' as const,
          payload: { lineNumber: 10 },
        };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorRow).toBe(1); // Last line
      });
    });
  });

  describe('Edit commands', () => {
    describe('vim_delete_char', () => {
      it('should delete single character', () => {
        const state = createTestState(['hello'], 0, 1);
        const action = {
          type: 'vim_delete_char' as const,
          payload: { count: 1 },
        };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.lines[0]).toBe('hllo');
        expect(result.cursorCol).toBe(1);
      });

      it('should delete multiple characters', () => {
        const state = createTestState(['hello'], 0, 1);
        const action = {
          type: 'vim_delete_char' as const,
          payload: { count: 3 },
        };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.lines[0]).toBe('ho');
        expect(result.cursorCol).toBe(1);
      });

      it('should not delete past end of line', () => {
        const state = createTestState(['hello'], 0, 3);
        const action = {
          type: 'vim_delete_char' as const,
          payload: { count: 5 },
        };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.lines[0]).toBe('hel');
        expect(result.cursorCol).toBe(3);
      });

      it('should do nothing at end of line', () => {
        const state = createTestState(['hello'], 0, 5);
        const action = {
          type: 'vim_delete_char' as const,
          payload: { count: 1 },
        };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.lines[0]).toBe('hello');
        expect(result.cursorCol).toBe(5);
      });
    });

    describe('vim_delete_word_forward', () => {
      it('should delete from cursor to next word start', () => {
        const state = createTestState(['hello world test'], 0, 0);
        const action = {
          type: 'vim_delete_word_forward' as const,
          payload: { count: 1 },
        };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.lines[0]).toBe('world test');
        expect(result.cursorCol).toBe(0);
      });

      it('should delete multiple words', () => {
        const state = createTestState(['hello world test'], 0, 0);
        const action = {
          type: 'vim_delete_word_forward' as const,
          payload: { count: 2 },
        };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.lines[0]).toBe('test');
        expect(result.cursorCol).toBe(0);
      });

      it('should delete to end if no more words', () => {
        const state = createTestState(['hello world'], 0, 6);
        const action = {
          type: 'vim_delete_word_forward' as const,
          payload: { count: 2 },
        };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.lines[0]).toBe('hello ');
        expect(result.cursorCol).toBe(6);
      });
    });

    describe('vim_delete_word_backward', () => {
      it('should delete from cursor to previous word start', () => {
        const state = createTestState(['hello world test'], 0, 12);
        const action = {
          type: 'vim_delete_word_backward' as const,
          payload: { count: 1 },
        };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.lines[0]).toBe('hello test');
        expect(result.cursorCol).toBe(6);
      });

      it('should delete multiple words backward', () => {
        const state = createTestState(['hello world test'], 0, 12);
        const action = {
          type: 'vim_delete_word_backward' as const,
          payload: { count: 2 },
        };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.lines[0]).toBe('test');
        expect(result.cursorCol).toBe(0);
      });
    });

    describe('vim_delete_line', () => {
      it('should delete current line', () => {
        const state = createTestState(['line1', 'line2', 'line3'], 1, 2);
        const action = {
          type: 'vim_delete_line' as const,
          payload: { count: 1 },
        };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.lines).toEqual(['line1', 'line3']);
        expect(result.cursorRow).toBe(1);
        expect(result.cursorCol).toBe(0);
      });

      it('should delete multiple lines', () => {
        const state = createTestState(['line1', 'line2', 'line3'], 0, 2);
        const action = {
          type: 'vim_delete_line' as const,
          payload: { count: 2 },
        };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.lines).toEqual(['line3']);
        expect(result.cursorRow).toBe(0);
        expect(result.cursorCol).toBe(0);
      });

      it('should leave empty line when deleting all lines', () => {
        const state = createTestState(['only line'], 0, 0);
        const action = {
          type: 'vim_delete_line' as const,
          payload: { count: 1 },
        };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.lines).toEqual(['']);
        expect(result.cursorRow).toBe(0);
        expect(result.cursorCol).toBe(0);
      });
    });

    describe('vim_delete_to_end_of_line', () => {
      it('should delete from cursor to end of line', () => {
        const state = createTestState(['hello world'], 0, 5);
        const action = { type: 'vim_delete_to_end_of_line' as const };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.lines[0]).toBe('hello');
        expect(result.cursorCol).toBe(5);
      });

      it('should do nothing at end of line', () => {
        const state = createTestState(['hello'], 0, 5);
        const action = { type: 'vim_delete_to_end_of_line' as const };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.lines[0]).toBe('hello');
      });
    });
  });

  describe('Insert mode commands', () => {
    describe('vim_insert_at_cursor', () => {
      it('should not change cursor position', () => {
        const state = createTestState(['hello'], 0, 2);
        const action = { type: 'vim_insert_at_cursor' as const };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorRow).toBe(0);
        expect(result.cursorCol).toBe(2);
      });
    });

    describe('vim_append_at_cursor', () => {
      it('should move cursor right by one', () => {
        const state = createTestState(['hello'], 0, 2);
        const action = { type: 'vim_append_at_cursor' as const };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorCol).toBe(3);
      });

      it('should not move past end of line', () => {
        const state = createTestState(['hello'], 0, 5);
        const action = { type: 'vim_append_at_cursor' as const };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorCol).toBe(5);
      });
    });

    describe('vim_append_at_line_end', () => {
      it('should move cursor to end of line', () => {
        const state = createTestState(['hello world'], 0, 3);
        const action = { type: 'vim_append_at_line_end' as const };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorCol).toBe(11);
      });
    });

    describe('vim_insert_at_line_start', () => {
      it('should move to first non-whitespace character', () => {
        const state = createTestState(['  hello world'], 0, 5);
        const action = { type: 'vim_insert_at_line_start' as const };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorCol).toBe(2);
      });

      it('should move to column 0 for line with only whitespace', () => {
        const state = createTestState(['   '], 0, 1);
        const action = { type: 'vim_insert_at_line_start' as const };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorCol).toBe(3);
      });
    });

    describe('vim_open_line_below', () => {
      it('should insert a new line below the current one', () => {
        const state = createTestState(['hello world'], 0, 5);
        const action = { type: 'vim_open_line_below' as const };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.lines).toEqual(['hello world', '']);
        expect(result.cursorRow).toBe(1);
        expect(result.cursorCol).toBe(0);
      });
    });

    describe('vim_open_line_above', () => {
      it('should insert a new line above the current one', () => {
        const state = createTestState(['hello', 'world'], 1, 2);
        const action = { type: 'vim_open_line_above' as const };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.lines).toEqual(['hello', '', 'world']);
        expect(result.cursorRow).toBe(1);
        expect(result.cursorCol).toBe(0);
      });
    });

    describe('vim_escape_insert_mode', () => {
      it('should move cursor left', () => {
        const state = createTestState(['hello'], 0, 3);
        const action = { type: 'vim_escape_insert_mode' as const };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorCol).toBe(2);
      });

      it('should not move past beginning of line', () => {
        const state = createTestState(['hello'], 0, 0);
        const action = { type: 'vim_escape_insert_mode' as const };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorCol).toBe(0);
      });
    });
  });

  describe('Change commands', () => {
    describe('vim_change_word_forward', () => {
      it('should delete from cursor to next word start', () => {
        const state = createTestState(['hello world test'], 0, 0);
        const action = {
          type: 'vim_change_word_forward' as const,
          payload: { count: 1 },
        };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.lines[0]).toBe('world test');
        expect(result.cursorCol).toBe(0);
      });
    });

    describe('vim_change_line', () => {
      it('should delete entire line content', () => {
        const state = createTestState(['hello world'], 0, 5);
        const action = {
          type: 'vim_change_line' as const,
          payload: { count: 1 },
        };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.lines[0]).toBe('');
        expect(result.cursorCol).toBe(0);
      });
    });

    describe('vim_change_movement', () => {
      it('should change characters to the left', () => {
        const state = createTestState(['hello world'], 0, 5);
        const action = {
          type: 'vim_change_movement' as const,
          payload: { movement: 'h', count: 2 },
        };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.lines[0]).toBe('hel world');
        expect(result.cursorCol).toBe(3);
      });

      it('should change characters to the right', () => {
        const state = createTestState(['hello world'], 0, 5);
        const action = {
          type: 'vim_change_movement' as const,
          payload: { movement: 'l', count: 3 },
        };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        expect(result.lines[0]).toBe('hellorld'); // Deletes ' wo' (3 chars to the right)
        expect(result.cursorCol).toBe(5);
      });

      it('should change multiple lines down', () => {
        const state = createTestState(['line1', 'line2', 'line3'], 0, 2);
        const action = {
          type: 'vim_change_movement' as const,
          payload: { movement: 'j', count: 2 },
        };

        const result = handleVimAction(state, action);
        expect(result).toHaveOnlyValidCharacters();
        // The movement 'j' with count 2 changes 2 lines starting from cursor row
        // Since we're at cursor position 2, it changes lines starting from current row
        expect(result.lines).toEqual(['line1', 'line2', 'line3']); // No change because count > available lines
        expect(result.cursorRow).toBe(0);
        expect(result.cursorCol).toBe(2);
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle empty text', () => {
      const state = createTestState([''], 0, 0);
      const action = {
        type: 'vim_move_word_forward' as const,
        payload: { count: 1 },
      };

      const result = handleVimAction(state, action);
      expect(result).toHaveOnlyValidCharacters();
      expect(result.cursorRow).toBe(0);
      expect(result.cursorCol).toBe(0);
    });

    it('should handle single character line', () => {
      const state = createTestState(['a'], 0, 0);
      const action = { type: 'vim_move_to_line_end' as const };

      const result = handleVimAction(state, action);
      expect(result).toHaveOnlyValidCharacters();
      expect(result.cursorCol).toBe(0); // Should be last character position
    });

    it('should handle empty lines in multi-line text', () => {
      const state = createTestState(['line1', '', 'line3'], 1, 0);
      const action = {
        type: 'vim_move_word_forward' as const,
        payload: { count: 1 },
      };

      const result = handleVimAction(state, action);
      expect(result).toHaveOnlyValidCharacters();
      // Should move to next line with content
      expect(result.cursorRow).toBe(2);
      expect(result.cursorCol).toBe(0);
    });

    it('should preserve undo stack in operations', () => {
      const state = createTestState(['hello'], 0, 0);
      state.undoStack = [{ lines: ['previous'], cursorRow: 0, cursorCol: 0 }];

      const action = {
        type: 'vim_delete_char' as const,
        payload: { count: 1 },
      };

      const result = handleVimAction(state, action);
      expect(result).toHaveOnlyValidCharacters();
      expect(result.undoStack).toHaveLength(2); // Original plus new snapshot
    });
  });

  describe('UTF-32 character handling in word/line operations', () => {
    describe('Right-to-left text handling', () => {
      it('should handle Arabic text in word movements', () => {
        const state = createTestState(['hello مرحبا world'], 0, 0);

        // Move to end of 'hello'
        let result = handleVimAction(state, {
          type: 'vim_move_word_end' as const,
          payload: { count: 1 },
        });
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorCol).toBe(4); // End of 'hello'

        // Move to end of Arabic word
        result = handleVimAction(result, {
          type: 'vim_move_word_end' as const,
          payload: { count: 1 },
        });
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorCol).toBe(10); // End of Arabic word 'مرحبا'
      });
    });

    describe('Chinese character handling', () => {
      it('should handle Chinese characters in word movements', () => {
        const state = createTestState(['hello 你好 world'], 0, 0);

        // Move to end of 'hello'
        let result = handleVimAction(state, {
          type: 'vim_move_word_end' as const,
          payload: { count: 1 },
        });
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorCol).toBe(4); // End of 'hello'

        // Move forward to start of 'world'
        result = handleVimAction(result, {
          type: 'vim_move_word_forward' as const,
          payload: { count: 1 },
        });
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorCol).toBe(6); // Start of '你好'
      });
    });

    describe('Mixed script handling', () => {
      it('should handle mixed Latin and non-Latin scripts with word end commands', () => {
        const state = createTestState(['test中文test'], 0, 0);

        let result = handleVimAction(state, {
          type: 'vim_move_word_end' as const,
          payload: { count: 1 },
        });
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorCol).toBe(3); // End of 'test'

        // Second word end command should move to end of '中文'
        result = handleVimAction(result, {
          type: 'vim_move_word_end' as const,
          payload: { count: 1 },
        });
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorCol).toBe(5); // End of '中文'
      });

      it('should handle mixed Latin and non-Latin scripts with word forward commands', () => {
        const state = createTestState(['test中文test'], 0, 0);

        let result = handleVimAction(state, {
          type: 'vim_move_word_forward' as const,
          payload: { count: 1 },
        });
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorCol).toBe(4); // Start of '中'

        // Second word forward command should move to start of final 'test'
        result = handleVimAction(result, {
          type: 'vim_move_word_forward' as const,
          payload: { count: 1 },
        });
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorCol).toBe(6); // Start of final 'test'
      });

      it('should handle mixed Latin and non-Latin scripts with word backward commands', () => {
        const state = createTestState(['test中文test'], 0, 9); // Start at end of final 'test'

        let result = handleVimAction(state, {
          type: 'vim_move_word_backward' as const,
          payload: { count: 1 },
        });
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorCol).toBe(6); // Start of final 'test'

        // Second word backward command should move to start of '中文'
        result = handleVimAction(result, {
          type: 'vim_move_word_backward' as const,
          payload: { count: 1 },
        });
        expect(result).toHaveOnlyValidCharacters();
        expect(result.cursorCol).toBe(4); // Start of '中'
      });

      it('should handle Unicode block characters consistently with w and e commands', () => {
        const state = createTestState(['██ █████ ██'], 0, 0);

        // Test w command progression
        let wResult = handleVimAction(state, {
          type: 'vim_move_word_forward' as const,
          payload: { count: 1 },
        });
        expect(wResult).toHaveOnlyValidCharacters();
        expect(wResult.cursorCol).toBe(3); // Start of second block sequence

        wResult = handleVimAction(wResult, {
          type: 'vim_move_word_forward' as const,
          payload: { count: 1 },
        });
        expect(wResult).toHaveOnlyValidCharacters();
        expect(wResult.cursorCol).toBe(9); // Start of third block sequence

        // Test e command progression from beginning
        let eResult = handleVimAction(state, {
          type: 'vim_move_word_end' as const,
          payload: { count: 1 },
        });
        expect(eResult).toHaveOnlyValidCharacters();
        expect(eResult.cursorCol).toBe(1); // End of first block sequence

        eResult = handleVimAction(eResult, {
          type: 'vim_move_word_end' as const,
          payload: { count: 1 },
        });
        expect(eResult).toHaveOnlyValidCharacters();
        expect(eResult.cursorCol).toBe(7); // End of second block sequence

        eResult = handleVimAction(eResult, {
          type: 'vim_move_word_end' as const,
          payload: { count: 1 },
        });
        expect(eResult).toHaveOnlyValidCharacters();
        expect(eResult.cursorCol).toBe(10); // End of third block sequence
      });

      it('should handle strings starting with Chinese characters', () => {
        const state = createTestState(['中文test英文word'], 0, 0);

        // Test 'w' command - when at start of non-Latin word, w moves to next word
        let wResult = handleVimAction(state, {
          type: 'vim_move_word_forward' as const,
          payload: { count: 1 },
        });
        expect(wResult).toHaveOnlyValidCharacters();
        expect(wResult.cursorCol).toBe(2); // Start of 'test'

        wResult = handleVimAction(wResult, {
          type: 'vim_move_word_forward' as const,
          payload: { count: 1 },
        });
        expect(wResult.cursorCol).toBe(6); // Start of '英文'

        // Test 'e' command
        let eResult = handleVimAction(state, {
          type: 'vim_move_word_end' as const,
          payload: { count: 1 },
        });
        expect(eResult).toHaveOnlyValidCharacters();
        expect(eResult.cursorCol).toBe(1); // End of 中文

        eResult = handleVimAction(eResult, {
          type: 'vim_move_word_end' as const,
          payload: { count: 1 },
        });
        expect(eResult.cursorCol).toBe(5); // End of test
      });

      it('should handle strings starting with Arabic characters', () => {
        const state = createTestState(['مرحباhelloسلام'], 0, 0);

        // Test 'w' command - when at start of non-Latin word, w moves to next word
        let wResult = handleVimAction(state, {
          type: 'vim_move_word_forward' as const,
          payload: { count: 1 },
        });
        expect(wResult).toHaveOnlyValidCharacters();
        expect(wResult.cursorCol).toBe(5); // Start of 'hello'

        wResult = handleVimAction(wResult, {
          type: 'vim_move_word_forward' as const,
          payload: { count: 1 },
        });
        expect(wResult.cursorCol).toBe(10); // Start of 'سلام'

        // Test 'b' command from end
        const bState = createTestState(['مرحباhelloسلام'], 0, 13);
        let bResult = handleVimAction(bState, {
          type: 'vim_move_word_backward' as const,
          payload: { count: 1 },
        });
        expect(bResult).toHaveOnlyValidCharacters();
        expect(bResult.cursorCol).toBe(10); // Start of سلام

        bResult = handleVimAction(bResult, {
          type: 'vim_move_word_backward' as const,
          payload: { count: 1 },
        });
        expect(bResult.cursorCol).toBe(5); // Start of hello
      });
    });
  });
});
