/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { describe, it, expect } from 'vitest';
import { ChecklistItem, type ChecklistItemData } from './ChecklistItem.js';
import { Box } from 'ink';

describe('<ChecklistItem />', () => {
  it.each([
    { status: 'pending', label: 'Do this' },
    { status: 'in_progress', label: 'Doing this' },
    { status: 'completed', label: 'Done this' },
    { status: 'cancelled', label: 'Skipped this' },
  ] as ChecklistItemData[])('renders %s item correctly', async (item) => {
    const { lastFrame, waitUntilReady } = render(<ChecklistItem item={item} />);
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('truncates long text when wrap="truncate"', async () => {
    const item: ChecklistItemData = {
      status: 'in_progress',
      label:
        'This is a very long text that should be truncated because the wrap prop is set to truncate',
    };
    const { lastFrame, waitUntilReady } = render(
      <Box width={30}>
        <ChecklistItem item={item} wrap="truncate" />
      </Box>,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('wraps long text by default', async () => {
    const item: ChecklistItemData = {
      status: 'in_progress',
      label:
        'This is a very long text that should wrap because the default behavior is wrapping',
    };
    const { lastFrame, waitUntilReady } = render(
      <Box width={30}>
        <ChecklistItem item={item} />
      </Box>,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });
});
