/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, act } from 'react';
import { render } from '../../../test-utils/render.js';
import { Box, Text } from 'ink';
import { ScrollableList, type ScrollableListRef } from './ScrollableList.js';
import { ScrollProvider } from '../../contexts/ScrollProvider.js';
import { KeypressProvider } from '../../contexts/KeypressContext.js';
import { MouseProvider } from '../../contexts/MouseContext.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { waitFor } from '../../../test-utils/async.js';

vi.mock('../../contexts/UIStateContext.js', () => ({
  useUIState: vi.fn(() => ({
    copyModeEnabled: false,
  })),
}));

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
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should scroll to bottom when new items are added and stop when scrolled up', async () => {
    let addItem: (() => void) | undefined;
    let listRef: ScrollableListRef<Item> | null = null;
    let lastFrame: (options?: { allowEmpty?: boolean }) => string | undefined;
    let waitUntilReady: () => Promise<void>;

    let result: ReturnType<typeof render>;

    await act(async () => {
      result = render(
        <TestComponent
          onAddItem={(add) => {
            addItem = add;
          }}
          onRef={async (ref) => {
            listRef = ref;
          }}
        />,
      );
      lastFrame = result.lastFrame;
      waitUntilReady = result.waitUntilReady;
    });

    await waitUntilReady!();

    // Initial render should show Item 1000
    expect(lastFrame!()).toContain('Item 1000');
    expect(lastFrame!()).toContain('Count: 1000');

    // Add item 1001
    await act(async () => {
      addItem?.();
    });
    await waitUntilReady!();

    await waitFor(() => {
      expect(lastFrame!()).toContain('Count: 1001');
    });
    expect(lastFrame!()).toContain('Item 1001');
    expect(lastFrame!()).not.toContain('Item 990'); // Should have scrolled past it

    // Add item 1002
    await act(async () => {
      addItem?.();
    });
    await waitUntilReady!();

    await waitFor(() => {
      expect(lastFrame!()).toContain('Count: 1002');
    });
    expect(lastFrame!()).toContain('Item 1002');
    expect(lastFrame!()).not.toContain('Item 991');

    // Scroll up directly via ref
    await act(async () => {
      listRef?.scrollBy(-5);
    });
    await waitUntilReady!();

    // Add item 1003 - should NOT be visible because we scrolled up
    await act(async () => {
      addItem?.();
    });
    await waitUntilReady!();

    await waitFor(() => {
      expect(lastFrame!()).toContain('Count: 1003');
    });
    expect(lastFrame!()).not.toContain('Item 1003');

    await act(async () => {
      result.unmount();
    });
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
    let waitUntilReady: () => Promise<void>;
    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(<StickyTestComponent />);
      lastFrame = result.lastFrame;
      waitUntilReady = result.waitUntilReady;
    });

    await waitUntilReady!();

    // Initially at top, should see Normal Item 1
    await waitFor(() => {
      expect(lastFrame!()).toContain('[Normal] Item 1');
    });
    expect(lastFrame!()).not.toContain('[STICKY] Item 1');

    // Scroll down slightly. Item 1 (height 3) is now partially off-screen (-2), so it should stick.
    await act(async () => {
      listRef?.scrollBy(2);
    });
    await waitUntilReady!();

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
    await waitUntilReady!();

    await waitFor(() => {
      expect(lastFrame!()).not.toContain('[STICKY] Item 1');
    });

    // Scroll back to top
    await act(async () => {
      listRef?.scrollTo(0);
    });
    await waitUntilReady!();

    // Should be normal again
    await waitFor(() => {
      expect(lastFrame!()).toContain('[Normal] Item 1');
    });
    expect(lastFrame!()).not.toContain('[STICKY] Item 1');

    await act(async () => {
      result.unmount();
    });
  });

  describe('Keyboard Navigation', () => {
    it('should handle scroll keys correctly', async () => {
      let listRef: ScrollableListRef<Item> | null = null;
      let lastFrame: (options?: { allowEmpty?: boolean }) => string | undefined;
      let stdin: { write: (data: string) => void };
      let waitUntilReady: () => Promise<void>;

      const items = Array.from({ length: 50 }, (_, i) => ({
        id: String(i),
        title: `Item ${i}`,
      }));

      let result: ReturnType<typeof render>;
      await act(async () => {
        result = render(
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
        waitUntilReady = result.waitUntilReady;
      });

      await waitUntilReady!();

      // Initial state
      expect(lastFrame!()).toContain('Item 0');
      expect(listRef).toBeDefined();
      expect(listRef!.getScrollState()?.scrollTop).toBe(0);

      // Scroll Down (Shift+Down) -> \x1b[b
      await act(async () => {
        stdin.write('\x1b[b');
      });
      await waitUntilReady!();

      await waitFor(() => {
        expect(listRef?.getScrollState()?.scrollTop).toBeGreaterThan(0);
      });

      // Scroll Up (Shift+Up) -> \x1b[a
      await act(async () => {
        stdin.write('\x1b[a');
      });
      await waitUntilReady!();

      await waitFor(() => {
        expect(listRef?.getScrollState()?.scrollTop).toBe(0);
      });

      // Page Down -> \x1b[6~
      await act(async () => {
        stdin.write('\x1b[6~');
      });
      await waitUntilReady!();

      await waitFor(() => {
        // Height is 10, so should scroll ~10 units
        expect(listRef?.getScrollState()?.scrollTop).toBeGreaterThanOrEqual(9);
      });

      // Page Up -> \x1b[5~
      await act(async () => {
        stdin.write('\x1b[5~');
      });
      await waitUntilReady!();

      await waitFor(() => {
        expect(listRef?.getScrollState()?.scrollTop).toBeLessThan(2);
      });

      // End -> \x1b[1;5F (Ctrl+End)
      await act(async () => {
        stdin.write('\x1b[1;5F');
      });
      await waitUntilReady!();

      await waitFor(() => {
        // Total 50 items, height 10. Max scroll ~40.
        expect(listRef?.getScrollState()?.scrollTop).toBeGreaterThan(30);
      });

      // Home -> \x1b[1;5H (Ctrl+Home)
      await act(async () => {
        stdin.write('\x1b[1;5H');
      });
      await waitUntilReady!();

      await waitFor(() => {
        expect(listRef?.getScrollState()?.scrollTop).toBe(0);
      });

      await act(async () => {
        // Let the scrollbar fade out animation finish
        await new Promise((resolve) => setTimeout(resolve, 1600));
        result.unmount();
      });
    });
  });

  describe('Width Prop', () => {
    it('should apply the width prop to the container', async () => {
      const items = [{ id: '1', title: 'Item 1' }];
      let lastFrame: (options?: { allowEmpty?: boolean }) => string | undefined;
      let waitUntilReady: () => Promise<void>;

      let result: ReturnType<typeof render>;
      await act(async () => {
        result = render(
          <MouseProvider mouseEventsEnabled={false}>
            <KeypressProvider>
              <ScrollProvider>
                <Box width={100} height={20}>
                  <ScrollableList
                    data={items}
                    renderItem={({ item }) => <Text>{item.title}</Text>}
                    estimatedItemHeight={() => 1}
                    keyExtractor={(item) => item.id}
                    hasFocus={true}
                    width={50}
                  />
                </Box>
              </ScrollProvider>
            </KeypressProvider>
          </MouseProvider>,
        );
        lastFrame = result.lastFrame;
        waitUntilReady = result.waitUntilReady;
      });

      await waitUntilReady!();

      await waitFor(() => {
        expect(lastFrame()).toContain('Item 1');
      });

      await act(async () => {
        result.unmount();
      });
    });
  });
});
