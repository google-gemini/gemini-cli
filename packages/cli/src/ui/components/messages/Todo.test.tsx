/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders as render } from '../../../test-utils/render.js';
import { describe, it, expect } from 'vitest';
import { TodoTray } from './Todo.js';
import type { Todo } from '@google/gemini-cli-core';
import type { HistoryItem } from '../../types.js';
import { ToolCallStatus } from '../../types.js';
import type { UIState } from '../../contexts/UIStateContext.js';

const createTodoHistoryItem = (todos: Todo[]): HistoryItem =>
  ({
    type: 'tool_group',
    id: '1',
    tools: [
      {
        name: 'write_todos',
        callId: 'tool-1',
        status: ToolCallStatus.Success,
        resultDisplay: {
          todos,
        },
      },
    ],
  }) as unknown as HistoryItem;

describe.each([true, false])(
  '<TodoTray /> (showFullTodos: %s)',
  (showFullTodos: boolean) => {
    const renderWithUiState = (uiState: Partial<UIState>) =>
      render(<TodoTray />, {
        uiState: { ...uiState, showFullTodos },
      });

    it('renders null when no todos are in the history', () => {
      const { lastFrame } = renderWithUiState({ history: [] });
      expect(lastFrame()).toMatchSnapshot();
    });

    it('renders null when todo list is empty', () => {
      const { lastFrame } = renderWithUiState({
        history: [createTodoHistoryItem([])],
      });
      expect(lastFrame()).toMatchSnapshot();
    });

    it('renders when todos exist but none are in progress', () => {
      const { lastFrame } = renderWithUiState({
        history: [
          createTodoHistoryItem([
            { description: 'Pending Task', status: 'pending' },
            { description: 'In Progress Task', status: 'cancelled' },
            { description: 'Completed Task', status: 'completed' },
          ]),
        ],
      });
      expect(lastFrame()).toMatchSnapshot();
    });

    it('renders when todos exist and one is in progress', () => {
      const { lastFrame } = renderWithUiState({
        history: [
          createTodoHistoryItem([
            { description: 'Pending Task', status: 'pending' },
            { description: 'Task 2', status: 'in_progress' },
            { description: 'In Progress Task', status: 'cancelled' },
            { description: 'Completed Task', status: 'completed' },
          ]),
        ],
      });
      expect(lastFrame()).toMatchSnapshot();
    });

    it('renders a todo list with long descriptions that wrap when full view is on', () => {
      const { lastFrame } = render(<TodoTray />, {
        width: 50,
        uiState: {
          history: [
            createTodoHistoryItem([
              {
                description:
                  'This is a very long description for a pending task that should wrap around multiple lines when the terminal width is constrained.',
                status: 'in_progress',
              },
              {
                description:
                  'Another completed task with an equally verbose description to test wrapping behavior.',
                status: 'completed',
              },
            ]),
          ],
          showFullTodos,
        },
      });
      expect(lastFrame()).toMatchSnapshot();
    });

    it('renders the most recent todo list when multiple write_todos calls are in history', () => {
      const { lastFrame } = renderWithUiState({
        history: [
          createTodoHistoryItem([
            { description: 'Older Task 1', status: 'completed' },
            { description: 'Older Task 2', status: 'pending' },
          ]),
          createTodoHistoryItem([
            { description: 'Newer Task 1', status: 'pending' },
            { description: 'Newer Task 2', status: 'in_progress' },
          ]),
        ],
      });
      expect(lastFrame()).toMatchSnapshot();
    });

    it('renders full list when all todos are inactive', () => {
      const { lastFrame } = renderWithUiState({
        history: [
          createTodoHistoryItem([
            { description: 'Task 1', status: 'completed' },
            { description: 'Task 2', status: 'cancelled' },
          ]),
        ],
      });
      expect(lastFrame()).toMatchSnapshot();
    });

    it('renders planTodos instead of history todos when available', () => {
      const { lastFrame } = renderWithUiState({
        history: [
          createTodoHistoryItem([
            { description: 'History Task', status: 'pending' },
          ]),
        ],
        planTodos: [
          { description: 'Plan Task 1', status: 'in_progress' },
          { description: 'Plan Task 2', status: 'pending' },
        ],
        planFileName: 'implementation.md',
      });
      expect(lastFrame()).toMatchSnapshot();
    });

    it('renders planTodos with the correct filename in the header', () => {
      const { lastFrame } = renderWithUiState({
        planTodos: [{ description: 'Only Task', status: 'pending' }],
        planFileName: 'my-feature.md',
        showFullTodos: true,
      });
      expect(lastFrame()).toContain('Plan: my-feature.md');
      expect(lastFrame()).toMatchSnapshot();
    });
  },
);
