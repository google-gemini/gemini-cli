/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../../test-utils/render.js';
import { waitFor } from '../../../test-utils/async.js';
import { VirtualizedList } from './VirtualizedList.js';
import { useVirtualizedListClick } from '../../hooks/useVirtualizedListClick.js';
import { Box, Text } from 'ink';
import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';

describe('VirtualizedList Interactivity', () => {
  const keyExtractor = (item: { id: string }) => item.id;

  const InteractiveItem = ({
    id,
    onToggle,
  }: {
    id: string;
    onToggle: () => void;
  }) => {
    const { ref } = useVirtualizedListClick(id, 'toggle', onToggle);
    return (
      <Box height={1} width={80} ref={ref}>
        <Text>Item {id}</Text>
      </Box>
    );
  };

  it('triggers callback when tagged area is clicked', async () => {
    const onToggle = vi.fn();
    const data = [{ id: '1' }];

    const { simulateClick, waitUntilReady, lastFrame } =
      await renderWithProviders(
        <Box height={10} width={80}>
          <VirtualizedList
            data={data}
            keyExtractor={keyExtractor}
            estimatedItemHeight={() => 1}
            renderItem={({ item }) => (
              <InteractiveItem id={item.id} onToggle={onToggle} />
            )}
          />
        </Box>,
        { mouseEventsEnabled: true },
      );

    await waitUntilReady();
    expect(lastFrame()).toContain('Item 1');

    // Simulate click on the first line (Item 1)
    // VirtualizedList is at (0,0) and Item 1 is at (0,0) relative to list.
    // simulateClick expects absolute coordinates.
    // In renderWithProviders, the wrapper Box is at (0,0)?
    // Actually getBoundingBox(state.current.container) in VirtualizedList will give absolute coords.
    await simulateClick(1, 1);

    await waitFor(() => expect(onToggle).toHaveBeenCalled());
  });

  it('wakes up static item and triggers callback on click', async () => {
    const onToggle = vi.fn();
    const data = [{ id: '1' }];

    const TestComponent = () => {
      const [isStatic, setIsStatic] = useState(false);
      return (
        <Box height={10} width={80}>
          <VirtualizedList
            data={data}
            keyExtractor={keyExtractor}
            estimatedItemHeight={() => 1}
            renderItem={({ item }) => (
              <InteractiveItem id={item.id} onToggle={onToggle} />
            )}
            isStaticItem={() => isStatic}
          />
          <Box
            ref={(el) => {
              if (el) {
                setTimeout(() => setIsStatic(true), 100);
              }
            }}
          />
        </Box>
      );
    };

    const { simulateClick, waitUntilReady, lastFrame } =
      await renderWithProviders(<TestComponent />, {
        mouseEventsEnabled: true,
      });

    await waitUntilReady();
    // Wait for the transition to static to happen and be recorded
    await new Promise((r) => setTimeout(r, 200));

    expect(lastFrame()).toContain('Item 1');

    // Click to wake up and trigger
    await simulateClick(1, 1);

    await waitFor(() => expect(onToggle).toHaveBeenCalled());
  });
});
