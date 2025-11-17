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
import { waitFor } from '../../../test-utils/async.js';

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
      <KeypressProvider>
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
    await waitFor(() => {
      expect(lastFrame!()).toContain('Count: 1001');
    });
    expect(lastFrame!()).toContain('Item 1001');
    expect(lastFrame!()).not.toContain('Item 990'); // Should have scrolled past it

    // Add item 1002
    await act(async () => {
      addItem?.();
    });
    await waitFor(() => {
      expect(lastFrame!()).toContain('Count: 1002');
    });
    expect(lastFrame!()).toContain('Item 1002');
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
    await waitFor(() => {
      expect(lastFrame!()).toContain('Count: 1003');
    });
    expect(lastFrame!()).not.toContain('Item 1003');
  });

  it('should display sticky header when scrolled past the item', async () => {
    let listRef: ScrollableListRef<Item> | null = null;
    const StickyTestComponent = () => {
      const items = Array.from({ length: 100 }, (_, i) => ({
        id: String(i),
        title: `Item ${i + 1}`,
      }));

      const ref = useRef<ScrollableListRef<Item>>(null);
      useEffect(() => {
        listRef = ref.current;
      }, []);

      return (
        <MouseProvider mouseEventsEnabled={false}>
          <KeypressProvider>
            <ScrollProvider>
              <Box flexDirection="column" width={80} height={10}>
                <ScrollableList
                  ref={ref}
                  data={items}
                  renderItem={({ item, index }) => (
                    <Box flexDirection="column" height={3}>
                      {index === 0 ? (
                        <Box
                          sticky
                          stickyChildren={<Text>[STICKY] {item.title}</Text>}
                        >
                          <Text>[Normal] {item.title}</Text>
                        </Box>
                      ) : (
                        <Text>[Normal] {item.title}</Text>
                      )}
                      <Text>Content for {item.title}</Text>
                      <Text>More content for {item.title}</Text>
                    </Box>
                  )}
                  estimatedItemHeight={() => 3}
                  keyExtractor={(item) => item.id}
                  hasFocus={true}
                />
              </Box>
            </ScrollProvider>
          </KeypressProvider>
        </MouseProvider>
      );
    };

    let lastFrame: () => string | undefined;
    await act(async () => {
      const result = render(<StickyTestComponent />);
      lastFrame = result.lastFrame;
    });

    // Initially at top, should see Normal Item 1
    await waitFor(() => {
      expect(lastFrame!()).toContain('[Normal] Item 1');
    });
    expect(lastFrame!()).not.toContain('[STICKY] Item 1');

    // Scroll down slightly. Item 1 (height 3) is now partially off-screen (-2), so it should stick.
    await act(async () => {
      listRef?.scrollBy(2);
    });

    // Now Item 1 should be stuck
    await waitFor(() => {
      expect(lastFrame!()).toContain('[STICKY] Item 1');
    });
    expect(lastFrame!()).not.toContain('[Normal] Item 1');

    // Scroll further down to unmount Item 1.
    // Viewport height 10, item height 3. Scroll to 10.
    // startIndex should be around 2, so Item 1 (index 0) is unmounted.
    await act(async () => {
      listRef?.scrollTo(10);
    });

    await waitFor(() => {
      expect(lastFrame!()).not.toContain('[STICKY] Item 1');
    });

    // Scroll back to top
    await act(async () => {
      listRef?.scrollTo(0);
    });

    // Should be normal again
    await waitFor(() => {
      expect(lastFrame!()).toContain('[Normal] Item 1');
    });
    expect(lastFrame!()).not.toContain('[STICKY] Item 1');
  });

  describe('Keyboard Navigation', () => {
    it('should handle scroll keys correctly', async () => {
      let listRef: ScrollableListRef<Item> | null = null;
      let lastFrame: () => string | undefined;
      let stdin: { write: (data: string) => void };

      const items = Array.from({ length: 50 }, (_, i) => ({
        id: String(i),
        title: `Item ${i}`,
      }));

      await act(async () => {
        const result = render(
          <MouseProvider mouseEventsEnabled={false}>
            <KeypressProvider>
              <ScrollProvider>
                <Box flexDirection="column" width={80} height={10}>
                  <ScrollableList
                    ref={(ref) => {
                      listRef = ref;
                    }}
                    data={items}
                    renderItem={({ item }) => <Text>{item.title}</Text>}
                    estimatedItemHeight={() => 1}
                    keyExtractor={(item) => item.id}
                    hasFocus={true}
                  />
                </Box>
              </ScrollProvider>
            </KeypressProvider>
          </MouseProvider>,
        );
        lastFrame = result.lastFrame;
        stdin = result.stdin;
      });

      // Initial state
      expect(lastFrame!()).toContain('Item 0');
      expect(listRef).toBeDefined();
      expect(listRef!.getScrollState()?.scrollTop).toBe(0);

      // Scroll Down (Shift+Down) -> \x1b[b
      await act(async () => {
        stdin.write('\x1b[b');
      });
      await waitFor(() => {
        expect(listRef?.getScrollState()?.scrollTop).toBeGreaterThan(0);
      });

      // Scroll Up (Shift+Up) -> \x1b[a
      await act(async () => {
        stdin.write('\x1b[a');
      });
      await waitFor(() => {
        expect(listRef?.getScrollState()?.scrollTop).toBe(0);
      });

      // Page Down -> \x1b[6~
      await act(async () => {
        stdin.write('\x1b[6~');
      });
      await waitFor(() => {
        // Height is 10, so should scroll ~10 units
        expect(listRef?.getScrollState()?.scrollTop).toBeGreaterThanOrEqual(9);
      });

      // Page Up -> \x1b[5~
      await act(async () => {
        stdin.write('\x1b[5~');
      });
      await waitFor(() => {
        expect(listRef?.getScrollState()?.scrollTop).toBeLessThan(2);
      });

      // End -> \x1b[F
      await act(async () => {
        stdin.write('\x1b[F');
      });
      await waitFor(() => {
        // Total 50 items, height 10. Max scroll ~40.
        expect(listRef?.getScrollState()?.scrollTop).toBeGreaterThan(30);
      });

      // Home -> \x1b[H
      await act(async () => {
        stdin.write('\x1b[H');
      });
      await waitFor(() => {
        expect(listRef?.getScrollState()?.scrollTop).toBe(0);
      });
    });
  });
});
