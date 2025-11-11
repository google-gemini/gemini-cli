# Reusable Code Snippets

Copy-paste ready code patterns for building AI CLI interfaces with Ink.

## Table of Contents

1. [Terminal Setup](#terminal-setup)
2. [Scroll Management](#scroll-management)
3. [Virtualized List](#virtualized-list)
4. [Mouse Handling](#mouse-handling)
5. [Keyboard Handling](#keyboard-handling)
6. [Layout Patterns](#layout-patterns)
7. [Utility Functions](#utility-functions)

---

## Terminal Setup

### Enable Raw Mode

```typescript
useEffect(() => {
  if (!process.stdin.setRawMode) return;

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  return () => {
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }
  };
}, []);
```

### Enable Alternate Buffer

```typescript
import ansiEscapes from 'ansi-escapes';

useEffect(() => {
  process.stdout.write(ansiEscapes.enterAlternativeScreen);
  process.stdout.write(ansiEscapes.cursorHide);

  return () => {
    process.stdout.write(ansiEscapes.cursorShow);
    process.stdout.write(ansiEscapes.exitAlternativeScreen);
  };
}, []);
```

### Enable Mouse Tracking

```typescript
useEffect(() => {
  // SGR mouse mode: button tracking + extended coordinates
  process.stdout.write('\u001b[?1002h\u001b[?1006h');

  return () => {
    process.stdout.write('\u001b[?1006l\u001b[?1002l');
  };
}, []);
```

### Track Terminal Size

```typescript
const useTerminalSize = () => {
  const [size, setSize] = useState({
    columns: process.stdout.columns ?? 80,
    rows: process.stdout.rows ?? 24,
  });

  useEffect(() => {
    const handleResize = () => {
      setSize({
        columns: process.stdout.columns ?? 80,
        rows: process.stdout.rows ?? 24,
      });
    };

    process.stdout.on('resize', handleResize);
    return () => process.stdout.off('resize', handleResize);
  }, []);

  return size;
};
```

---

## Scroll Management

### Batched Scroll Hook

```typescript
export function useBatchedScroll(currentScrollTop: number) {
  const pendingScrollTopRef = useRef<number | null>(null);
  const currentScrollTopRef = useRef(currentScrollTop);

  useEffect(() => {
    currentScrollTopRef.current = currentScrollTop;
    pendingScrollTopRef.current = null;
  });

  const getScrollTop = useCallback(
    () => pendingScrollTopRef.current ?? currentScrollTopRef.current,
    []
  );

  const setPendingScrollTop = useCallback((newScrollTop: number) => {
    pendingScrollTopRef.current = newScrollTop;
  }, []);

  return { getScrollTop, setPendingScrollTop };
}
```

### Scroll State Interface

```typescript
interface ScrollState {
  scrollTop: number;
  scrollHeight: number;
  innerHeight: number;
}

const canScrollUp = (state: ScrollState): boolean => {
  return state.scrollTop > 0.001; // Epsilon for float comparison
};

const canScrollDown = (state: ScrollState): boolean => {
  return state.scrollTop < state.scrollHeight - state.innerHeight - 0.001;
};

const isAtBottom = (state: ScrollState): boolean => {
  return state.scrollTop >= state.scrollHeight - state.innerHeight - 1;
};
```

### Find Bounding Box Under Mouse

```typescript
import { getBoundingBox, type DOMElement } from 'ink';

const isMouseInside = (
  mouseCol: number,
  mouseRow: number,
  ref: React.RefObject<DOMElement>
): boolean => {
  if (!ref.current) return false;

  const box = getBoundingBox(ref.current);
  if (!box) return false;

  return (
    mouseCol >= box.x &&
    mouseCol < box.x + box.width &&
    mouseRow >= box.y &&
    mouseRow < box.y + box.height
  );
};
```

---

## Virtualized List

### Scroll Anchor

```typescript
interface ScrollAnchor {
  index: number;  // Item index
  offset: number; // Pixel offset within item
}

const SCROLL_TO_ITEM_END = Number.MAX_SAFE_INTEGER;

// Convert anchor to scrollTop
const anchorToScrollTop = (
  anchor: ScrollAnchor,
  offsets: number[],
  heights: number[],
  containerHeight: number
): number => {
  const itemOffset = offsets[anchor.index] ?? 0;

  if (anchor.offset === SCROLL_TO_ITEM_END) {
    const itemHeight = heights[anchor.index] ?? 0;
    return itemOffset + itemHeight - containerHeight;
  }

  return itemOffset + anchor.offset;
};

// Convert scrollTop to anchor
const scrollTopToAnchor = (
  scrollTop: number,
  offsets: number[]
): ScrollAnchor => {
  const index = findLastIndex(offsets, (offset) => offset <= scrollTop);

  if (index === -1) {
    return { index: 0, offset: 0 };
  }

  return { index, offset: scrollTop - offsets[index] };
};
```

### Calculate Offsets

```typescript
const calculateOffsets = (
  data: any[],
  heights: number[],
  estimatedItemHeight: (index: number) => number
): { offsets: number[]; totalHeight: number } => {
  const offsets: number[] = [0];
  let totalHeight = 0;

  for (let i = 0; i < data.length; i++) {
    const height = heights[i] ?? estimatedItemHeight(i);
    totalHeight += height;
    offsets.push(totalHeight);
  }

  return { offsets, totalHeight };
};
```

### Calculate Visible Range

```typescript
const calculateVisibleRange = (
  scrollTop: number,
  containerHeight: number,
  offsets: number[],
  dataLength: number
): { startIndex: number; endIndex: number } => {
  const startIndex = Math.max(
    0,
    findLastIndex(offsets, (offset) => offset <= scrollTop) - 1
  );

  const endIndexOffset = offsets.findIndex(
    (offset) => offset > scrollTop + containerHeight
  );

  const endIndex =
    endIndexOffset === -1
      ? dataLength - 1
      : Math.min(dataLength - 1, endIndexOffset);

  return { startIndex, endIndex };
};
```

### Measure Items

```typescript
import { measureElement, type DOMElement } from 'ink';

const measureItems = (
  itemRefs: React.MutableRefObject<Array<DOMElement | null>>,
  startIndex: number,
  endIndex: number,
  currentHeights: number[]
): number[] | null => {
  let newHeights: number[] | null = null;

  for (let i = startIndex; i <= endIndex; i++) {
    const itemRef = itemRefs.current[i];
    if (!itemRef) continue;

    const measured = Math.round(measureElement(itemRef).height);

    if (measured !== currentHeights[i]) {
      if (!newHeights) {
        newHeights = [...currentHeights];
      }
      newHeights[i] = measured;
    }
  }

  return newHeights;
};
```

---

## Mouse Handling

### Parse SGR Mouse Event

```typescript
const SGR_MOUSE_REGEX = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])/;

interface MouseEvent {
  name: 'left-press' | 'left-release' | 'scroll-up' | 'scroll-down';
  col: number;
  row: number;
  shift: boolean;
  meta: boolean;
  ctrl: boolean;
}

const parseSGRMouseEvent = (
  buffer: string
): { event: MouseEvent; length: number } | null => {
  const match = buffer.match(SGR_MOUSE_REGEX);
  if (!match) return null;

  const buttonCode = parseInt(match[1], 10);
  const col = parseInt(match[2], 10);
  const row = parseInt(match[3], 10);
  const isRelease = match[4] === 'm';

  const shift = (buttonCode & 4) !== 0;
  const meta = (buttonCode & 8) !== 0;
  const ctrl = (buttonCode & 16) !== 0;

  let name: MouseEvent['name'] | null = null;

  // Scroll events
  if ((buttonCode & 64) === 64) {
    name = (buttonCode & 1) === 0 ? 'scroll-up' : 'scroll-down';
  }
  // Button events
  else if ((buttonCode & 3) === 0) {
    name = isRelease ? 'left-release' : 'left-press';
  }

  if (!name) return null;

  return {
    event: { name, col, row, shift, meta, ctrl },
    length: match[0].length,
  };
};
```

### Mouse Context Provider

```typescript
type MouseHandler = (event: MouseEvent) => void;

const MouseContext = createContext<{
  subscribe: (handler: MouseHandler) => () => void;
} | null>(null);

export const MouseProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const handlers = useRef<Set<MouseHandler>>(new Set());

  useEffect(() => {
    process.stdout.write('\u001b[?1002h\u001b[?1006h');

    const handleData = (data: Buffer) => {
      const str = data.toString('utf8');
      const parsed = parseSGRMouseEvent(str);

      if (parsed) {
        for (const handler of handlers.current) {
          handler(parsed.event);
        }
      }
    };

    process.stdin.on('data', handleData);

    return () => {
      process.stdin.off('data', handleData);
      process.stdout.write('\u001b[?1006l\u001b[?1002l');
    };
  }, []);

  const subscribe = useCallback((handler: MouseHandler) => {
    handlers.current.add(handler);
    return () => handlers.current.delete(handler);
  }, []);

  return (
    <MouseContext.Provider value={{ subscribe }}>
      {children}
    </MouseContext.Provider>
  );
};

export const useMouse = (
  handler: MouseHandler,
  options: { isActive: boolean } = { isActive: true }
) => {
  const context = useContext(MouseContext);
  if (!context) throw new Error('useMouse must be used within MouseProvider');

  useEffect(() => {
    if (options.isActive) {
      return context.subscribe(handler);
    }
  }, [context, handler, options.isActive]);
};
```

---

## Keyboard Handling

### Simple Key Parser

```typescript
interface KeyEvent {
  name: string;
  sequence: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
}

const parseKey = (buffer: string): KeyEvent | null => {
  // Ctrl+C
  if (buffer === '\x03') {
    return { name: 'c', sequence: buffer, ctrl: true };
  }

  // Ctrl+D
  if (buffer === '\x04') {
    return { name: 'd', sequence: buffer, ctrl: true };
  }

  // Enter
  if (buffer === '\r' || buffer === '\n') {
    return { name: 'return', sequence: buffer };
  }

  // Backspace
  if (buffer === '\x7f' || buffer === '\x08') {
    return { name: 'backspace', sequence: buffer };
  }

  // Tab
  if (buffer === '\t') {
    return { name: 'tab', sequence: buffer };
  }

  // Escape
  if (buffer === '\x1b' && buffer.length === 1) {
    return { name: 'escape', sequence: buffer };
  }

  // Arrow keys
  if (buffer === '\x1b[A') return { name: 'up', sequence: buffer };
  if (buffer === '\x1b[B') return { name: 'down', sequence: buffer };
  if (buffer === '\x1b[C') return { name: 'right', sequence: buffer };
  if (buffer === '\x1b[D') return { name: 'left', sequence: buffer };

  // Home/End
  if (buffer === '\x1b[H' || buffer === '\x1b[1~') {
    return { name: 'home', sequence: buffer };
  }
  if (buffer === '\x1b[F' || buffer === '\x1b[4~') {
    return { name: 'end', sequence: buffer };
  }

  // Regular character
  if (buffer.length === 1 && buffer >= ' ') {
    return { name: buffer, sequence: buffer };
  }

  return null;
};
```

### Keypress Hook

```typescript
type KeyHandler = (key: KeyEvent) => void;

export const useKeypress = (
  handler: KeyHandler,
  options: { isActive: boolean } = { isActive: true }
) => {
  useEffect(() => {
    if (!options.isActive) return;

    const handleData = (data: Buffer) => {
      const str = data.toString('utf8');
      const key = parseKey(str);

      if (key) {
        handler(key);
      }
    };

    process.stdin.on('data', handleData);

    return () => {
      process.stdin.off('data', handleData);
    };
  }, [handler, options.isActive]);
};
```

---

## Layout Patterns

### Fixed Bottom Input Layout

```typescript
export const ChatLayout = () => {
  const { rows } = useTerminalSize();

  return (
    <Box flexDirection="column" height={rows - 1}>
      {/* Growing message area */}
      <Box flexGrow={1} flexDirection="column" overflowY="hidden">
        <MessageList messages={messages} />
      </Box>

      {/* Fixed input area */}
      <Box flexShrink={0} flexDirection="column">
        <InputPrompt onSubmit={handleSubmit} />
      </Box>
    </Box>
  );
};
```

### Responsive Width

```typescript
const isNarrow = (width: number): boolean => width < 80;

export const ResponsiveLayout = () => {
  const { columns } = useTerminalSize();
  const narrow = isNarrow(columns);

  return (
    <Box
      flexDirection={narrow ? 'column' : 'row'}
      alignItems={narrow ? 'flex-start' : 'center'}
    >
      <Box flexGrow={narrow ? 0 : 1}>Left content</Box>
      <Box flexGrow={narrow ? 0 : 1}>Right content</Box>
    </Box>
  );
};
```

### Static Content for Performance

```typescript
import { Static } from 'ink';

export const MessageHistory = ({ messages }: { messages: Message[] }) => {
  return (
    <Static items={messages}>
      {(message) => (
        <Box key={message.id}>
          <Text>{message.content}</Text>
        </Box>
      )}
    </Static>
  );
};
```

---

## Utility Functions

### findLastIndex (Array helper)

```typescript
function findLastIndex<T>(
  array: T[],
  predicate: (value: T, index: number, obj: T[]) => unknown
): number {
  for (let i = array.length - 1; i >= 0; i--) {
    if (predicate(array[i]!, i, array)) {
      return i;
    }
  }
  return -1;
}
```

### Debounce

```typescript
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);

    timeout = setTimeout(() => {
      func(...args);
    }, wait);
  };
}
```

### Throttle

```typescript
function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean = false;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}
```

### Clamp Number

```typescript
const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};
```

### Text Wrapping (ANSI-aware)

```typescript
import stripAnsi from 'strip-ansi';
import stringWidth from 'string-width';

const wrapText = (text: string, width: number): string[] => {
  const lines: string[] = [];
  const words = text.split(' ');

  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const visibleWidth = stringWidth(stripAnsi(testLine));

    if (visibleWidth <= width) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
};
```

### Graceful Exit Handler

```typescript
const useGracefulExit = (cleanup: () => void) => {
  useEffect(() => {
    const handleExit = () => {
      cleanup();
      process.exit(0);
    };

    process.on('SIGINT', handleExit);
    process.on('SIGTERM', handleExit);

    return () => {
      process.off('SIGINT', handleExit);
      process.off('SIGTERM', handleExit);
    };
  }, [cleanup]);
};
```

---

## Complete Minimal Example

```typescript
import React, { useState } from 'react';
import { render, Box, Text, Static } from 'ink';

const App = () => {
  const [messages, setMessages] = useState(['Hello, world!']);
  const [input, setInput] = useState('');

  useEffect(() => {
    process.stdin.setRawMode(true);

    const handleData = (data: Buffer) => {
      const key = data.toString('utf8');

      if (key === '\r') {
        if (input.trim()) {
          setMessages((prev) => [...prev, input]);
          setInput('');
        }
      } else if (key === '\x7f') {
        setInput((prev) => prev.slice(0, -1));
      } else if (key === '\x03') {
        process.exit(0);
      } else if (key >= ' ') {
        setInput((prev) => prev + key);
      }
    };

    process.stdin.on('data', handleData);

    return () => {
      process.stdin.off('data', handleData);
      process.stdin.setRawMode(false);
    };
  }, [input]);

  return (
    <Box flexDirection="column">
      <Static items={messages}>
        {(msg) => <Text key={msg}>{msg}</Text>}
      </Static>

      <Box>
        <Text color="blue">{'> '}</Text>
        <Text>{input}</Text>
      </Box>
    </Box>
  );
};

render(<App />);
```

---

## Usage Tips

1. **Always cleanup**: Remove event listeners, restore terminal state
2. **Use refs for non-React state**: Avoid re-renders for intermediate values
3. **Batch updates**: Group setState calls with setTimeout
4. **Measure in useLayoutEffect**: Prevents flicker
5. **Use Static for immutable content**: Huge performance win
6. **Test on resize**: Ensure layout adapts to terminal size changes
7. **Handle Ctrl+C gracefully**: Clean up before exit

## Common Gotchas

- `process.stdin.setRawMode()` returns undefined if stdin is not a TTY
- Mouse coordinates are 1-indexed, not 0-indexed
- Escape sequences can be incomplete in a single data event
- `measureElement()` returns 0 if element hasn't rendered yet
- `getBoundingBox()` returns null if ref is not set

---

Copy these snippets into your project and adapt as needed!
