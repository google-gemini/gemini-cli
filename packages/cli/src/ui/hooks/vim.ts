/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useReducer, useEffect } from 'react';
import type { Key } from './useKeypress.js';
import type { TextBuffer } from '../components/shared/text-buffer.js';
import { useVimMode } from '../contexts/VimModeContext.js';

export type VimMode = 'NORMAL' | 'INSERT';

// Constants
const DIGIT_MULTIPLIER = 10;
const DEFAULT_COUNT = 1;
const DIGIT_1_TO_9 = /^[1-9]$/;

// Command types
const CMD_TYPES = {
  DELETE_WORD_FORWARD: 'dw',
  DELETE_WORD_BACKWARD: 'db',
  DELETE_WORD_END: 'de',
  CHANGE_WORD_FORWARD: 'cw',
  CHANGE_WORD_BACKWARD: 'cb',
  CHANGE_WORD_END: 'ce',
  DELETE_CHAR: 'x',
  DELETE_LINE: 'dd',
  CHANGE_LINE: 'cc',
  DELETE_TO_EOL: 'D',
  CHANGE_TO_EOL: 'C',
  CHANGE_MOVEMENT: {
    LEFT: 'ch',
    DOWN: 'cj',
    UP: 'ck',
    RIGHT: 'cl',
  },
} as const;

// Helper function to clear pending state
const createClearPendingState = () => ({
  count: 0,
  pendingOperator: null as 'g' | 'd' | 'c' | null,
});

// State and action types for useReducer
type VimState = {
  mode: VimMode;
  count: number;
  pendingOperator: 'g' | 'd' | 'c' | null;
  lastCommand: { type: string; count: number } | null;
};

type VimAction =
  | { type: 'SET_MODE'; mode: VimMode }
  | { type: 'SET_COUNT'; count: number }
  | { type: 'INCREMENT_COUNT'; digit: number }
  | { type: 'CLEAR_COUNT' }
  | { type: 'SET_PENDING_OPERATOR'; operator: 'g' | 'd' | 'c' | null }
  | {
      type: 'SET_LAST_COMMAND';
      command: { type: string; count: number } | null;
    }
  | { type: 'CLEAR_PENDING_STATES' }
  | { type: 'ESCAPE_TO_NORMAL' };

const initialVimState: VimState = {
  mode: 'NORMAL',
  count: 0,
  pendingOperator: null,
  lastCommand: null,
};

// Reducer function
const vimReducer = (state: VimState, action: VimAction): VimState => {
  switch (action.type) {
    case 'SET_MODE':
      return { ...state, mode: action.mode };

    case 'SET_COUNT':
      return { ...state, count: action.count };

    case 'INCREMENT_COUNT':
      return { ...state, count: state.count * DIGIT_MULTIPLIER + action.digit };

    case 'CLEAR_COUNT':
      return { ...state, count: 0 };

    case 'SET_PENDING_OPERATOR':
      return { ...state, pendingOperator: action.operator };

    case 'SET_LAST_COMMAND':
      return { ...state, lastCommand: action.command };

    case 'CLEAR_PENDING_STATES':
      return {
        ...state,
        ...createClearPendingState(),
      };

    case 'ESCAPE_TO_NORMAL':
      // Handle escape - clear all pending states (mode is updated via context)
      return {
        ...state,
        ...createClearPendingState(),
      };

    default:
      return state;
  }
};

/**
 * React hook that provides vim-style editing functionality for text input.
 *
 * Features:
 * - Modal editing (INSERT/NORMAL modes)
 * - Navigation: h,j,k,l,w,b,e,0,$,^,gg,G with count prefixes
 * - Editing: x,a,i,o,O,A,I,d,c,D,C with count prefixes
 * - Complex operations: dd,cc,dw,cw,db,cb,de,ce
 * - Command repetition (.)
 * - Settings persistence
 *
 * @param buffer - TextBuffer instance for text manipulation
 * @param onSubmit - Optional callback for command submission
 * @returns Object with vim state and input handler
 */
