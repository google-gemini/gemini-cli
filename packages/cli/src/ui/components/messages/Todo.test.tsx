/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { Box } from 'ink';
import { TodoTray } from './Todo.js';
import type { Todo } from '@google/gemini-cli-core';
import type { UIState } from '../../contexts/UIStateContext.js';
import { UIStateContext } from '../../contexts/UIStateContext.js';
import type { HistoryItem } from '../../types.js';
import { ToolCallStatus } from '../../types.js';

const createTodoHistoryItem = (todos: Todo[]): HistoryItem =>
  ({
    type: 'tool_group',
    id: '1',
    tools: [
      {
        name: 'write_todos_list',
        callId: 'tool-1',
        status: ToolCallStatus.Success,
        resultDisplay: {
          todos,
        },
      },
    ],
  }) as unknown as HistoryItem;

describe('<TodoTray />', () => {
  const mockHistoryItem = createTodoHistoryItem([
    { description: 'Pending Task', status: 'pending' },
    { description: 'In Progress Task', status: 'in_progress' },
    { description: 'Completed Task', status: 'completed' },
  ]);

  const renderWithUiState = (uiState: Partial<UIState>) =>
    render(
      <UIStateContext.Provider value={uiState as UIState}>
        <TodoTray />
      </UIStateContext.Provider>,
    );

  it('renders null when no todos are in the history', () => {
    const { lastFrame } = renderWithUiState({ history: [] });
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders null when todos exist but none are in progress and full view is off', () => {
    const historyWithNoInProgress = createTodoHistoryItem([
      { description: 'Pending Task', status: 'pending' },
      { description: 'In Progress Task', status: 'cancelled' },
      { description: 'Completed Task', status: 'completed' },
    ]);
    const { lastFrame } = renderWithUiState({
      history: [historyWithNoInProgress],
      showFullTodos: false,
    });
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders an empty todo list when full view is on', () => {
    const emptyTodosHistoryItem = createTodoHistoryItem([]);
    const { lastFrame } = renderWithUiState({
      history: [emptyTodosHistoryItem],
      showFullTodos: true,
    });
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders a todo list with various statuses when full view is on', () => {
    const variousTodosHistoryItem = createTodoHistoryItem([
      { description: 'Task 1', status: 'pending' },
      { description: 'Task 2', status: 'in_progress' },
      { description: 'Task 3', status: 'completed' },
      { description: 'Task 4', status: 'cancelled' },
    ]);
    const { lastFrame } = renderWithUiState({
      history: [variousTodosHistoryItem],
      showFullTodos: true,
    });
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders a todo list with long descriptions that wrap when full view is on', () => {
    const longDescriptionTodosHistoryItem = createTodoHistoryItem([
      {
        description:
          'This is a very long description for a pending task that should wrap around multiple lines when the terminal width is constrained.',
        status: 'pending',
      },
      {
        description:
          'Another completed task with an equally verbose description to test wrapping behavior.',
        status: 'completed',
      },
    ]);
    const { lastFrame } = render(
      <Box width="30">
        <UIStateContext.Provider
          value={
            {
              history: [longDescriptionTodosHistoryItem],
              showFullTodos: true,
            } as UIState
          }
        >
          <TodoTray />
        </UIStateContext.Provider>
      </Box>,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders a single todo item when full view is on', () => {
    const singleTodoHistoryItem = createTodoHistoryItem([
      { description: 'Single task', status: 'pending' },
    ]);
    const { lastFrame } = renderWithUiState({
      history: [singleTodoHistoryItem],
      showFullTodos: true,
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
