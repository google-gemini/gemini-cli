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

  it('renders nothing when list is empty', async () => {
    const { lastFrame, waitUntilReady } = render(
      <Checklist title="Test List" items={[]} isExpanded={true} />,
    );
    await waitUntilReady();
    expect(lastFrame({ allowEmpty: true })).toBe('');
  });

  it('renders nothing when collapsed and no active items', async () => {
    const inactiveItems: ChecklistItemData[] = [
      { status: 'completed', label: 'Task 1' },
      { status: 'cancelled', label: 'Task 2' },
    ];
    const { lastFrame, waitUntilReady } = render(
      <Checklist title="Test List" items={inactiveItems} isExpanded={false} />,
    );
    await waitUntilReady();
    expect(lastFrame({ allowEmpty: true })).toBe('');
  });

  it('renders summary view correctly (collapsed)', async () => {
    const { lastFrame, waitUntilReady } = render(
      <Checklist
        title="Test List"
        items={items}
        isExpanded={false}
        toggleHint="toggle me"
      />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders expanded view correctly', async () => {
    const { lastFrame, waitUntilReady } = render(
      <Checklist
        title="Test List"
        items={items}
        isExpanded={true}
        toggleHint="toggle me"
      />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders summary view without in-progress item if none exists', async () => {
    const pendingItems: ChecklistItemData[] = [
      { status: 'completed', label: 'Task 1' },
      { status: 'pending', label: 'Task 2' },
    ];
    const { lastFrame, waitUntilReady } = render(
      <Checklist title="Test List" items={pendingItems} isExpanded={false} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });
});
