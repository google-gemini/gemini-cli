/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import {
  type Todo,
  type TodoList,
  type TodoStatus,
} from '@google/gemini-cli-core';
import { theme } from '../../semantic-colors.js';
import { useUIState } from '../../contexts/UIStateContext.js';
import { useMemo } from 'react';
import type { HistoryItemToolGroup } from '../../types.js';

const TodoItemDisplay: React.FC<{ todo: Todo }> = ({ todo }) => (
  <Box flexDirection="row">
    <Box marginRight={1}>
      <TodoStatusDisplay status={todo.status} />
    </Box>
    <Box flexShrink={1}>
      <Text color={theme.text.primary}>{todo.description}</Text>
    </Box>
  </Box>
);

const TodoStatusDisplay: React.FC<{ status: TodoStatus }> = ({ status }) => {
  switch (status) {
    case 'completed':
      return <Text color={theme.status.success}>✓</Text>;
    case 'in_progress':
      return <Text color={theme.text.accent}>»</Text>;
    case 'pending':
      return <Text color={theme.text.primary}>☐</Text>;
    case 'cancelled':
    default:
      return <Text color={theme.status.error}>✗</Text>;
  }
};

export const AnchoredTodoListDisplay: React.FC = () => {
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
        return tool.resultDisplay as TodoList;
      }
    }
    return null;
  }, [uiState.history]);

  const inProgress: Todo | null = useMemo(() => {
    if (todos === null) {
      return null;
    }
    return todos.todos.find((todo) => todo.status === 'in_progress') || null;
  }, [todos]);

  if (todos === null) {
    return null;
  }

  if (uiState.showFullTodos) {
    return (
      <Box
        borderStyle="single"
        paddingLeft={1}
        paddingRight={1}
        borderBottom={false}
        flexDirection="column"
        borderColor={theme.border.default}
      >
        <Text color={theme.text.accent}>
          📝 Todo:
          <Text color={theme.text.secondary}>(ctrl+t to collapse)</Text>
        </Text>

        <Box paddingLeft={4} paddingRight={2} paddingTop={1}>
          <TodoListDisplay todos={todos!} />
        </Box>
      </Box>
    );
  }

  if (inProgress === null) {
    return null;
  }

  return (
    <Box
      borderStyle="single"
      paddingLeft={1}
      paddingRight={1}
      borderBottom={false}
      flexDirection="row"
      borderColor={theme.border.default}
    >
      <Text color={theme.text.accent}>
        📝 Todo:
        <Text color={theme.text.secondary}>(ctrl+t to expand)</Text>
      </Text>
      <TodoItemDisplay todo={inProgress} />
    </Box>
  );
};

export interface TodoListDisplayProps {
  todos: TodoList;
}

export const TodoListDisplay: React.FC<TodoListDisplayProps> = ({ todos }) => (
  <Box flexDirection="column">
    {todos.todos.map((todo: Todo, index: number) => (
      <TodoItemDisplay todo={todo} key={index} />
    ))}
  </Box>
);
