/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useReducer, useEffect } from 'react';
import type { Key } from './useKeypress.js';
import type { TextBuffer } from '../components/shared/text-buffer.js';
import { useVimMode } from '../contexts/VimModeContext.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { debugLogger } from '@google/gemini-cli-core';

export type VimMode =
  | 'NORMAL'
  | 'INSERT'
  | 'VISUAL'
  | 'VISUAL_LINE'
  | 'COMMAND';

// Constants
const DIGIT_MULTIPLIER = 10;
const DEFAULT_COUNT = 1;
const DIGIT_1_TO_9 = /^[1-9]$/;

// Command types
const CMD_TYPES = {
  DELETE_WORD_FORWARD: 'dw',
  DELETE_WORD_BACKWARD: 'db',
  DELETE_WORD_END: 'de',
  DELETE_BIG_WORD_FORWARD: 'dW',
  DELETE_BIG_WORD_BACKWARD: 'dB',
  DELETE_BIG_WORD_END: 'dE',
  CHANGE_WORD_FORWARD: 'cw',
  CHANGE_WORD_BACKWARD: 'cb',
  CHANGE_WORD_END: 'ce',
  CHANGE_BIG_WORD_FORWARD: 'cW',
  CHANGE_BIG_WORD_BACKWARD: 'cB',
  CHANGE_BIG_WORD_END: 'cE',
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
  pendingOperator: null as 'g' | 'd' | 'c' | 'y' | null,
  pendingChord: null as 'ctrl+x' | null,
  pendingReplace: false,
  pendingInner: false,
  pendingFind: null as {
    char: string;
    direction: 'forward' | 'backward';
    type: 'inclusive' | 'exclusive';
  } | null,
  lastFind: null as {
    char: string;
    direction: 'forward' | 'backward';
    type: 'inclusive' | 'exclusive';
  } | null,
});

// State and action types for useReducer
type VimState = {
  mode: VimMode;
  commandBuffer: string;
  count: number;
  pendingOperator: 'g' | 'd' | 'c' | 'y' | null;
  pendingChord: 'ctrl+x' | null;
  pendingReplace: boolean;
  pendingInner: boolean;
  pendingFind: {
    char: string;
    direction: 'forward' | 'backward';
    type: 'inclusive' | 'exclusive';
  } | null;
  lastFind: {
    char: string;
    direction: 'forward' | 'backward';
    type: 'inclusive' | 'exclusive';
  } | null;
  lastCommand: { type: string; count: number } | null;
};

type VimAction =
  | { type: 'SET_MODE'; mode: VimMode }
  | { type: 'SET_COMMAND_BUFFER'; buffer: string }
  | { type: 'SET_COUNT'; count: number }
  | { type: 'INCREMENT_COUNT'; digit: number }
  | { type: 'CLEAR_COUNT' }
  | { type: 'SET_PENDING_OPERATOR'; operator: 'g' | 'd' | 'c' | 'y' | null }
  | { type: 'SET_PENDING_CHORD'; chord: 'ctrl+x' | null }
  | { type: 'SET_PENDING_REPLACE'; pending: boolean }
  | { type: 'SET_PENDING_INNER'; pending: boolean }
  | {
      type: 'SET_PENDING_FIND';
      find: {
        char: string;
        direction: 'forward' | 'backward';
        type: 'inclusive' | 'exclusive';
      } | null;
    }
  | {
      type: 'SET_LAST_FIND';
      find: {
        char: string;
        direction: 'forward' | 'backward';
        type: 'inclusive' | 'exclusive';
      } | null;
    }
  | {
      type: 'SET_LAST_COMMAND';
      command: { type: string; count: number } | null;
    }
  | { type: 'CLEAR_PENDING_STATES' }
  | { type: 'ESCAPE_TO_NORMAL' };

const initialVimState: VimState = {
  mode: 'NORMAL',
  commandBuffer: '',
  count: 0,
  pendingOperator: null,
  pendingChord: null,
  pendingReplace: false,
  pendingInner: false,
  pendingFind: null,
  lastFind: null,
  lastCommand: null,
};

