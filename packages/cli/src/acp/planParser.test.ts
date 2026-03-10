/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { extractPlanEntries } from './planParser.js';

describe('planParser', () => {
  it('should extract simple tasks', () => {
    const text = `
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

  it('should ignore tasks in code blocks', () => {
    const text = `
- [ ] Valid task
\`\`\`
- [ ] Ignored task
\`\`\`
    `;
    const entries = extractPlanEntries(text);
    expect(entries).toEqual([
      { content: 'Valid task', status: 'pending', priority: 'medium' },
    ]);
  });

  it('should handle alternative status labels', () => {
    const text = `
1. [TODO] Task 1
2. [DONE] Task 2
3. [IN_PROGRESS] Task 3
    `;
    const entries = extractPlanEntries(text);
    expect(entries).toEqual([
      { content: 'Task 1', status: 'pending', priority: 'medium' },
      { content: 'Task 2', status: 'completed', priority: 'medium' },
      { content: 'Task 3', status: 'in_progress', priority: 'medium' },
    ]);
  });

  it('should return null if no tasks are found', () => {
    const text = 'Just some text without tasks.';
    expect(extractPlanEntries(text)).toBeNull();
  });
});
