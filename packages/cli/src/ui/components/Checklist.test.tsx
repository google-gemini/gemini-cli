/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { describe, it, expect } from 'vitest';
import { Checklist } from './Checklist.js';
import type { ChecklistItemData } from './ChecklistItem.js';

describe('<Checklist />', () => {
  const items: ChecklistItemData[] = [
    { status: 'completed', label: 'Task 1' },
    { status: 'in_progress', label: 'Task 2' },
    { status: 'pending', label: 'Task 3' },
    { status: 'cancelled', label: 'Task 4' },
  ];

  it('renders nothing when list is empty', () => {
    const { lastFrame } = render(
      <Checklist title="Test List" items={[]} isExpanded={true} />,
    );
    expect(lastFrame()).toBe('');
  });

  it('renders nothing when collapsed and no active items', () => {
    const inactiveItems: ChecklistItemData[] = [
      { status: 'completed', label: 'Task 1' },
      { status: 'cancelled', label: 'Task 2' },
    ];
    const { lastFrame } = render(
      <Checklist title="Test List" items={inactiveItems} isExpanded={false} />,
    );
    expect(lastFrame()).toBe('');
  });

  it('renders summary view correctly (collapsed)', () => {
    const { lastFrame } = render(
      <Checklist
        title="Test List"
        items={items}
        isExpanded={false}
        toggleHint="toggle me"
      />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders expanded view correctly', () => {
    const { lastFrame } = render(
      <Checklist
        title="Test List"
        items={items}
        isExpanded={true}
        toggleHint="toggle me"
      />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders summary view without in-progress item if none exists', () => {
    const pendingItems: ChecklistItemData[] = [
      { status: 'completed', label: 'Task 1' },
      { status: 'pending', label: 'Task 2' },
    ];
    const { lastFrame } = render(
      <Checklist title="Test List" items={pendingItems} isExpanded={false} />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });
});