// Reducer function
const vimReducer = (state: VimState, action: VimAction): VimState => {
  switch (action.type) {
    case 'SET_MODE':
      return { ...state, mode: action.mode };

    case 'SET_COMMAND_BUFFER':
      return { ...state, commandBuffer: action.buffer };

    case 'SET_COUNT':
      return { ...state, count: action.count };

    case 'INCREMENT_COUNT':
      return { ...state, count: state.count * DIGIT_MULTIPLIER + action.digit };

    case 'CLEAR_COUNT':
      return { ...state, count: 0 };

    case 'SET_PENDING_OPERATOR':
      return { ...state, pendingOperator: action.operator };

    case 'SET_PENDING_CHORD':
      return { ...state, pendingChord: action.chord };

    case 'SET_PENDING_REPLACE':
      return { ...state, pendingReplace: action.pending };

    case 'SET_PENDING_INNER':
      return { ...state, pendingInner: action.pending };

    case 'SET_PENDING_FIND':
      return { ...state, pendingFind: action.find };

    case 'SET_LAST_FIND':
      return { ...state, lastFind: action.find };

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
  const { vimEnabled, vimMode, setVimMode, setCommandBuffer } = useVimMode();
  const settings = useSettings();
  const [state, dispatch] = useReducer(vimReducer, initialVimState);

  // Sync vim mode from context to local state
  useEffect(() => {
    dispatch({ type: 'SET_MODE', mode: vimMode });
  }, [vimMode]);

  // Sync command buffer to context
  useEffect(() => {
    setCommandBuffer(state.commandBuffer);
  }, [state.commandBuffer, setCommandBuffer]);

  // Helper to update mode in both reducer and context
  const updateMode = useCallback(
    (mode: VimMode) => {
      setVimMode(mode);
      dispatch({ type: 'SET_MODE', mode });
      // Clear command buffer when exiting COMMAND mode
      if (mode !== 'COMMAND') {
        dispatch({ type: 'SET_COMMAND_BUFFER', buffer: '' });
      }
    },
    [setVimMode],
  );

  // Helper functions using the reducer state
  const getCurrentCount = useCallback(
    () => state.count || DEFAULT_COUNT,
    [state.count],
  );

  const vimModeStyle = settings.merged.general?.vimModeStyle || 'vim-editor';

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

        case CMD_TYPES.DELETE_BIG_WORD_FORWARD: {
          buffer.vimDeleteBigWordForward(count);
          break;
        }

        case CMD_TYPES.DELETE_BIG_WORD_BACKWARD: {
          buffer.vimDeleteBigWordBackward(count);
          break;
        }

        case CMD_TYPES.DELETE_BIG_WORD_END: {
          buffer.vimDeleteBigWordEnd(count);
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

        case CMD_TYPES.CHANGE_BIG_WORD_FORWARD: {
          buffer.vimChangeBigWordForward(count);
          updateMode('INSERT');
          break;
        }

        case CMD_TYPES.CHANGE_BIG_WORD_BACKWARD: {
          buffer.vimChangeBigWordBackward(count);
          updateMode('INSERT');
          break;
        }

        case CMD_TYPES.CHANGE_BIG_WORD_END: {
          buffer.vimChangeBigWordEnd(count);
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
   * Handles key input in COMMAND mode
   */
  const handleCommandModeInput = useCallback(
    (normalizedKey: Key): boolean => {
      if (normalizedKey.name === 'escape') {
        updateMode('NORMAL');
        return true;
      }

      if (normalizedKey.name === 'return') {
        const cmd = state.commandBuffer;
        updateMode('NORMAL');

        if (cmd.startsWith(':')) {
          // Handle Ex commands
          const command = cmd.slice(1).trim();
          if (command === 'w') {
            // Save is handled by the submit handler usually, or we need a way to trigger save
            // For now, let's assume we can't easily trigger save from here without more context
            // But we can support :q if we had a way to exit.
            // Since we don't have a full ex parser yet, we'll just log/ignore for now or implement what we can.
            // In the plan we said: Implement :w (save), :q (exit), :wq.
            // :w usually submits in this context? Or just writes file?
            // InputPrompt handles "submit" which usually means "send to model" or "execute command".
            // If we want to support :w as "save to file", we might need the onSubmit to handle it if it's a file edit.
            // For now, let's just clear.
          } else if (command === 'q') {
            // Quit
          }
        } else if (cmd.startsWith('/') || cmd.startsWith('?')) {
          // Handle search
          const query = cmd.slice(1);
          const direction = cmd.startsWith('/') ? 'forward' : 'backward';
          if (query) {
            buffer.vimSearch(query, direction);
          }
        }
        return true;
      }

      if (normalizedKey.name === 'backspace') {
        if (state.commandBuffer.length <= 1) {
          updateMode('NORMAL');
        } else {
          dispatch({
            type: 'SET_COMMAND_BUFFER',
            buffer: state.commandBuffer.slice(0, -1),
          });
        }
        return true;
      }

      if (normalizedKey.sequence && normalizedKey.sequence.length === 1) {
        dispatch({
          type: 'SET_COMMAND_BUFFER',
          buffer: state.commandBuffer + normalizedKey.sequence,
        });
        return true;
      }

      return true;
    },
    [state.commandBuffer, updateMode, buffer],
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

      // Handle Ctrl+w (delete word backward)
      if (normalizedKey.ctrl && normalizedKey.name === 'w') {
        buffer.vimDeleteWordBackward(1);
        return true;
      }

      // Handle Ctrl+u (delete to start of line)
      if (normalizedKey.ctrl && normalizedKey.name === 'u') {
        buffer.vimDeleteToLineStart();
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
      insertable: key.insertable || false,
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
    (
      operator: 'd' | 'c',
      motion: 'w' | 'b' | 'e' | 'W' | 'B' | 'E',
    ): boolean => {
      const count = getCurrentCount();

      const commandMap = {
        d: {
          w: CMD_TYPES.DELETE_WORD_FORWARD,
          b: CMD_TYPES.DELETE_WORD_BACKWARD,
          e: CMD_TYPES.DELETE_WORD_END,
          W: CMD_TYPES.DELETE_BIG_WORD_FORWARD,
          B: CMD_TYPES.DELETE_BIG_WORD_BACKWARD,
          E: CMD_TYPES.DELETE_BIG_WORD_END,
        },
        c: {
          w: CMD_TYPES.CHANGE_WORD_FORWARD,
          b: CMD_TYPES.CHANGE_WORD_BACKWARD,
          e: CMD_TYPES.CHANGE_WORD_END,
          W: CMD_TYPES.CHANGE_BIG_WORD_FORWARD,
          B: CMD_TYPES.CHANGE_BIG_WORD_BACKWARD,
          E: CMD_TYPES.CHANGE_BIG_WORD_END,
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
        debugLogger.warn('Malformed key input in vim mode:', key, error);
        return false;
      }

      // Handle pending replace (r + char)
      if (state.pendingReplace) {
        buffer.vimReplaceChar(normalizedKey.sequence);
        dispatch({ type: 'SET_PENDING_REPLACE', pending: false });
        dispatch({ type: 'CLEAR_COUNT' });
        dispatch({
          type: 'SET_LAST_COMMAND',
          command: { type: 'r', count: 1 },
        }); // Store 'r' as last command
        return true; // Handled
      }

      // Handle pending find (f/F/t/T + char)
      if (state.pendingFind) {
        const { direction, type } = state.pendingFind;
        buffer.vimFindChar(normalizedKey.sequence, direction, type);
        dispatch({ type: 'SET_PENDING_FIND', find: null });
        dispatch({
          type: 'SET_LAST_FIND',
          find: { char: normalizedKey.sequence, direction, type },
        }); // Store last find
        dispatch({ type: 'CLEAR_COUNT' });
        return true; // Handled
      }

      // Handle Ctrl+x Chord (Priority over everything else)
      if (state.pendingChord === 'ctrl+x') {
        if (normalizedKey.ctrl && normalizedKey.name === 'e') {
          void buffer.openInExternalEditor();
          dispatch({ type: 'CLEAR_PENDING_STATES' });
          return true; // Handled
        }
        // Fallback: Clear pending state and consume the key (swallow)
        // to prevent accidental inputs when chord fails
        dispatch({ type: 'CLEAR_PENDING_STATES' });
        return true;
      }

      // Check for Ctrl+x to start chord
      if (normalizedKey.ctrl && normalizedKey.name === 'x') {
        dispatch({ type: 'SET_PENDING_CHORD', chord: 'ctrl+x' });
        return true;
      }

      // Handle INSERT mode
      if (state.mode === 'INSERT') {
        return handleInsertModeInput(normalizedKey);
      }

      // Handle COMMAND mode
      if (state.mode === 'COMMAND') {
        return handleCommandModeInput(normalizedKey);
      }

      // Handle NORMAL and VISUAL modes
      if (
        state.mode === 'NORMAL' ||
        state.mode === 'VISUAL' ||
        state.mode === 'VISUAL_LINE'
      ) {
        // Handle escape
        if (normalizedKey.name === 'escape') {
          if (state.mode === 'VISUAL' || state.mode === 'VISUAL_LINE') {
            updateMode('NORMAL');
            buffer.vimClearSelection();
            dispatch({ type: 'CLEAR_PENDING_STATES' });
            return true;
          }
          if (state.pendingOperator) {
            dispatch({ type: 'CLEAR_PENDING_STATES' });
            return true; // Handled by vim
          }
          return false; // Pass through to other handlers
        }

        // Handle transitions to COMMAND mode
        if (
          state.mode === 'NORMAL' &&
          (normalizedKey.sequence === ':' ||
            normalizedKey.sequence === '/' ||
            normalizedKey.sequence === '?')
        ) {
          // In bash-vim mode, let InputPrompt handle / and ? for history search
          if (
            vimModeStyle === 'bash-vim' &&
            (normalizedKey.sequence === '/' || normalizedKey.sequence === '?')
          ) {
            return false;
          }

          if (settings.merged.general?.disableVimCommandMode) {
            // When command mode is disabled, allow typing these characters
            // by switching to INSERT mode first
            updateMode('INSERT');
            buffer.handleInput(normalizedKey);
            return true;
          }
          updateMode('COMMAND');
          dispatch({
            type: 'SET_COMMAND_BUFFER',
            buffer: normalizedKey.sequence,
          });
          return true;
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
          case 'v': {
            // Toggle Visual Mode
            if (state.mode === 'NORMAL') {
              updateMode('VISUAL');
              buffer.vimSetSelectionAnchor();
            } else if (state.mode === 'VISUAL') {
              updateMode('NORMAL');
              buffer.vimClearSelection();
            } else if (state.mode === 'VISUAL_LINE') {
              updateMode('VISUAL');
            }
            dispatch({ type: 'CLEAR_COUNT' });
            return true;
          }

          case 'V': {
            // Toggle Visual Line Mode
            if (state.mode === 'NORMAL') {
              updateMode('VISUAL_LINE');
              buffer.vimSetSelectionAnchor();
            } else if (state.mode === 'VISUAL_LINE') {
              updateMode('NORMAL');
              buffer.vimClearSelection();
            } else if (state.mode === 'VISUAL') {
              updateMode('VISUAL_LINE');
            }
            dispatch({ type: 'CLEAR_COUNT' });
            return true;
          }

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
            // In readline mode, let InputPrompt handle 'j' for history navigation
            if (
              vimModeStyle === 'bash-vim' &&
              state.mode === 'NORMAL' &&
              !state.pendingOperator
            ) {
              return false;
            }

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
            // In readline mode, let InputPrompt handle 'k' for history navigation
            if (
              vimModeStyle === 'bash-vim' &&
              state.mode === 'NORMAL' &&
              !state.pendingOperator
            ) {
              return false;
            }

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
            // Check for inner word operations (diw, ciw, yiw)
            if (state.pendingInner) {
              if (state.pendingOperator === 'd') {
                buffer.vimDeleteInnerWord(repeatCount);
                dispatch({ type: 'CLEAR_PENDING_STATES' });
                dispatch({ type: 'CLEAR_COUNT' });
                return true;
              }
              if (state.pendingOperator === 'c') {
                buffer.vimChangeInnerWord(repeatCount);
                updateMode('INSERT');
                dispatch({ type: 'CLEAR_PENDING_STATES' });
                dispatch({ type: 'CLEAR_COUNT' });
                return true;
              }
              if (state.pendingOperator === 'y') {
                buffer.vimYankInnerWord(repeatCount);
                dispatch({ type: 'CLEAR_PENDING_STATES' });
                dispatch({ type: 'CLEAR_COUNT' });
                return true;
              }
            }

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

          case 'W': {
            // Check if this is part of a delete or change command (dW/cW)
            if (state.pendingOperator === 'd') {
              return handleOperatorMotion('d', 'W');
            }
            if (state.pendingOperator === 'c') {
              return handleOperatorMotion('c', 'W');
            }

            // Normal big word movement
            buffer.vimMoveBigWordForward(repeatCount);
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

          case 'B': {
            // Check if this is part of a delete or change command (dB/cB)
            if (state.pendingOperator === 'd') {
              return handleOperatorMotion('d', 'B');
            }
            if (state.pendingOperator === 'c') {
              return handleOperatorMotion('c', 'B');
            }

            // Normal backward big word movement
            buffer.vimMoveBigWordBackward(repeatCount);
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

          case 'E': {
            // Check if this is part of a delete or change command (dE/cE)
            if (state.pendingOperator === 'd') {
              return handleOperatorMotion('d', 'E');
            }
            if (state.pendingOperator === 'c') {
              return handleOperatorMotion('c', 'E');
            }

            // Normal big word end movement
            buffer.vimMoveBigWordEnd(repeatCount);
            dispatch({ type: 'CLEAR_COUNT' });
            return true;
          }

          case 'X': {
            // Delete character before cursor (backspace behavior in vim)
            buffer.vimDeleteCharBefore(repeatCount);
            dispatch({ type: 'CLEAR_COUNT' });
            return true;
          }

          case 'x': {
            if (state.mode === 'VISUAL' || state.mode === 'VISUAL_LINE') {
              buffer.vimYankSelection();
              buffer.vimDeleteChar(1);
              updateMode('NORMAL');
              dispatch({ type: 'CLEAR_COUNT' });
              return true;
            }

            // Delete character under cursor
            buffer.vimDeleteChar(repeatCount);
            dispatch({
              type: 'SET_LAST_COMMAND',
              command: { type: CMD_TYPES.DELETE_CHAR, count: repeatCount },
            });
            dispatch({ type: 'CLEAR_COUNT' });
            return true;
          }

          case '~': {
            buffer.vimToggleCase(repeatCount);
            dispatch({ type: 'CLEAR_COUNT' });
            return true;
          }

          case 'i': {
            if (state.pendingOperator) {
              dispatch({ type: 'SET_PENDING_INNER', pending: true });
              return true;
            }

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

          case '|': {
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

          case '%': {
            buffer.vimMoveToMatchingPair();
            dispatch({ type: 'CLEAR_COUNT' });
            return true;
          }

          case 'g': {
            if (state.pendingOperator === 'g') {
              // Second 'g' - go to first line (gg command)
              // In readline mode, let InputPrompt handle it (history) or map to history start
              // But 'gg' isn't standard readline. Readline usually uses Meta-< to go to first history line.
              // But if we want vim feel in readline mode, gg should probably go to start of history.
              // Plan says: "G to history line N. Remove gg."
              // Wait, remove gg? "Remove gg." in research.
              // In plan: "j/k... G...". Nothing about gg.
              // If we yield 'G' to parent, we can yield 'gg' too if we want.
              // Let's assume standard behavior for now unless explicit.
              // Plan says: "Readline Mode Behavior: ... G: Go to history entry N. ... "
              // I will yield 'G' below.
              // For 'gg', I'll keep it as buffer start for now unless it conflicts?
              // Standard readline doesn't have 'gg'.
              // I'll keep default behavior for 'gg' (buffer start) for now as it's not explicitly overridden in plan "Readline Mode Behavior" list (except maybe implicitly by "Remove gg" in research notes, but plan didn't list it in "Desired End State" list for Readline Mode).
              // Actually, if j/k navigate history, then 'buffer' concept is single line?
              // No, buffer is the input box content.
              // If I am in readline mode, j/k go through history.
              // Buffer navigation (multi-line input) becomes harder?
              // Readline usually handles multi-line edit by navigating within the line(s) with h/l or other keys.
              // But vertical movement usually means history.
              // So 'gg' moving to first line of buffer might be confusing if the user expects history.
              // But let's stick to explicit requirements.
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
            if (
              vimModeStyle === 'bash-vim' &&
              state.mode === 'NORMAL' &&
              !state.pendingOperator
            ) {
              return false;
            }

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

          case 'n': {
            buffer.vimSearchNext('forward');
            dispatch({ type: 'CLEAR_COUNT' });
            return true;
          }

          case 'N': {
            // Reverse search direction
            // If last search was forward, N means backward
            // TODO: We need to know if last search was forward or backward to flip it correctly?
            // Standard Vim: 'n' repeats last search in same direction. 'N' repeats in opposite direction.
            // Our vimSearch currently assumes forward.
            // Let's assume forward for now.
            buffer.vimSearchNext('backward');
            dispatch({ type: 'CLEAR_COUNT' });
            return true;
          }

          case 'd': {
            if (state.mode === 'VISUAL' || state.mode === 'VISUAL_LINE') {
              buffer.vimYankSelection();
              buffer.vimDeleteChar(1);
              updateMode('NORMAL');
              dispatch({ type: 'CLEAR_COUNT' });
              return true;
            }

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
            if (state.mode === 'VISUAL' || state.mode === 'VISUAL_LINE') {
              buffer.vimYankSelection();
              buffer.vimDeleteChar(1); // Delete selection
              updateMode('INSERT');
              dispatch({ type: 'CLEAR_COUNT' });
              return true;
            }

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

          case 'y': {
            if (state.mode === 'VISUAL' || state.mode === 'VISUAL_LINE') {
              buffer.vimYankSelection();
              updateMode('NORMAL');
              buffer.vimClearSelection();
              dispatch({ type: 'CLEAR_COUNT' });
              return true;
            }

            if (state.pendingOperator === 'y') {
              const currentLine = buffer.lines[buffer.cursor[0]] || '';
              buffer.vimYank(currentLine + '\n'); // Linewise yank includes newline

              dispatch({ type: 'CLEAR_COUNT' });
              dispatch({ type: 'SET_PENDING_OPERATOR', operator: null });
              return true;
            } else {
              // First 'y'
              dispatch({ type: 'SET_PENDING_OPERATOR', operator: 'y' });
              return true;
            }
          }

          case 'p': {
            buffer.vimPaste('after');
            dispatch({ type: 'CLEAR_COUNT' });
            return true;
          }

          case 'P': {
            buffer.vimPaste('before');
            dispatch({ type: 'CLEAR_COUNT' });
            return true;
          }

          case 'u': {
            // Undo
            buffer.undo();
            dispatch({ type: 'CLEAR_COUNT' });
            return true;
          }

          case 'r': {
            // Replace character (r)
            dispatch({ type: 'SET_PENDING_REPLACE', pending: true });
            dispatch({ type: 'CLEAR_COUNT' });
            return true;
          }

          case 'f':
          case 'F':
          case 't':
          case 'T': {
            const findDirection =
              normalizedKey.sequence === 'f' || normalizedKey.sequence === 't'
                ? 'forward'
                : 'backward';
            const findType =
              normalizedKey.sequence === 'f' || normalizedKey.sequence === 'F'
                ? 'inclusive'
                : 'exclusive';
            dispatch({
              type: 'SET_PENDING_FIND',
              find: {
                char: '', // This will be set by the next key
                direction: findDirection,
                type: findType,
              },
            });
            dispatch({ type: 'CLEAR_COUNT' });
            return true;
          }

          case ';': {
            if (state.lastFind) {
              const { char, direction, type } = state.lastFind;
              buffer.vimFindChar(char, direction, type);
              dispatch({ type: 'CLEAR_COUNT' });
              return true;
            }
            return false; // No last find to repeat
          }

          case ',': {
            if (state.lastFind) {
              const { char, direction, type } = state.lastFind;
              const newDirection =
                direction === 'forward' ? 'backward' : 'forward';
              buffer.vimFindChar(char, newDirection, type);
              dispatch({ type: 'CLEAR_COUNT' });
              return true;
            }
            return false;
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
      state.pendingChord,
      state.pendingReplace,
      state.pendingInner,
      state.pendingFind,
      state.lastFind,
      state.lastCommand,
      dispatch,
      getCurrentCount,
      handleChangeMovement,
      handleOperatorMotion,
      buffer,
      executeCommand,
      updateMode,
      handleCommandModeInput,
      settings.merged.general?.disableVimCommandMode,
      vimModeStyle,
    ],
  );

  return {
    mode: state.mode,
    vimModeEnabled: vimEnabled,
    count: state.count,
    lastCommand: state.lastCommand,
    lastFind: state.lastFind,
    handleInput, // Expose the input handler for InputPrompt to use
  };
}
