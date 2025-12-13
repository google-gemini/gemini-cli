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

const TodoTitleDisplay: React.FC<{ todos: TodoList }> = ({ todos }) => {
  const score = useMemo(() => {
    let total = 0;
    let completed = 0;
    for (const todo of todos.todos) {
      if (todo.status !== 'cancelled') {
        total += 1;
        if (todo.status === 'completed') {
          completed += 1;
        }
      }
    }
    return `${completed}/${total} completed`;
  }, [todos]);

  return (
    <Box flexDirection="row" columnGap={2} height={1}>
      <Text color={theme.text.primary} bold aria-label="Todo list">
        Todo
      </Text>
      <Text color={theme.text.secondary}>{score} (ctrl+t to toggle)</Text>
    </Box>
  );
};

const TodoStatusDisplay: React.FC<{ status: TodoStatus }> = ({ status }) => {
  switch (status) {
    case 'completed':
      return (
        <Text color={theme.status.success} aria-label="Completed">
          ✓
        </Text>
      );
    case 'in_progress':
      return (
        <Text color={theme.text.accent} aria-label="In Progress">
          »
        </Text>
      );
    case 'pending':
      return (
        <Text color={theme.text.secondary} aria-label="Pending">
          ☐
        </Text>
      );
    case 'cancelled':
    default:
      return (
        <Text color={theme.status.error} aria-label="Cancelled">
          ✗
        </Text>
      );
  }
};

const TodoItemDisplay: React.FC<{
  todo: Todo;
  wrap?: 'truncate';
  role?: 'listitem';
}> = ({ todo, wrap, role: ariaRole }) => {
  const textColor = (() => {
    switch (todo.status) {
      case 'in_progress':
        return theme.text.accent;
      case 'completed':
      case 'cancelled':
        return theme.text.secondary;
      default:
        return theme.text.primary;
    }
  })();
  const strikethrough = todo.status === 'cancelled';

  return (
    <Box flexDirection="row" columnGap={1} aria-role={ariaRole}>
      <TodoStatusDisplay status={todo.status} />
      <Box flexShrink={1}>
        <Text color={textColor} wrap={wrap} strikethrough={strikethrough}>
          {todo.description}
        </Text>
      </Box>
    </Box>
  );
};

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

  const inProgress: Todo | null = useMemo(() => {
    if (todos === null) {
      return null;
    }
    return todos.todos.find((todo) => todo.status === 'in_progress') || null;
  }, [todos]);

  const hasActiveTodos = useMemo(() => {
    if (!todos || !todos.todos) return false;
    return todos.todos.some(
      (todo) => todo.status === 'pending' || todo.status === 'in_progress',
    );
  }, [todos]);

  if (
    todos === null ||
    !todos.todos ||
    todos.todos.length === 0 ||
    (!uiState.showFullTodos && !hasActiveTodos)
  ) {
    return null;
  }

  return (
    <Box
      borderStyle="single"
      borderBottom={false}
      borderRight={false}
      borderLeft={false}
      borderColor={theme.border.default}
      paddingLeft={1}
      paddingRight={1}
    >
      {uiState.showFullTodos ? (
        <Box flexDirection="column" rowGap={1}>
          <TodoTitleDisplay todos={todos} />
          <TodoListDisplay todos={todos} />
        </Box>
      ) : (
        <Box flexDirection="row" columnGap={1} height={1}>
          <Box flexShrink={0} flexGrow={0}>
            <TodoTitleDisplay todos={todos} />
          </Box>
          {inProgress && (
            <Box flexShrink={1} flexGrow={1}>
              <TodoItemDisplay todo={inProgress} wrap="truncate" />
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
};

interface TodoListDisplayProps {
  todos: TodoList;
}

const TodoListDisplay: React.FC<TodoListDisplayProps> = ({ todos }) => (
  <Box flexDirection="column" aria-role="list">
    {todos.todos.map((todo: Todo, index: number) => (
      <TodoItemDisplay todo={todo} key={index} role="listitem" />
    ))}
  </Box>
);