export function useVim(buffer: TextBuffer, onSubmit?: (value: string) => void) {
  const { vimEnabled, vimMode, setVimMode } = useVimMode();
  const [state, dispatch] = useReducer(vimReducer, initialVimState);

  // Sync vim mode from context to local state
  useEffect(() => {
    dispatch({ type: 'SET_MODE', mode: vimMode });
  }, [vimMode]);

  // Helper to update mode in both reducer and context
  const updateMode = useCallback(
    (mode: VimMode) => {
      setVimMode(mode);
      dispatch({ type: 'SET_MODE', mode });
    },
    [setVimMode],
  );

  // Helper functions using the reducer state
  const getCurrentCount = useCallback(
    () => state.count || DEFAULT_COUNT,
    [state.count],
  );

  /** Executes common commands to eliminate duplication in dot (.) repeat command */
  const executeCommand = useCallback(
    (cmdType: string, count: number) => {
      switch (cmdType) {
        case CMD_TYPES.DELETE_WORD_FORWARD: {
          buffer.vimDeleteWordForward(count);
          break;
        }

        case CMD_TYPES.DELETE_WORD_BACKWARD: {
          buffer.vimDeleteWordBackward(count);
          break;
        }

        case CMD_TYPES.DELETE_WORD_END: {
          buffer.vimDeleteWordEnd(count);
          break;
        }

        case CMD_TYPES.CHANGE_WORD_FORWARD: {
          buffer.vimChangeWordForward(count);
          updateMode('INSERT');
          break;
        }

        case CMD_TYPES.CHANGE_WORD_BACKWARD: {
          buffer.vimChangeWordBackward(count);
          updateMode('INSERT');
          break;
        }

        case CMD_TYPES.CHANGE_WORD_END: {
          buffer.vimChangeWordEnd(count);
          updateMode('INSERT');
          break;
        }

        case CMD_TYPES.DELETE_CHAR: {
          buffer.vimDeleteChar(count);
          break;
        }

        case CMD_TYPES.DELETE_LINE: {
          buffer.vimDeleteLine(count);
          break;
        }

        case CMD_TYPES.CHANGE_LINE: {
          buffer.vimChangeLine(count);
          updateMode('INSERT');
          break;
        }

        case CMD_TYPES.CHANGE_MOVEMENT.LEFT:
        case CMD_TYPES.CHANGE_MOVEMENT.DOWN:
        case CMD_TYPES.CHANGE_MOVEMENT.UP:
        case CMD_TYPES.CHANGE_MOVEMENT.RIGHT: {
          const movementMap: Record<string, 'h' | 'j' | 'k' | 'l'> = {
            [CMD_TYPES.CHANGE_MOVEMENT.LEFT]: 'h',
            [CMD_TYPES.CHANGE_MOVEMENT.DOWN]: 'j',
            [CMD_TYPES.CHANGE_MOVEMENT.UP]: 'k',
            [CMD_TYPES.CHANGE_MOVEMENT.RIGHT]: 'l',
          };
          const movementType = movementMap[cmdType];
          if (movementType) {
            buffer.vimChangeMovement(movementType, count);
            updateMode('INSERT');
          }
          break;
        }

        case CMD_TYPES.DELETE_TO_EOL: {
          buffer.vimDeleteToEndOfLine();
          break;
        }

        case CMD_TYPES.CHANGE_TO_EOL: {
          buffer.vimChangeToEndOfLine();
          updateMode('INSERT');
          break;
        }

        default:
          return false;
      }
      return true;
    },
    [buffer, updateMode],
  );

  /**
   * Handles key input in INSERT mode
   * @param normalizedKey - The normalized key input
   * @returns boolean indicating if the key was handled
   */
  const handleInsertModeInput = useCallback(
    (normalizedKey: Key): boolean => {
      // Handle escape key immediately - switch to NORMAL mode on any escape
      if (normalizedKey.name === 'escape') {
        // Vim behavior: move cursor left when exiting insert mode (unless at beginning of line)
        buffer.vimEscapeInsertMode();
        dispatch({ type: 'ESCAPE_TO_NORMAL' });
        updateMode('NORMAL');
        return true;
      }

      // In INSERT mode, let InputPrompt handle completion keys and special commands
      if (
        normalizedKey.name === 'tab' ||
        (normalizedKey.name === 'return' && !normalizedKey.ctrl) ||
        normalizedKey.name === 'up' ||
        normalizedKey.name === 'down' ||
        (normalizedKey.ctrl && normalizedKey.name === 'r')
      ) {
        return false; // Let InputPrompt handle completion
      }

      // Let InputPrompt handle Ctrl+V for clipboard image pasting
      if (normalizedKey.ctrl && normalizedKey.name === 'v') {
        return false; // Let InputPrompt handle clipboard functionality
      }

      // Let InputPrompt handle shell commands
      if (normalizedKey.sequence === '!' && buffer.text.length === 0) {
        return false;
      }

      // Special handling for Enter key to allow command submission (lower priority than completion)
      if (
        normalizedKey.name === 'return' &&
        !normalizedKey.ctrl &&
        !normalizedKey.meta
      ) {
        if (buffer.text.trim() && onSubmit) {
          // Handle command submission directly
          const submittedValue = buffer.text;
          buffer.setText('');
          onSubmit(submittedValue);
          return true;
        }
        return true; // Handled by vim (even if no onSubmit callback)
      }

      // useKeypress already provides the correct format for TextBuffer
      buffer.handleInput(normalizedKey);
      return true; // Handled by vim
    },
    [buffer, dispatch, updateMode, onSubmit],
  );

  /**
   * Normalizes key input to ensure all required properties are present
   * @param key - Raw key input
   * @returns Normalized key with all properties
   */
  const normalizeKey = useCallback(
    (key: Key): Key => ({
      name: key.name || '',
      sequence: key.sequence || '',
      ctrl: key.ctrl || false,
      meta: key.meta || false,
      shift: key.shift || false,
      paste: key.paste || false,
    }),
    [],
  );

  /**
   * Handles change movement commands (ch, cj, ck, cl)
   * @param movement - The movement direction
   * @returns boolean indicating if command was handled
   */
  const handleChangeMovement = useCallback(
    (movement: 'h' | 'j' | 'k' | 'l'): boolean => {
      const count = getCurrentCount();
      dispatch({ type: 'CLEAR_COUNT' });
      buffer.vimChangeMovement(movement, count);
      updateMode('INSERT');

      const cmdTypeMap = {
        h: CMD_TYPES.CHANGE_MOVEMENT.LEFT,
        j: CMD_TYPES.CHANGE_MOVEMENT.DOWN,
        k: CMD_TYPES.CHANGE_MOVEMENT.UP,
        l: CMD_TYPES.CHANGE_MOVEMENT.RIGHT,
      };

      dispatch({
        type: 'SET_LAST_COMMAND',
        command: { type: cmdTypeMap[movement], count },
      });
      dispatch({ type: 'SET_PENDING_OPERATOR', operator: null });
      return true;
    },
    [getCurrentCount, dispatch, buffer, updateMode],
  );

  /**
   * Handles operator-motion commands (dw/cw, db/cb, de/ce)
   * @param operator - The operator type ('d' for delete, 'c' for change)
   * @param motion - The motion type ('w', 'b', 'e')
   * @returns boolean indicating if command was handled
   */
  const handleOperatorMotion = useCallback(
    (operator: 'd' | 'c', motion: 'w' | 'b' | 'e'): boolean => {
      const count = getCurrentCount();

      const commandMap = {
        d: {
          w: CMD_TYPES.DELETE_WORD_FORWARD,
          b: CMD_TYPES.DELETE_WORD_BACKWARD,
          e: CMD_TYPES.DELETE_WORD_END,
        },
        c: {
          w: CMD_TYPES.CHANGE_WORD_FORWARD,
          b: CMD_TYPES.CHANGE_WORD_BACKWARD,
          e: CMD_TYPES.CHANGE_WORD_END,
        },
      };

      const cmdType = commandMap[operator][motion];
      executeCommand(cmdType, count);

      dispatch({
        type: 'SET_LAST_COMMAND',
        command: { type: cmdType, count },
      });
      dispatch({ type: 'CLEAR_COUNT' });
      dispatch({ type: 'SET_PENDING_OPERATOR', operator: null });

      return true;
    },
    [getCurrentCount, executeCommand, dispatch],
  );

  const handleInput = useCallback(
    (key: Key): boolean => {
      if (!vimEnabled) {
        return false; // Let InputPrompt handle it
      }

      let normalizedKey: Key;
      try {
        normalizedKey = normalizeKey(key);
      } catch (error) {
        // Handle malformed key inputs gracefully
        console.warn('Malformed key input in vim mode:', key, error);
        return false;
      }

      // Handle INSERT mode
      if (state.mode === 'INSERT') {
        return handleInsertModeInput(normalizedKey);
      }

      // Handle NORMAL mode
      if (state.mode === 'NORMAL') {
        // If in NORMAL mode, allow escape to pass through to other handlers
        // if there's no pending operation.
        if (normalizedKey.name === 'escape') {
          if (state.pendingOperator) {
            dispatch({ type: 'CLEAR_PENDING_STATES' });
            return true; // Handled by vim
          }
          return false; // Pass through to other handlers
        }

        // Handle count input (numbers 1-9, and 0 if count > 0)
        if (
          DIGIT_1_TO_9.test(normalizedKey.sequence) ||
          (normalizedKey.sequence === '0' && state.count > 0)
        ) {
          dispatch({
            type: 'INCREMENT_COUNT',
            digit: parseInt(normalizedKey.sequence, 10),
          });
          return true; // Handled by vim
        }

        const repeatCount = getCurrentCount();

        switch (normalizedKey.sequence) {
          case 'h': {
            // Check if this is part of a change command (ch)
            if (state.pendingOperator === 'c') {
              return handleChangeMovement('h');
            }

            // Normal left movement
            buffer.vimMoveLeft(repeatCount);
            dispatch({ type: 'CLEAR_COUNT' });
            return true;
          }

          case 'j': {
            // Check if this is part of a change command (cj)
            if (state.pendingOperator === 'c') {
              return handleChangeMovement('j');
            }

            // Normal down movement
            buffer.vimMoveDown(repeatCount);
            dispatch({ type: 'CLEAR_COUNT' });
            return true;
          }

          case 'k': {
            // Check if this is part of a change command (ck)
            if (state.pendingOperator === 'c') {
              return handleChangeMovement('k');
            }

            // Normal up movement
            buffer.vimMoveUp(repeatCount);
            dispatch({ type: 'CLEAR_COUNT' });
            return true;
          }

          case 'l': {
            // Check if this is part of a change command (cl)
            if (state.pendingOperator === 'c') {
              return handleChangeMovement('l');
            }

            // Normal right movement
            buffer.vimMoveRight(repeatCount);
            dispatch({ type: 'CLEAR_COUNT' });
            return true;
          }

          case 'w': {
            // Check if this is part of a delete or change command (dw/cw)
            if (state.pendingOperator === 'd') {
              return handleOperatorMotion('d', 'w');
            }
            if (state.pendingOperator === 'c') {
              return handleOperatorMotion('c', 'w');
            }

            // Normal word movement
            buffer.vimMoveWordForward(repeatCount);
            dispatch({ type: 'CLEAR_COUNT' });
            return true;
          }

          case 'b': {
            // Check if this is part of a delete or change command (db/cb)
            if (state.pendingOperator === 'd') {
              return handleOperatorMotion('d', 'b');
            }
            if (state.pendingOperator === 'c') {
              return handleOperatorMotion('c', 'b');
            }

            // Normal backward word movement
            buffer.vimMoveWordBackward(repeatCount);
            dispatch({ type: 'CLEAR_COUNT' });
            return true;
          }

          case 'e': {
            // Check if this is part of a delete or change command (de/ce)
            if (state.pendingOperator === 'd') {
              return handleOperatorMotion('d', 'e');
            }
            if (state.pendingOperator === 'c') {
              return handleOperatorMotion('c', 'e');
            }

            // Normal word end movement
            buffer.vimMoveWordEnd(repeatCount);
            dispatch({ type: 'CLEAR_COUNT' });
            return true;
          }

          case 'x': {
            // Delete character under cursor
            buffer.vimDeleteChar(repeatCount);
            dispatch({
              type: 'SET_LAST_COMMAND',
              command: { type: CMD_TYPES.DELETE_CHAR, count: repeatCount },
            });
            dispatch({ type: 'CLEAR_COUNT' });
            return true;
          }

          case 'i': {
            // Enter INSERT mode at current position
            buffer.vimInsertAtCursor();
            updateMode('INSERT');
            dispatch({ type: 'CLEAR_COUNT' });
            return true;
          }

          case 'a': {
            // Enter INSERT mode after current position
            buffer.vimAppendAtCursor();
            updateMode('INSERT');
            dispatch({ type: 'CLEAR_COUNT' });
            return true;
          }

          case 'o': {
            // Insert new line after current line and enter INSERT mode
            buffer.vimOpenLineBelow();
            updateMode('INSERT');
            dispatch({ type: 'CLEAR_COUNT' });
            return true;
          }

          case 'O': {
            // Insert new line before current line and enter INSERT mode
            buffer.vimOpenLineAbove();
            updateMode('INSERT');
            dispatch({ type: 'CLEAR_COUNT' });
            return true;
          }

          case '0': {
            // Move to start of line
            buffer.vimMoveToLineStart();
            dispatch({ type: 'CLEAR_COUNT' });
            return true;
          }

          case '$': {
            // Move to end of line
            buffer.vimMoveToLineEnd();
            dispatch({ type: 'CLEAR_COUNT' });
            return true;
          }

          case '^': {
            // Move to first non-whitespace character
            buffer.vimMoveToFirstNonWhitespace();
            dispatch({ type: 'CLEAR_COUNT' });
            return true;
          }

          case 'g': {
            if (state.pendingOperator === 'g') {
              // Second 'g' - go to first line (gg command)
              buffer.vimMoveToFirstLine();
              dispatch({ type: 'SET_PENDING_OPERATOR', operator: null });
            } else {
              // First 'g' - wait for second g
              dispatch({ type: 'SET_PENDING_OPERATOR', operator: 'g' });
            }
            dispatch({ type: 'CLEAR_COUNT' });
            return true;
          }

          case 'G': {
            if (state.count > 0) {
              // Go to specific line number (1-based) when a count was provided
              buffer.vimMoveToLine(state.count);
            } else {
              // Go to last line when no count was provided
              buffer.vimMoveToLastLine();
            }
            dispatch({ type: 'CLEAR_COUNT' });
            return true;
          }

          case 'I': {
            // Enter INSERT mode at start of line (first non-whitespace)
            buffer.vimInsertAtLineStart();
            updateMode('INSERT');
            dispatch({ type: 'CLEAR_COUNT' });
            return true;
          }

          case 'A': {
            // Enter INSERT mode at end of line
            buffer.vimAppendAtLineEnd();
            updateMode('INSERT');
            dispatch({ type: 'CLEAR_COUNT' });
            return true;
          }

          case 'd': {
            if (state.pendingOperator === 'd') {
              // Second 'd' - delete N lines (dd command)
              const repeatCount = getCurrentCount();
              executeCommand(CMD_TYPES.DELETE_LINE, repeatCount);
              dispatch({
                type: 'SET_LAST_COMMAND',
                command: { type: CMD_TYPES.DELETE_LINE, count: repeatCount },
              });
              dispatch({ type: 'CLEAR_COUNT' });
              dispatch({ type: 'SET_PENDING_OPERATOR', operator: null });
            } else {
              // First 'd' - wait for movement command
              dispatch({ type: 'SET_PENDING_OPERATOR', operator: 'd' });
            }
            return true;
          }

          case 'c': {
            if (state.pendingOperator === 'c') {
              // Second 'c' - change N entire lines (cc command)
              const repeatCount = getCurrentCount();
              executeCommand(CMD_TYPES.CHANGE_LINE, repeatCount);
              dispatch({
                type: 'SET_LAST_COMMAND',
                command: { type: CMD_TYPES.CHANGE_LINE, count: repeatCount },
              });
              dispatch({ type: 'CLEAR_COUNT' });
              dispatch({ type: 'SET_PENDING_OPERATOR', operator: null });
            } else {
              // First 'c' - wait for movement command
              dispatch({ type: 'SET_PENDING_OPERATOR', operator: 'c' });
            }
            return true;
          }

          case 'D': {
            // Delete from cursor to end of line (equivalent to d$)
            executeCommand(CMD_TYPES.DELETE_TO_EOL, 1);
            dispatch({
              type: 'SET_LAST_COMMAND',
              command: { type: CMD_TYPES.DELETE_TO_EOL, count: 1 },
            });
            dispatch({ type: 'CLEAR_COUNT' });
            return true;
          }

          case 'C': {
            // Change from cursor to end of line (equivalent to c$)
            executeCommand(CMD_TYPES.CHANGE_TO_EOL, 1);
            dispatch({
              type: 'SET_LAST_COMMAND',
              command: { type: CMD_TYPES.CHANGE_TO_EOL, count: 1 },
            });
            dispatch({ type: 'CLEAR_COUNT' });
            return true;
          }

          case '.': {
            // Repeat last command
            if (state.lastCommand) {
              const cmdData = state.lastCommand;

              // All repeatable commands are now handled by executeCommand
              executeCommand(cmdData.type, cmdData.count);
            }

            dispatch({ type: 'CLEAR_COUNT' });
            return true;
          }

          default: {
            // Check for arrow keys (they have different sequences but known names)
            if (normalizedKey.name === 'left') {
              // Left arrow - same as 'h'
              if (state.pendingOperator === 'c') {
                return handleChangeMovement('h');
              }

              // Normal left movement (same as 'h')
              buffer.vimMoveLeft(repeatCount);
              dispatch({ type: 'CLEAR_COUNT' });
              return true;
            }

            if (normalizedKey.name === 'down') {
              // Down arrow - same as 'j'
              if (state.pendingOperator === 'c') {
                return handleChangeMovement('j');
              }

              // Normal down movement (same as 'j')
              buffer.vimMoveDown(repeatCount);
              dispatch({ type: 'CLEAR_COUNT' });
              return true;
            }

            if (normalizedKey.name === 'up') {
              // Up arrow - same as 'k'
              if (state.pendingOperator === 'c') {
                return handleChangeMovement('k');
              }

              // Normal up movement (same as 'k')
              buffer.vimMoveUp(repeatCount);
              dispatch({ type: 'CLEAR_COUNT' });
              return true;
            }

            if (normalizedKey.name === 'right') {
              // Right arrow - same as 'l'
              if (state.pendingOperator === 'c') {
                return handleChangeMovement('l');
              }

              // Normal right movement (same as 'l')
              buffer.vimMoveRight(repeatCount);
              dispatch({ type: 'CLEAR_COUNT' });
              return true;
            }

            // Unknown command, clear count and pending states
            dispatch({ type: 'CLEAR_PENDING_STATES' });
            return true; // Still handled by vim to prevent other handlers
          }
        }
      }

      return false; // Not handled by vim
    },
    [
      vimEnabled,
      normalizeKey,
      handleInsertModeInput,
      state.mode,
      state.count,
      state.pendingOperator,
      state.lastCommand,
      dispatch,
      getCurrentCount,
      handleChangeMovement,
      handleOperatorMotion,
      buffer,
      executeCommand,
      updateMode,
    ],
  );

  return {
    mode: state.mode,
    vimModeEnabled: vimEnabled,
    handleInput, // Expose the input handler for InputPrompt to use
  };
}
