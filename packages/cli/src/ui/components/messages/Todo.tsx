/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { type TodoList } from '@google/gemini-cli-core';
import { useUIState } from '../../contexts/UIStateContext.js';
import { useMemo } from 'react';
import type { HistoryItemToolGroup } from '../../types.js';
import { Checklist } from '../Checklist.js';
import type { ChecklistItemData } from '../ChecklistItem.js';

export const TodoTray: React.FC = () => {
  const uiState = useUIState();

  const todos: TodoList | null = useMemo(() => {
    // Find the most recent todo list written by the WriteTodosTool
    for (let i = uiState.history.length - 1; i >= 0; i--) {
      const entry = uiState.history[i];
      if (entry.type !== 'tool_group') {
        continue;
      }
      const toolGroup = entry as HistoryItemToolGroup;
      for (const tool of toolGroup.tools) {
        if (
          typeof tool.resultDisplay !== 'object' ||
          !('todos' in tool.resultDisplay)
        ) {
          continue;
        }
        return tool.resultDisplay;
      }
    }
    return null;
  }, [uiState.history]);

  const checklistItems: ChecklistItemData[] = useMemo(() => {
    if (!todos || !todos.todos) {
      return [];
    }
    return todos.todos.map((todo) => ({
      status: todo.status,
      label: todo.description,
    }));
  }, [todos]);

  if (!todos || !todos.todos) {
    return null;
  }

  return (
    <Checklist
      title="Todo"
      items={checklistItems}
      isExpanded={uiState.showFullTodos}
      toggleHint="ctrl+t to toggle"
    />
  );
};
