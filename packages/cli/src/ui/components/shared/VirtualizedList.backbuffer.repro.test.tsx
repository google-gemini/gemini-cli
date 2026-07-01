/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders as render } from '../../../test-utils/render.js';
import { VirtualizedList } from './VirtualizedList.js';
import type { VirtualizedListRef } from './VirtualizedList.js';
import { Text, Box } from 'ink';
import { describe, it, expect } from 'vitest';
import { createRef } from 'react';

describe('<VirtualizedList /> backbuffer regression', () => {
  const keyExtractor = (item: string) => item;

  it('provides a sufficient history buffer regardless of height estimation', async () => {
    // 1000 items, each 1 line high.
    const data = Array.from(
      { length: 1000 },
      (_, i) => `Item ${String(i).padStart(3, '0')}`,
    );
    const ref = createRef<VirtualizedListRef<string>>();

    const { waitUntilReady, unmount } = await render(
      <Box height={50} width={100}>
        <VirtualizedList
          ref={ref}
          data={data}
          renderItem={({ item }) => (
            <Box height={1}>
              <Text>{item}</Text>
            </Box>
          )}
          keyExtractor={keyExtractor}
          estimatedItemHeight={() => 10}
          initialScrollIndex={999}
          overflowToBackbuffer={true}
          renderStatic={true}
          maxScrollbackLength={150}
        />
      </Box>,
    );

    await waitUntilReady();

    try {
      const state = ref.current?.getScrollState();
      // Viewport is 50, backbuffer is 150.
      // Total scrollHeight should be AT LEAST 200 lines.
      // Since our fix is item-based, and items are 1 line high, it should be
      // exactly or very close to 200.
      expect(state?.scrollHeight).toBeGreaterThanOrEqual(200);
      expect(state?.innerHeight).toBe(50);
    } finally {
      unmount();
    }
  });
});
