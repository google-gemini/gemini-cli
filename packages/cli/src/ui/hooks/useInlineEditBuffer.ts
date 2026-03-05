/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useReducer, useCallback, useEffect, useState } from 'react';
import { cpSlice, cpLen, stripUnsafeCharacters } from '../utils/textUtils.js';

export interface EditBufferState {
  editingKey: string | null;
  buffer: string;
  cursorPos: number;
}

export type EditBufferAction =
  | { type: 'START_EDIT'; key: string; initialValue: string }
  | { type: 'COMMIT_EDIT' }
  | { type: 'MOVE_LEFT' }
  | { type: 'MOVE_RIGHT' }
  | { type: 'HOME' }
  | { type: 'END' }
  | { type: 'DELETE_LEFT' }
  | { type: 'DELETE_RIGHT' }
  | { type: 'INSERT_CHAR'; char: string; isNumberType: boolean };

const initialState: EditBufferState = {
  editingKey: null,
  buffer: '',
  cursorPos: 0,
};

function editBufferReducer(
  state: EditBufferState,
  action: EditBufferAction,
): EditBufferState {
  switch (action.type) {
    case 'START_EDIT':
      return {
        editingKey: action.key,
        buffer: action.initialValue,
        cursorPos: cpLen(action.initialValue),
      };

    case 'COMMIT_EDIT':
      return initialState;

    case 'MOVE_LEFT':
      return {
        ...state,
        cursorPos: Math.max(0, state.cursorPos - 1),
      };

    case 'MOVE_RIGHT':
      return {
        ...state,
        cursorPos: Math.min(cpLen(state.buffer), state.cursorPos + 1),
      };

    case 'HOME':
      return { ...state, cursorPos: 0 };

    case 'END':
      return { ...state, cursorPos: cpLen(state.buffer) };

    case 'DELETE_LEFT': {
      if (state.cursorPos === 0) return state;
      const before = cpSlice(state.buffer, 0, state.cursorPos - 1);
      const after = cpSlice(state.buffer, state.cursorPos);
      return {
        ...state,
        buffer: before + after,
        cursorPos: state.cursorPos - 1,
      };
    }

    case 'DELETE_RIGHT': {
      if (state.cursorPos === cpLen(state.buffer)) return state;
      const before = cpSlice(state.buffer, 0, state.cursorPos);
      const after = cpSlice(state.buffer, state.cursorPos + 1);
      return {
        ...state,
        buffer: before + after,
      };
    }

    case 'INSERT_CHAR': {
      let ch = action.char;
      let isValidChar = false;

      if (action.isNumberType) {
        isValidChar = /[0-9\-+.]/.test(ch);
      } else {
        isValidChar = ch.length === 1 && ch.charCodeAt(0) >= 32;
        ch = stripUnsafeCharacters(ch);
      }

      if (!isValidChar || ch.length === 0) return state;

      const before = cpSlice(state.buffer, 0, state.cursorPos);
      const after = cpSlice(state.buffer, state.cursorPos);
      return {
        ...state,
        buffer: before + ch + after,
        cursorPos: state.cursorPos + 1,
      };
    }

    default:
      return state;
  }
}

export interface UseEditBufferProps {
  onCommit: (key: string, value: string) => void;
}

export function useInlineEditBuffer({ onCommit }: UseEditBufferProps) {
  const [state, dispatch] = useReducer(editBufferReducer, initialState);
  const [cursorVisible, setCursorVisible] = useState(true);

  useEffect(() => {
    if (!state.editingKey) {
      setCursorVisible(true);
      return;
    }
    setCursorVisible(true);
    const interval = setInterval(() => {
      setCursorVisible((v) => !v);
    }, 500);
    return () => clearInterval(interval);
  }, [state.editingKey, state.buffer, state.cursorPos]);

  const startEditing = useCallback((key: string, initialValue: string) => {
    dispatch({ type: 'START_EDIT', key, initialValue });
  }, []);

  const commitEdit = useCallback(() => {
    if (state.editingKey) {
      onCommit(state.editingKey, state.buffer);
    }
    dispatch({ type: 'COMMIT_EDIT' });
  }, [state.editingKey, state.buffer, onCommit]);

  return {
    editState: state,
    editDispatch: dispatch,
    startEditing,
    commitEdit,
    cursorVisible,
  };
}
