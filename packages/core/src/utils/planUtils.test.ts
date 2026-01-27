/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { parseMarkdownTodos } from './planUtils.js';

describe('parseMarkdownTodos', () => {
  it('parses basic task list', () => {
    const markdown = `
# Plan
- [ ] Task 1
- [x] Task 2
- [/] Task 3
- [-] Task 4
    `;
    const todos = parseMarkdownTodos(markdown);
    expect(todos).toEqual([
      { description: 'Task 1', status: 'pending' },
      { description: 'Task 2', status: 'completed' },
      { description: 'Task 3', status: 'in_progress' },
      { description: 'Task 4', status: 'cancelled' },
    ]);
  });

  it('parses alternate in-progress markers', () => {
    const markdown = `
- [>] Task 5
- [ / ] Task 6
    `;
    const todos = parseMarkdownTodos(markdown);
    expect(todos).toEqual([
      { description: 'Task 5', status: 'in_progress' },
      { description: 'Task 6', status: 'in_progress' },
    ]);
  });

  it('handles nested lists', () => {
    const markdown = `
- [ ] Outer
  - [x] Inner
    `;
    const todos = parseMarkdownTodos(markdown);
    expect(todos).toEqual([
      { description: 'Outer', status: 'pending' },
      { description: 'Inner', status: 'completed' },
    ]);
  });

  it('ignores non-task list items', () => {
    const markdown = `
- Just a bullet
- [ ] A task
    `;
    const todos = parseMarkdownTodos(markdown);
    expect(todos).toEqual([{ description: 'A task', status: 'pending' }]);
  });

  it('is case-sensitive for completed marker', () => {
    const markdown = `
- [x] lowercase
- [X] uppercase
    `;
    const todos = parseMarkdownTodos(markdown);
    expect(todos).toEqual([
      { description: 'lowercase', status: 'completed' },
      { description: 'uppercase', status: 'pending' },
    ]);
  });
});
