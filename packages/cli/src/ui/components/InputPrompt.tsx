/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback } from 'react';
import { Text, Box, Key } from 'ink';
import { Colors } from '../colors.js';
import { Suggestion } from './SuggestionsDisplay.js';
import { MultilineTextEditor } from './shared/multiline-editor.js';
import { useInputHistory } from '../hooks/useInputHistory.js';

interface InputPromptProps {
  query: string;
  onChange: (value: string) => void;
  onChangeAndMoveCursor: (value: string) => void;
  editorState: EditorState;
  onSubmit: (value: string) => void;
  showSuggestions: boolean;
  suggestions: Suggestion[];
  activeSuggestionIndex: number;
  resetCompletion: () => void;
  userMessages: readonly string[];
  navigateSuggestionUp: () => void;
  navigateSuggestionDown: () => void;
  setEditorState: (updater: (prevState: EditorState) => EditorState) => void;
  onClearScreen: () => void;
}

export interface EditorState {
  key: number;
  initialCursorOffset?: number;
}

export const InputPrompt: React.FC<InputPromptProps> = ({
  query,
  onChange,
  onChangeAndMoveCursor,
  editorState,
  onSubmit,
  showSuggestions,
  suggestions,
  activeSuggestionIndex,
  userMessages,
  navigateSuggestionUp,
  navigateSuggestionDown,
  resetCompletion,
  setEditorState,
  onClearScreen,
}) => {
  const handleSubmit = useCallback(
    (submittedValue: string) => {
      onSubmit(submittedValue);
      onChangeAndMoveCursor(''); // Clear query after submit
    },
    [onSubmit, onChangeAndMoveCursor],
  );

  const inputHistory = useInputHistory({
    userMessages,
    onSubmit: handleSubmit,
    isActive: !showSuggestions, // Input history is active when suggestions are not shown
    currentQuery: query,
    onChangeAndMoveCursor,
  });

  const handleAutocomplete = useCallback(
    (indexToUse: number) => {
      if (indexToUse < 0 || indexToUse >= suggestions.length) {
        return;
      }
      const selectedSuggestion = suggestions[indexToUse];
      const trimmedQuery = query.trimStart();

      if (trimmedQuery.startsWith('/')) {
        // Handle / command completion
        const slashIndex = query.indexOf('/');
        const base = query.substring(0, slashIndex + 1);
        const newValue = base + selectedSuggestion.value;
        onChangeAndMoveCursor(newValue);
        onSubmit(newValue); // Execute the command
        onChangeAndMoveCursor(''); // Clear query after submit
      } else {
        // Handle @ command completion
        const atIndex = query.lastIndexOf('@');
        if (atIndex === -1) return;

        // Find the part of the query after the '@'
        const pathPart = query.substring(atIndex + 1);
        // Find the last slash within that part
        const lastSlashIndexInPath = pathPart.lastIndexOf('/');

        let base = '';
        if (lastSlashIndexInPath === -1) {
          // No slash after '@', replace everything after '@'
          base = query.substring(0, atIndex + 1);
        } else {
          // Slash found, keep everything up to and including the last slash
          base = query.substring(0, atIndex + 1 + lastSlashIndexInPath + 1);
        }

        const newValue = base + selectedSuggestion.value;
        onChangeAndMoveCursor(newValue);
      }

      resetCompletion(); // Hide suggestions after selection
    },
    [query, suggestions, resetCompletion, onChangeAndMoveCursor, onSubmit],
  );

  const inputPreprocessor = useCallback(
    (
      input: string,
      key: Key,
      _currentText?: string,
      _cursorOffset?: number,
    ) => {
      if (showSuggestions) {
        if (key.upArrow) {
          navigateSuggestionUp();
          return true;
        } else if (key.downArrow) {
          navigateSuggestionDown();
          return true;
        } else if (key.tab) {
          if (suggestions.length > 0) {
            const targetIndex =
              activeSuggestionIndex === -1 ? 0 : activeSuggestionIndex;
            if (targetIndex < suggestions.length) {
              handleAutocomplete(targetIndex);
              return true;
            }
          }
        } else if (key.return) {
          if (activeSuggestionIndex >= 0) {
            handleAutocomplete(activeSuggestionIndex);
          } else {
            if (query.trim()) {
              handleSubmit(query);
            }
          }
          return true;
        } else if (key.escape) {
          resetCompletion();
          return true;
        }
      } else {
        // Keybindings when suggestions are not shown
        if (key.ctrl && input === 'a') {
          setEditorState((s) => ({ key: s.key + 1, initialCursorOffset: 0 }));
          return true;
        }
        if (key.ctrl && input === 'e') {
          setEditorState((s) => ({
            key: s.key + 1,
            initialCursorOffset: query.length,
          }));
          return true;
        }
        if (key.ctrl && input === 'l') {
          onClearScreen();
          return true;
        }
        if (key.ctrl && input === 'p') {
          inputHistory.navigateUp();
          return true;
        }
        if (key.ctrl && input === 'n') {
          inputHistory.navigateDown();
          return true;
        }
      }
      return false;
    },
    [
      handleAutocomplete,
      navigateSuggestionDown,
      navigateSuggestionUp,
      query,
      suggestions,
      showSuggestions,
      resetCompletion,
      activeSuggestionIndex,
      handleSubmit,
      inputHistory,
      setEditorState,
      onClearScreen,
    ],
  );

  return (
    <Box borderStyle="round" borderColor={Colors.AccentBlue} paddingX={1}>
      <Text color={Colors.AccentPurple}>&gt; </Text>
      <Box flexGrow={1}>
        <MultilineTextEditor
          key={editorState.key.toString()}
          initialCursorOffset={editorState.initialCursorOffset}
          initialText={query}
          onChange={onChange}
          placeholder="Enter your message or use tools (e.g., @src/file.txt)..."
          /* Account for width used by the box and &gt; */
          navigateUp={inputHistory.navigateUp}
          navigateDown={inputHistory.navigateDown}
          inputPreprocessor={inputPreprocessor}
          widthUsedByParent={3}
          widthFraction={0.9}
          onSubmit={() => {
            // This onSubmit is for the TextInput component itself.
            // It should only fire if suggestions are NOT showing,
            // as inputPreprocessor handles Enter when suggestions are visible.
            const trimmedQuery = query.trim();
            if (!showSuggestions && trimmedQuery) {
              handleSubmit(trimmedQuery);
            }
          }}
        />
      </Box>
    </Box>
  );
};
