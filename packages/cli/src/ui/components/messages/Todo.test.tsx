/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { Box } from 'ink';
import { AnchoredTodoListDisplay, TodoListDisplay } from './Todo.js';
import type { TodoList, TodoStatus } from '@google/gemini-cli-core';
import type { UIState } from '../../contexts/UIStateContext.js';
import { UIStateContext } from '../../contexts/UIStateContext.js';
import type { HistoryItem } from '../../types.js';
import { ToolCallStatus } from '../../types.js';

describe('<TodoListDisplay />', () => {
  it('renders an empty todo list correctly', () => {
    const todos: TodoList = { todos: [] };
    const { lastFrame } = render(<TodoListDisplay todos={todos} />);
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
    const { lastFrame } = render(<TodoListDisplay todos={todos} />);
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
      <Box width="30">
        <TodoListDisplay todos={todos} />
      </Box>,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders a single todo item', () => {
    const todos: TodoList = {
      todos: [{ description: 'Single task', status: 'pending' as TodoStatus }],
    };
    const { lastFrame } = render(<TodoListDisplay todos={todos} />);
    expect(lastFrame()).toMatchSnapshot();
  });
});

describe('<AnchoredTodoListDisplay />', () => {
  const mockHistoryItem = {
    type: 'tool_group',
    id: '1',
    tools: [
      {
        name: 'write_todos_list',
        callId: 'tool-1',
        status: ToolCallStatus.Success,
        resultDisplay: {
          todos: [
            { description: 'Pending Task', status: 'pending' },
            { description: 'In Progress Task', status: 'in_progress' },
            { description: 'Completed Task', status: 'completed' },
          ],
        },
      },
    ],
  } as unknown as HistoryItem;

  const renderWithUiState = (uiState: Partial<UIState>) =>
    render(
      <UIStateContext.Provider value={uiState as UIState}>
        <AnchoredTodoListDisplay />
      </UIStateContext.Provider>,
    );

  it('renders null when no todos are in the history', () => {
    const { lastFrame } = renderWithUiState({ history: [] });
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders null when todos exist but none are in progress and full view is off', () => {
    const historyWithNoInProgress = {
      type: 'tool_group',
      id: '1',
      tools: [
        {
          name: 'write_todos_list',
          callId: 'tool-1',
          status: ToolCallStatus.Success,
          resultDisplay: {
            todos: [
              { description: 'Pending Task', status: 'pending' },
              { description: 'In Progress Task', status: 'cancelled' },
              { description: 'Completed Task', status: 'completed' },
            ],
          },
        },
      ],
    } as unknown as HistoryItem;
    const { lastFrame } = renderWithUiState({
      history: [historyWithNoInProgress],
      showFullTodos: false,
    });
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders only the in-progress task when full view is off', () => {
    const { lastFrame } = renderWithUiState({
      history: [mockHistoryItem],
      showFullTodos: false,
    });
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders the full todo list when full view is on', () => {
    const { lastFrame } = renderWithUiState({
      history: [mockHistoryItem],
      showFullTodos: true,
    });
    expect(lastFrame()).toMatchSnapshot();
  });
});
