/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { cpLen } from '../utils/textUtils.js';

export interface InlineEditState {
  key: string | null;
  buffer: string;
  cursorPos: number;
  cursorVisible: boolean;
}

export interface UseInlineEditReturn {
  editState: InlineEditState;
  startEdit: (key: string, initialValue?: string) => void;
  updateBuffer: (buffer: string, cursorPos: number) => void;
  setBuffer: (buffer: string) => void;
  moveCursor: (position: number) => void;
  clearEdit: () => void;
  isEditing: boolean;
}

const INITIAL_STATE: InlineEditState = {
  key: null,
  buffer: '',
  cursorPos: 0,
  cursorVisible: true,
};

/**
 * Hook for managing inline text editing state in the SettingsDialog.
 * Consolidates editingKey, editBuffer, editCursorPos, and cursorVisible
 * into a single cohesive state management unit.
 */
export function useInlineEdit(): UseInlineEditReturn {
  const [editState, setEditState] = useState<InlineEditState>(INITIAL_STATE);

  // Cursor blink effect - only active when editing
  useEffect(() => {
    if (!editState.key) {
      // Reset cursor visibility when not editing
      if (!editState.cursorVisible) {
        setEditState((s) => ({ ...s, cursorVisible: true }));
      }
      return;
    }
    const id = setInterval(
      () => setEditState((s) => ({ ...s, cursorVisible: !s.cursorVisible })),
      500,
    );
    return () => clearInterval(id);
  }, [editState.key, editState.cursorVisible]);

  const startEdit = useCallback((key: string, initialValue?: string) => {
    const initial = initialValue ?? '';
    setEditState({
      key,
      buffer: initial,
      cursorPos: cpLen(initial),
      cursorVisible: true,
    });
  }, []);

  const updateBuffer = useCallback((buffer: string, cursorPos: number) => {
    setEditState((s) => ({ ...s, buffer, cursorPos }));
  }, []);

  const setBuffer = useCallback((buffer: string) => {
    setEditState((s) => ({ ...s, buffer }));
  }, []);

  const moveCursor = useCallback((position: number) => {
    setEditState((s) => ({ ...s, cursorPos: position }));
  }, []);

  const clearEdit = useCallback(() => {
    setEditState(INITIAL_STATE);
  }, []);

  return {
    editState,
    startEdit,
    updateBuffer,
    setBuffer,
    moveCursor,
    clearEdit,
    isEditing: editState.key !== null,
  };
}
