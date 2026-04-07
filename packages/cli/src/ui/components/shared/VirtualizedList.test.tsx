/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../../test-utils/render.js';
import { waitFor } from '../../../test-utils/async.js';
import { VirtualizedList, type VirtualizedListRef } from './VirtualizedList.js';
import { Text, Box } from 'ink';
import {
  createRef,
  act,
  useEffect,
  createContext,
  useContext,
  useState,
} from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('<VirtualizedList />', () => {
  const keyExtractor = (item: string) => item;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('with 10px height and 100 items', () => {
    const longData = Array.from({ length: 100 }, (_, i) => `Item ${i}`);
    // We use 1px for items. Container is 10px.
    // Viewport shows 10 items. Overscan adds 10 items.
    const itemHeight = 1;
    const renderItem1px = ({ item }: { item: string }) => (
      <Box height={itemHeight}>
        <Text>{item}</Text>
      </Box>
    );

    it.each([
      {
        name: 'top',
        initialScrollIndex: undefined,
        visible: ['Item 0', 'Item 7'],
        notVisible: ['Item 8', 'Item 15', 'Item 50', 'Item 99'],
      },
      {
        name: 'scrolled to bottom',
        initialScrollIndex: 99,
        visible: ['Item 99', 'Item 92'],
        notVisible: ['Item 91', 'Item 85', 'Item 50', 'Item 0'],
      },
    ])(
      'renders only visible items ($name)',
      async ({ initialScrollIndex, visible, notVisible }) => {
        const { lastFrame, unmount } = await render(
          <Box height={10} width={100} borderStyle="round">
            <VirtualizedList
              data={longData}
              renderItem={renderItem1px}
              keyExtractor={keyExtractor}
              estimatedItemHeight={() => itemHeight}
              initialScrollIndex={initialScrollIndex}
            />
          </Box>,
        );

        const output = lastFrame();
        visible.forEach((item) => {
          expect(output).toContain(item);
        });
        notVisible.forEach((item) => {
          expect(output).not.toContain(item);
        });
        expect(output).toMatchSnapshot();
        unmount();
      },
    );

    it('sticks to bottom when new items added', async () => {
      const { lastFrame, rerender, waitUntilReady, unmount } = await render(
        <Box height={10} width={100} borderStyle="round">
          <VirtualizedList
            data={longData}
            renderItem={renderItem1px}
            keyExtractor={keyExtractor}
            estimatedItemHeight={() => itemHeight}
            initialScrollIndex={99}
          />
        </Box>,
      );

      expect(lastFrame()).toContain('Item 99');

      // Add items
      const newData = [...longData, 'Item 100', 'Item 101'];
      await act(async () => {
        rerender(
          <Box height={10} width={100} borderStyle="round">
            <VirtualizedList
              data={newData}
              renderItem={renderItem1px}
              keyExtractor={keyExtractor}
              estimatedItemHeight={() => itemHeight}
              // We don't need to pass initialScrollIndex again for it to stick,
              // but passing it doesn't hurt. The component should auto-stick because it was at bottom.
            />
          </Box>,
        );
      });
      await waitUntilReady();

      const frame = lastFrame();
      expect(frame).toContain('Item 101');
      expect(frame).not.toContain('Item 0');
      unmount();
    });

    it('scrolls down to show new items when requested via ref', async () => {
      const ref = createRef<VirtualizedListRef<string>>();
      const { lastFrame, waitUntilReady, unmount } = await render(
        <Box height={10} width={100} borderStyle="round">
          <VirtualizedList
            ref={ref}
            data={longData}
            renderItem={renderItem1px}
            keyExtractor={keyExtractor}
            estimatedItemHeight={() => itemHeight}
          />
        </Box>,
      );

      expect(lastFrame()).toContain('Item 0');

      // Scroll to bottom via ref
      await act(async () => {
        ref.current?.scrollToEnd();
      });
      await waitUntilReady();

      const frame = lastFrame();
      expect(frame).toContain('Item 99');
      unmount();
    });

    it.each([
      { initialScrollIndex: 0, expectedMountedCount: 5 },
      { initialScrollIndex: 500, expectedMountedCount: 6 },
      { initialScrollIndex: 999, expectedMountedCount: 5 },
    ])(
      'mounts only visible items with 1000 items and 10px height (scroll: $initialScrollIndex)',
      async ({ initialScrollIndex, expectedMountedCount }) => {
        let mountedCount = 0;
        const tallItemHeight = 5;
        const ItemWithEffect = ({ item }: { item: string }) => {
          useEffect(() => {
            mountedCount++;
            return () => {
              mountedCount--;
            };
          }, []);
          return (
            <Box height={tallItemHeight}>
              <Text>{item}</Text>
            </Box>
          );
        };

        const veryLongData = Array.from(
          { length: 1000 },
          (_, i) => `Item ${i}`,
        );

        const { lastFrame, unmount, waitUntilReady } = await render(
          <Box height={20} width={100} borderStyle="round">
            <VirtualizedList
              data={veryLongData}
              renderItem={({ item }) => (
                <ItemWithEffect key={item} item={item} />
              )}
              keyExtractor={keyExtractor}
              estimatedItemHeight={() => tallItemHeight}
              initialScrollIndex={initialScrollIndex}
            />
          </Box>,
        );

        await waitUntilReady();
        await act(async () => {
          await new Promise((r) => setTimeout(r, 50));
        });

        const frame = lastFrame();
        expect(mountedCount).toBe(expectedMountedCount);
        expect(frame).toMatchSnapshot();
        unmount();
      },
    );
  });

  it('renders more items when a visible item shrinks via context update', async () => {
    const SizeContext = createContext<{
      firstItemHeight: number;
      setFirstItemHeight: (h: number) => void;
    }>({
      firstItemHeight: 10,
      setFirstItemHeight: () => {},
    });

    const items = Array.from({ length: 20 }, (_, i) => ({
      id: `Item ${i}`,
    }));

    const ItemWithContext = ({
      item,
      index,
    }: {
      item: { id: string };
      index: number;
    }) => {
      const { firstItemHeight } = useContext(SizeContext);
      const height = index === 0 ? firstItemHeight : 1;
      return (
        <Box height={height}>
          <Text>{item.id}</Text>
        </Box>
      );
    };

    const TestComponent = () => {
      const [firstItemHeight, setFirstItemHeight] = useState(10);
      return (
        <SizeContext.Provider value={{ firstItemHeight, setFirstItemHeight }}>
          <Box height={10} width={100}>
            <VirtualizedList
              data={items}
              renderItem={({ item, index }) => (
                <ItemWithContext item={item} index={index} />
              )}
              keyExtractor={(item) => item.id}
              estimatedItemHeight={() => 1}
            />
          </Box>
          {/* Expose setter for testing */}
          <TestControl setFirstItemHeight={setFirstItemHeight} />
        </SizeContext.Provider>
      );
    };

    let setHeightFn: (h: number) => void = () => {};
    const TestControl = ({
      setFirstItemHeight,
    }: {
      setFirstItemHeight: (h: number) => void;
    }) => {
      setHeightFn = setFirstItemHeight;
      return null;
    };

    const { lastFrame, unmount, waitUntilReady } = await render(
      <TestComponent />,
    );

    // Initially, only Item 0 (height 10) fills the 10px viewport
    expect(lastFrame()).toContain('Item 0');
    expect(lastFrame()).not.toContain('Item 1');

    // Shrink Item 0 to 1px via context
    await act(async () => {
      setHeightFn(1);
    });
    await waitUntilReady();

    // Now Item 0 is 1px, so Items 1-9 should also be visible to fill 10px
    await waitFor(() => {
      expect(lastFrame()).toContain('Item 0');
      expect(lastFrame()).toContain('Item 1');
      expect(lastFrame()).toContain('Item 9');
    });
    unmount();
  });

  it('updates scroll position correctly when scrollBy is called multiple times in the same tick', async () => {
    const ref = createRef<VirtualizedListRef<string>>();
    const longData = Array.from({ length: 100 }, (_, i) => `Item ${i}`);
    const itemHeight = 1;
    const renderItem1px = ({ item }: { item: string }) => (
      <Box height={itemHeight}>
        <Text>{item}</Text>
      </Box>
    );
    const keyExtractor = (item: string) => item;

    const { unmount, waitUntilReady } = await render(
      <Box height={10} width={100} borderStyle="round">
        <VirtualizedList
          ref={ref}
          data={longData}
          renderItem={renderItem1px}
          keyExtractor={keyExtractor}
          estimatedItemHeight={() => itemHeight}
        />
      </Box>,
    );

    expect(ref.current?.getScrollState().scrollTop).toBe(0);

    await act(async () => {
      ref.current?.scrollBy(1);
      ref.current?.scrollBy(1);
    });
    await waitUntilReady();

    expect(ref.current?.getScrollState().scrollTop).toBe(2);

    await act(async () => {
      ref.current?.scrollBy(2);
    });
    await waitUntilReady();

    expect(ref.current?.getScrollState().scrollTop).toBe(4);
    unmount();
  });

  it('culls items that exceed maxScrollbackLength when overflowToBackbuffer is true', async () => {
    const longData = Array.from({ length: 100 }, (_, i) => `Item ${i}`);
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
      <Box height={10} width={100} borderStyle="round">
        <VirtualizedList
          data={longData}
          renderItem={renderItem1px}
          keyExtractor={(item) => item}
          estimatedItemHeight={() => 1}
          initialScrollIndex={99}
          overflowToBackbuffer={true}
          maxScrollbackLength={10}
        />
      </Box>,
    );

    // Viewport height is 10, total items = 100.
    // actualScrollTop = 92 (due to top/bottom borders taking 2 lines out of 10, inner height 8).
    // wait, if height is 10 with round border, inner height is 8.
    // actualScrollTop = 100 - 8 = 92.
    // maxScrollbackLength = 10.
    // targetOffset = 92 - 10 = 82.
    // So renderRangeStart should be 81 (or 82).
    // Items 0 to 80 should not be rendered!

    // Check viewport items are rendered
    expect(renderedIndices.has(95)).toBe(true);
    expect(renderedIndices.has(99)).toBe(true);

    // Check items in maxScrollbackLength are rendered
    expect(renderedIndices.has(85)).toBe(true);

    // Check items beyond maxScrollbackLength are NOT rendered
    expect(renderedIndices.has(0)).toBe(false);
    expect(renderedIndices.has(50)).toBe(false);
    expect(renderedIndices.has(75)).toBe(false);

    unmount();
  });

  it('does not forget item heights when items are prepended', async () => {
    const ref = createRef<VirtualizedListRef<string>>();
    const data = ['Item 1', 'Item 2'];
    const { rerender, waitUntilReady, unmount } = await render(
      <Box height={10} width={100}>
        <VirtualizedList
          ref={ref}
          data={data}
          renderItem={({ item }) => (
            <Box height={1}>
              <Text>{item}</Text>
            </Box>
          )}
          keyExtractor={(item) => item}
          estimatedItemHeight={() => 1000}
        />
      </Box>,
    );

    await waitUntilReady();
    await new Promise((r) => setTimeout(r, 50));
    // Item 1 and 2 measured. totalHeight = 2.
    expect(ref.current?.getScrollState().scrollHeight).toBe(2);

    // Prepend Item 0
    const newData = ['Item 0', 'Item 1', 'Item 2'];
    await act(async () => {
      rerender(
        <Box height={10} width={100}>
          <VirtualizedList
            ref={ref}
            data={newData}
            renderItem={({ item }) => (
              <Box height={1}>
                <Text>{item}</Text>
              </Box>
            )}
            keyExtractor={(item) => item}
            estimatedItemHeight={() => 1000}
          />
        </Box>,
      );
    });
    // With the Map-based cache, Item 1 and 2 heights (1 each) should be preserved
    // even though their indices changed.
    // Item 0 is new and uses estimate 1000.
    // So totalHeight should be 1002 (before Item 0 is measured).
    // Note: It might already be 3 if Item 0 was measured immediately, but it
    // definitely shouldn't be 3000 (which it would be if Item 1 and 2 were forgotten).
    const scrollHeight = ref.current?.getScrollState().scrollHeight;
    expect(scrollHeight).toBeGreaterThan(0);
    expect(scrollHeight).toBeLessThan(3000);

    await waitFor(() => {
      expect(ref.current?.getScrollState().scrollHeight).toBe(3);
    });

    unmount();
  });

  it('updates totalHeight correctly when estimated height differs from real height and scrolled up', async () => {
    const ref = createRef<VirtualizedListRef<string>>();
    const longData = Array.from({ length: 10 }, (_, i) => `Item ${i}`);
    const itemHeight = 1;
    const renderItem1px = ({ item }: { item: string }) => (
      <Box height={itemHeight}>
        <Text>{item}</Text>
      </Box>
    );
    const keyExtractor = (item: string) => item;

    const { unmount } = await render(
      <Box height={5} width={100}>
        <VirtualizedList
          ref={ref}
          data={longData}
          renderItem={renderItem1px}
          keyExtractor={keyExtractor}
          estimatedItemHeight={() => 1000}
        />
      </Box>,
    );

    for (let i = 1; i <= 10; i++) {
      await act(async () => {
        ref.current?.scrollTo(i * 1000);
      });
      await new Promise((r) => setTimeout(r, 10)); // allow React/Ink to process the scroll
    }

    await act(async () => {
      ref.current?.scrollTo(0);
    });
    // Wait for the final scroll top to settle and height to be correct
    await waitFor(() => {
      expect(ref.current?.getScrollState().scrollTop).toBe(0);
      expect(ref.current?.getScrollState().scrollHeight).toBe(10);
    });

    unmount();
  });
});
