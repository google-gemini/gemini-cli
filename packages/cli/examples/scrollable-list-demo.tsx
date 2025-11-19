/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { render, Box, Text, useInput, useStdout } from 'ink';
import {
  ScrollableList,
  type ScrollableListRef,
} from '../src/ui/components/shared/ScrollableList.js';
import { ScrollProvider } from '../src/ui/contexts/ScrollProvider.js';
import { MouseProvider } from '../src/ui/contexts/MouseContext.js';
import { KeypressProvider } from '../src/ui/contexts/KeypressContext.js';
import {
  enableMouseEvents,
  disableMouseEvents,
} from '../src/ui/utils/mouse.js';

interface Item {
  id: string;
  title: string;
}

const getLorem = (index: number) =>
  Array(10)
    .fill(null)
    .map(() => 'lorem ipsum '.repeat((index % 3) + 1).trim())
    .join('\n');

const Demo = () => {
  const { stdout } = useStdout();
  const [size, setSize] = useState({
    columns: stdout.columns,
    rows: stdout.rows,
  });

  useEffect(() => {
    const onResize = () => {
      setSize({
        columns: stdout.columns,
        rows: stdout.rows,
      });
    };

    stdout.on('resize', onResize);
    return () => {
      stdout.off('resize', onResize);
    };
  }, [stdout]);

  const [items, setItems] = useState<Item[]>(() =>
    Array.from({ length: 1000 }, (_, i) => ({
      id: String(i),
      title: `Item ${i + 1}`,
    })),
  );

  const listRef = useRef<ScrollableListRef<Item>>(null);

  useInput((input, key) => {
    if (input === 'a' || input === 'A') {
      setItems((prev) => [
        ...prev,
        { id: String(prev.length), title: `Item ${prev.length + 1}` },
      ]);
    }
    if ((input === 'e' || input === 'E') && !key.ctrl) {
      setItems((prev) => {
        if (prev.length === 0) return prev;
        const lastIndex = prev.length - 1;
        const lastItem = prev[lastIndex]!;
        const newItem = { ...lastItem, title: lastItem.title + 'e' };
        return [...prev.slice(0, lastIndex), newItem];
      });
    }
    if (key.ctrl && input === 'e') {
      listRef.current?.scrollToEnd();
    }
    // Let Ink handle Ctrl+C via exitOnCtrlC (default true) or handle explicitly if needed.
    // For alternate buffer, explicit handling is often safer for cleanup.
    if (key.escape || (key.ctrl && input === 'c')) {
      process.exit(0);
    }
  });

  return (
    <MouseProvider mouseEventsEnabled={true}>
      <KeypressProvider>
        <ScrollProvider>
          <Box
            flexDirection="column"
            width={size.columns}
            height={size.rows - 1}
            padding={1}
          >
            <Text>
              Press &apos;A&apos; to add an item. Press &apos;E&apos; to edit
              last item. Press &apos;Ctrl+E&apos; to scroll to end. Press
              &apos;Esc&apos; to exit. Mouse wheel or Shift+Up/Down to scroll.
            </Text>
            <Box flexGrow={1} borderStyle="round" borderColor="cyan">
              <ScrollableList
                ref={listRef}
                data={items}
                renderItem={({ item, index }) => (
                  <Box flexDirection="column" paddingBottom={2}>
                    <Box
                      sticky
                      flexDirection="column"
                      width={size.columns - 2}
                      opaque
                      stickyChildren={
                        <Box
                          flexDirection="column"
                          width={size.columns - 2}
                          opaque
                        >
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
                initialScrollOffsetInIndex={Number.MAX_SAFE_INTEGER}
              />
            </Box>
            <Text>Count: {items.length}</Text>
          </Box>
        </ScrollProvider>
      </KeypressProvider>
    </MouseProvider>
  );
};

// Enable mouse reporting before rendering
enableMouseEvents();

// Ensure cleanup happens on exit
process.on('exit', () => {
  disableMouseEvents();
});

// Handle SIGINT explicitly to ensure cleanup runs if Ink doesn't catch it in time
process.on('SIGINT', () => {
  process.exit(0);
});

render(<Demo />, { alternateBuffer: true });
