/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders as render } from '../../../test-utils/render.js';
import { VirtualizedList } from './VirtualizedList.js';
import { Text, Box } from 'ink';
import { describe, it, expect } from 'vitest';

describe('<VirtualizedList /> fallback', () => {
  const keyExtractor = (item: string) => item;

  it('uses default maxScrollbackLength of 1000 when not provided', async () => {
    const longData = Array.from({ length: 2000 }, (_, i) => `Item ${i}`);
    const renderedIndices = new Set<number>();
    const renderItem1px = ({
      item,
      index,
    }: {
      item: string;
      index: number;
    }) => {
      renderedIndices.add(index);
      return (
        <Box height={1}>
          <Text>{item}</Text>
        </Box>
      );
    };

    const { unmount } = await render(
      <Box height={10} width={100}>
        <VirtualizedList
          data={longData}
          renderItem={renderItem1px}
          keyExtractor={keyExtractor}
          estimatedItemHeight={() => 1}
          initialScrollIndex={1999}
          overflowToBackbuffer={true}
          // maxScrollbackLength is NOT provided
        />
      </Box>,
    );

    // Viewport height is 10.
    // initialScrollIndex is 1999.
    // actualScrollTop = 2000 - 10 = 1990.
    // Default fallback maxScrollbackLength = 1000.
    // targetOffset = 1990 - 1000 = 990.
    // renderRangeStart should be around 989/990.
    // Items below 980 should NOT be rendered.
    // Items around 1000 SHOULD be rendered.

    // Check viewport items are rendered
    expect(renderedIndices.has(1995)).toBe(true);
    expect(renderedIndices.has(1999)).toBe(true);

    // Check items in maxScrollbackLength (1000) are rendered
    expect(renderedIndices.has(1000)).toBe(true);
    expect(renderedIndices.has(1100)).toBe(true);

    // Check items beyond maxScrollbackLength are NOT rendered
    expect(renderedIndices.has(0)).toBe(false);
    expect(renderedIndices.has(500)).toBe(false);
    expect(renderedIndices.has(900)).toBe(false);

    unmount();
  });
});
