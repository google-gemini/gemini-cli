/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import type { Todo, TodoList, TodoStatus } from '@google/gemini-cli-core';
import { theme } from '../../semantic-colors.js';

export interface TodoListDisplayProps {
  todos: TodoList;
  terminalWidth: number;
}
const TodoStatusDisplay: React.FC<{ status: TodoStatus }> = ({ status }) => {
  switch (status) {
    case 'completed':
      return <Text color={theme.status.success}>✓</Text>;
    case 'in_progress':
      return <Text color={theme.text.accent}>»</Text>;
    case 'pending':
      return <Text color={theme.text.primary}>☐</Text>;
    case 'cancelled':
      return <Text color={theme.status.error}>✗</Text>;
    default:
      return null;
  }
};

export const TodoListDisplay: React.FC<TodoListDisplayProps> = ({
  todos,
  terminalWidth,
}) => (
  <Box flexDirection="column" width={terminalWidth}>
    {todos.todos.map((todo: Todo, index: number) => (
      <Box key={index} flexDirection="row">
        <Box marginRight={1}>
          <TodoStatusDisplay status={todo.status} />
        </Box>
        <Box flexShrink={1}>
          <Text color={theme.text.primary}>{todo.description}</Text>
        </Box>
      </Box>
    ))}
  </Box>
);
