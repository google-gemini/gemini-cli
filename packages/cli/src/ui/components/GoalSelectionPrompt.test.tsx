/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { GoalSelectionPrompt } from './GoalSelectionPrompt.js';

describe('GoalSelectionPrompt', () => {
  it('should render single goal with opt-out option', () => {
    const onSelect = vi.fn();
    const goals = ['Implementing user authentication'];

    const { lastFrame } = render(
      <GoalSelectionPrompt
        goals={goals}
        onSelect={onSelect}
        terminalWidth={80}
      />,
    );

    expect(lastFrame()).toContain('Implementing user authentication');
    expect(lastFrame()).toContain('Skip');
  });

  it('should render multiple goals', () => {
    const onSelect = vi.fn();
    const goals = [
      'Refactoring API error handling',
      'Implementing rate limiting',
      'Adding request validation',
    ];

    const { lastFrame } = render(
      <GoalSelectionPrompt
        goals={goals}
        onSelect={onSelect}
        terminalWidth={80}
      />,
    );

    expect(lastFrame()).toContain('Refactoring API error handling');
    expect(lastFrame()).toContain('Implementing rate limiting');
    expect(lastFrame()).toContain('Adding request validation');
  });

  it('should display helpful header text', () => {
    const onSelect = vi.fn();
    const goals = ['Add dark mode'];

    const { lastFrame } = render(
      <GoalSelectionPrompt
        goals={goals}
        onSelect={onSelect}
        terminalWidth={80}
      />,
    );

    expect(lastFrame()).toContain(
      'compress the conversation to free up space',
    );
    expect(lastFrame()).toContain('What are you working on?');
  });

  it('should call onSelect with chosen goal', () => {
    const onSelect = vi.fn();
    const goals = ['Implementing OAuth', 'Adding JWT support'];

    const { stdin } = render(
      <GoalSelectionPrompt
        goals={goals}
        onSelect={onSelect}
        terminalWidth={80}
      />,
    );

    // Simulate pressing enter (selecting first option)
    stdin.write('\r');

    expect(onSelect).toHaveBeenCalledWith('Implementing OAuth');
  });
});
