/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, act } from 'react';
import { render } from 'ink-testing-library';
import { Box, Text } from 'ink';
import { ScrollableList, type ScrollableListRef } from './ScrollableList.js';
import { ScrollProvider } from '../../contexts/ScrollProvider.js';
import { KeypressProvider } from '../../contexts/KeypressContext.js';
import { MouseProvider } from '../../contexts/MouseContext.js';
import { describe, it, expect, vi } from 'vitest';
// Mock useStdout to provide a fixed size for testing
vi.mock('ink', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ink')>();
  return {
    ...actual,
    useStdout: () => ({
      stdout: {
        columns: 80,
        rows: 24,
        on: vi.fn(),
        off: vi.fn(),
        write: vi.fn(),
      },
    }),
  };
});

interface Item {
  id: string;
  title: string;
}

const getLorem = (index: number) =>
  Array(10)
    .fill(null)
    .map(() => 'lorem ipsum '.repeat((index % 3) + 1).trim())
    .join('\n');

const TestComponent = ({
  initialItems = 1000,
  onAddItem,
  onRef,
}: {
  initialItems?: number;
  onAddItem?: (addItem: () => void) => void;
  onRef?: (ref: ScrollableListRef<Item> | null) => void;
}) => {
  const [items, setItems] = useState<Item[]>(() =>
    Array.from({ length: initialItems }, (_, i) => ({
      id: String(i),
      title: `Item ${i + 1}`,
    })),
  );

  const listRef = useRef<ScrollableListRef<Item>>(null);

  useEffect(() => {
    onAddItem?.(() => {
      setItems((prev) => [
        ...prev,
        {
          id: String(prev.length),
          title: `Item ${prev.length + 1}`,
        },
      ]);
    });
  }, [onAddItem]);

  useEffect(() => {
    if (onRef) {
      onRef(listRef.current);
    }
  }, [onRef]);

  return (
    <MouseProvider mouseEventsEnabled={false}>
      <KeypressProvider kittyProtocolEnabled={false}>
        <ScrollProvider>
          <Box flexDirection="column" width={80} height={24} padding={1}>
            <Box flexGrow={1} borderStyle="round" borderColor="cyan">
              <ScrollableList
                ref={listRef}
                data={items}
                renderItem={({ item, index }) => (
                  <Box flexDirection="column" paddingBottom={2}>
                    <Box
                      sticky
                      flexDirection="column"
                      width={78}
                      opaque
                      stickyChildren={
                        <Box flexDirection="column" width={78} opaque>
                          <Text>{item.title}</Text>
                          <Box
                            borderStyle="single"
                            borderTop={true}
                            borderBottom={false}
                            borderLeft={false}
                            borderRight={false}
                            borderColor="gray"
                          />
                        </Box>
                      }
                    >
                      <Text>{item.title}</Text>
                    </Box>
                    <Text color="gray">{getLorem(index)}</Text>
                  </Box>
                )}
                estimatedItemHeight={() => 14}
                keyExtractor={(item) => item.id}
                hasFocus={true}
                initialScrollIndex={Number.MAX_SAFE_INTEGER}
              />
            </Box>
            <Text>Count: {items.length}</Text>
          </Box>
        </ScrollProvider>
      </KeypressProvider>
    </MouseProvider>
  );
};
describe('ScrollableList Demo Behavior', () => {
  it('should scroll to bottom when new items are added and stop when scrolled up', async () => {
    let addItem: (() => void) | undefined;
    let listRef: ScrollableListRef<Item> | null = null;
    let lastFrame: () => string | undefined;

    await act(async () => {
      const result = render(
        <TestComponent
          onAddItem={(add) => {
            addItem = add;
          }}
          onRef={(ref) => {
            listRef = ref;
          }}
        />,
      );
      lastFrame = result.lastFrame;
    });

    // Initial render should show Item 1000
    expect(lastFrame!()).toContain('Item 1000');
    expect(lastFrame!()).toContain('Count: 1000');

    // Add item 1001
    await act(async () => {
      addItem?.();
    });
    for (let i = 0; i < 20; i++) {
      if (lastFrame!()?.includes('Count: 1001')) break;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
    }
    expect(lastFrame!()).toContain('Item 1001');
    expect(lastFrame!()).toContain('Count: 1001');
    expect(lastFrame!()).not.toContain('Item 990'); // Should have scrolled past it

    // Add item 1002
    await act(async () => {
      addItem?.();
    });
    for (let i = 0; i < 20; i++) {
      if (lastFrame!()?.includes('Count: 1002')) break;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
    }
    expect(lastFrame!()).toContain('Item 1002');
    expect(lastFrame!()).toContain('Count: 1002');
    expect(lastFrame!()).not.toContain('Item 991');

    // Scroll up directly via ref
    await act(async () => {
      listRef?.scrollBy(-5);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    // Add item 1003 - should NOT be visible because we scrolled up
    await act(async () => {
      addItem?.();
    });
    for (let i = 0; i < 20; i++) {
      if (lastFrame!()?.includes('Count: 1003')) break;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
    }
    expect(lastFrame!()).not.toContain('Item 1003');
    expect(lastFrame!()).toContain('Count: 1003');
  });
});
