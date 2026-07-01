/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { act } from 'react';
import { Box, Text } from 'ink';
import { describe, expect, it } from 'vitest';
import { renderWithProviders as render } from '../../../test-utils/render.js';
import {
  FixedVirtualizedList,
  SCROLL_TO_ITEM_END,
} from './FixedVirtualizedList.js';

describe('<FixedVirtualizedList />', () => {
  const renderList = (data: string[]) => (
    <Box height={5} width={80}>
      <FixedVirtualizedList
        data={data}
        renderItem={({ item }) => (
          <Box height={1}>
            <Text>{item}</Text>
          </Box>
        )}
        itemHeight={1}
        keyExtractor={(item) => item}
        initialScrollIndex={SCROLL_TO_ITEM_END}
        initialScrollOffsetInIndex={SCROLL_TO_ITEM_END}
        width={80}
        maxHeight={5}
      />
    </Box>
  );

  it('sticks to the bottom when data grows', async () => {
    const initialData = Array.from({ length: 10 }, (_, i) => `Item ${i}`);
    const { lastFrame, rerender, waitUntilReady, unmount } = await render(
      renderList(initialData),
    );
    await waitUntilReady();

    expect(lastFrame()).toContain('Item 9');

    const newData = [...initialData, 'Item 10', 'Item 11'];
    await act(async () => {
      rerender(renderList(newData));
    });
    await waitUntilReady();

    expect(lastFrame()).toContain('Item 11');
    expect(lastFrame()).not.toContain('Item 0');
    unmount();
  });
});
