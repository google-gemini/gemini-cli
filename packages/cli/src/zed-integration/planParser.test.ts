/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { extractPlanEntries } from './planParser.js';

describe('planParser', () => {
  it('should extract standard markdown tasks', () => {
    const text = `
      Some thoughts...
      - [ ] Task 1
      - [x] Task 2
      - [/] Task 3
    `;
    const entries = extractPlanEntries(text);
    expect(entries).toEqual([
      { content: 'Task 1', status: 'pending', priority: 'medium' },
      { content: 'Task 2', status: 'completed', priority: 'medium' },
      { content: 'Task 3', status: 'in_progress', priority: 'medium' },
    ]);
  });

  it('should extract numbered markdown tasks with string statuses', () => {
    const text = `
      1. [TODO] First item
      2. [IN PROGRESS] Second item
      3. [DONE] Third item
    `;
    const entries = extractPlanEntries(text);
    expect(entries).toEqual([
      { content: 'First item', status: 'pending', priority: 'medium' },
      { content: 'Second item', status: 'in_progress', priority: 'medium' },
      { content: 'Third item', status: 'completed', priority: 'medium' },
    ]);
  });

  it('should ignore TODOs inside code blocks (even unclosed ones)', () => {
    const text = [
      'I will write this code:',
      '```typescript',
      '// TODO: Fix this bug',
      '- [ ] Do not match this',
      // No closing backticks here simulates streaming
    ].join('\n');

    // Should return null because the block is treated as unclosed code
    expect(extractPlanEntries(text)).toBeNull();
  });

  it('should preserve inline code in tasks', () => {
    const text = '- [ ] Run `npm install` now';
    const entries = extractPlanEntries(text);
    expect(entries).toEqual([
      {
        content: 'Run `npm install` now',
        status: 'pending',
        priority: 'medium',
      },
    ]);
  });

  it('should return null if no tasks are found', () => {
    const text = 'Just some random text with no plan.';
    expect(extractPlanEntries(text)).toBeNull();
  });
});
