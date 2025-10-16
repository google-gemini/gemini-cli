/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { TodoListDisplay } from './TodoListDisplay.js';
import type { TodoList, TodoStatus } from '@google/gemini-cli-core';

describe('<TodoListDisplay />', () => {
  const terminalWidth = 80;

  it('renders an empty todo list correctly', () => {
    const todos: TodoList = { todos: [] };
    const { lastFrame } = render(
      <TodoListDisplay todos={todos} terminalWidth={terminalWidth} />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders a todo list with various statuses correctly', () => {
    const todos: TodoList = {
      todos: [
        { description: 'Task 1', status: 'pending' as TodoStatus },
        { description: 'Task 2', status: 'in_progress' as TodoStatus },
        { description: 'Task 3', status: 'completed' as TodoStatus },
        { description: 'Task 4', status: 'cancelled' as TodoStatus },
      ],
    };
    const { lastFrame } = render(
      <TodoListDisplay todos={todos} terminalWidth={terminalWidth} />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders a todo list with long descriptions that wrap', () => {
    const todos: TodoList = {
      todos: [
        {
          description:
            'This is a very long description for a pending task that should wrap around multiple lines when the terminal width is constrained.',
          status: 'pending' as TodoStatus,
        },
        {
          description:
            'Another completed task with an equally verbose description to test wrapping behavior.',
          status: 'completed' as TodoStatus,
        },
      ],
    };
    const { lastFrame } = render(
      <TodoListDisplay todos={todos} terminalWidth={40} />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders a single todo item', () => {
    const todos: TodoList = {
      todos: [{ description: 'Single task', status: 'pending' as TodoStatus }],
    };
    const { lastFrame } = render(
      <TodoListDisplay todos={todos} terminalWidth={terminalWidth} />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });
});
