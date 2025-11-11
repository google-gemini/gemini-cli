# Scroll Management Pattern

## The Core Challenge

Ink doesn't provide scroll management out of the box. You need to:
1. Track scroll position manually
2. Calculate visible viewport
3. Handle mouse wheel events
4. Implement "stick to bottom" behavior
5. Batch scroll updates to prevent flicker

## The Solution: ScrollProvider Pattern

Gemini CLI uses a **ScrollProvider** with React Context to manage all scrollable regions.

### Architecture

```
ScrollProvider (Context)
├── Registers scrollable components
├── Handles mouse wheel events
├── Routes scroll events to correct component
└── Batches scroll updates
```

### Key Concepts

#### 1. Scroll State

Every scrollable component needs three values:

```typescript
interface ScrollState {
  scrollTop: number;      // Current scroll position
  scrollHeight: number;   // Total content height
  innerHeight: number;    // Visible viewport height
}
```

#### 2. Scrollable Entry

Components register with the ScrollProvider:

```typescript
interface ScrollableEntry {
  id: string;                              // Unique identifier
  ref: React.RefObject<DOMElement>;        // Reference to the DOM element
  getScrollState: () => ScrollState;       // Get current scroll state
  scrollBy: (delta: number) => void;       // Scroll by delta lines
  hasFocus: () => boolean;                 // Is this component focused?
  flashScrollbar: () => void;              // Visual feedback on click
}
```

#### 3. Mouse Event Routing

When mouse wheel scrolls:
1. Get all registered scrollable components
2. Check which ones contain the mouse cursor (using `getBoundingBox`)
3. Check if they can scroll in that direction
4. Apply scroll to the innermost component that can scroll

**Source**: `/packages/cli/src/ui/contexts/ScrollProvider.tsx`

### Implementation Pattern

#### Step 1: Create ScrollProvider Context

```typescript
import { createContext, useContext, useCallback, useMemo } from 'react';
import { useMouse } from '../hooks/useMouse';
import { getBoundingBox } from 'ink';

interface ScrollContextType {
  register: (entry: ScrollableEntry) => void;
  unregister: (id: string) => void;
}

const ScrollContext = createContext<ScrollContextType | null>(null);

export const ScrollProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [scrollables, setScrollables] = useState(
    new Map<string, ScrollableEntry>()
  );

  const register = useCallback((entry: ScrollableEntry) => {
    setScrollables((prev) => new Map(prev).set(entry.id, entry));
  }, []);

  const unregister = useCallback((id: string) => {
    setScrollables((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  // Handle mouse wheel events
  useMouse((event) => {
    if (event.name === 'scroll-up') {
      handleScroll('up', event);
    } else if (event.name === 'scroll-down') {
      handleScroll('down', event);
    }
  }, { isActive: true });

  const contextValue = useMemo(
    () => ({ register, unregister }),
    [register, unregister]
  );

  return (
    <ScrollContext.Provider value={contextValue}>
      {children}
    </ScrollContext.Provider>
  );
};
```

#### Step 2: Find Scrollable Under Mouse

```typescript
const findScrollableCandidates = (
  mouseEvent: MouseEvent,
  scrollables: Map<string, ScrollableEntry>
) => {
  const candidates: Array<ScrollableEntry & { area: number }> = [];

  for (const entry of scrollables.values()) {
    if (!entry.ref.current || !entry.hasFocus()) {
      continue;
    }

    const boundingBox = getBoundingBox(entry.ref.current);
    if (!boundingBox) continue;

    const { x, y, width, height } = boundingBox;

    // Check if mouse is inside this component
    const isInside =
      mouseEvent.col >= x &&
      mouseEvent.col < x + width + 1 && // +1 to include scrollbar
      mouseEvent.row >= y &&
      mouseEvent.row < y + height;

    if (isInside) {
      candidates.push({ ...entry, area: width * height });
    }
  }

  // Sort by smallest area first (innermost component)
  candidates.sort((a, b) => a.area - b.area);
  return candidates;
};
```

#### Step 3: Handle Scroll with Batching

**Critical Pattern**: Batch scroll updates to prevent multiple re-renders in the same tick.

```typescript
const pendingScrollsRef = useRef(new Map<string, number>());
const flushScheduledRef = useRef(false);

const scheduleFlush = useCallback(() => {
  if (!flushScheduledRef.current) {
    flushScheduledRef.current = true;
    setTimeout(() => {
      flushScheduledRef.current = false;
      // Apply all pending scrolls at once
      for (const [id, delta] of pendingScrollsRef.current.entries()) {
        const entry = scrollablesRef.current.get(id);
        if (entry) {
          entry.scrollBy(delta);
        }
      }
      pendingScrollsRef.current.clear();
    }, 0);
  }
}, []);

const handleScroll = (direction: 'up' | 'down', mouseEvent: MouseEvent) => {
  const delta = direction === 'up' ? -1 : 1;
  const candidates = findScrollableCandidates(mouseEvent, scrollables);

  for (const candidate of candidates) {
    const { scrollTop, scrollHeight, innerHeight } = candidate.getScrollState();
    const pendingDelta = pendingScrollsRef.current.get(candidate.id) || 0;
    const effectiveScrollTop = scrollTop + pendingDelta;

    // Check if can scroll in this direction (with epsilon for float errors)
    const canScrollUp = effectiveScrollTop > 0.001;
    const canScrollDown =
      effectiveScrollTop < scrollHeight - innerHeight - 0.001;

    if ((direction === 'up' && canScrollUp) ||
        (direction === 'down' && canScrollDown)) {
      // Batch the scroll update
      pendingScrollsRef.current.set(candidate.id, pendingDelta + delta);
      scheduleFlush();
      return; // Found a component that can scroll, stop here
    }
  }
};
```

#### Step 4: useScrollable Hook

Components use this hook to register themselves:

```typescript
export const useScrollable = (
  entry: Omit<ScrollableEntry, 'id'>,
  isActive: boolean
) => {
  const context = useContext(ScrollContext);
  if (!context) {
    throw new Error('useScrollable must be used within a ScrollProvider');
  }

  const [id] = useState(() => `scrollable-${nextId++}`);

  useEffect(() => {
    if (isActive) {
      context.register({ ...entry, id });
      return () => context.unregister(id);
    }
  }, [context, entry, id, isActive]);
};
```

## Batched Scroll Updates

**Why batching matters**: Without batching, multiple scroll events in quick succession cause flicker.

### Pattern: useBatchedScroll Hook

```typescript
export function useBatchedScroll(currentScrollTop: number) {
  const pendingScrollTopRef = useRef<number | null>(null);
  const currentScrollTopRef = useRef(currentScrollTop);

  useEffect(() => {
    currentScrollTopRef.current = currentScrollTop;
    pendingScrollTopRef.current = null; // Reset after render
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

**How it works**:
1. `setPendingScrollTop` sets a pending value without triggering re-render
2. `getScrollTop` returns pending value if exists, otherwise current value
3. After render, pending value is cleared and becomes the current value

This allows multiple scroll operations in the same tick to accumulate before causing a re-render.

## Key Takeaways

1. **Context-based registration** - Scrollable components register with a provider
2. **Mouse event routing** - Route scroll events to the right component using bounding boxes
3. **Batch updates** - Accumulate scroll operations before flushing
4. **Epsilon checks** - Use small epsilon (0.001) for float comparison
5. **Smallest area wins** - Route to innermost (smallest area) scrollable component

## Common Pitfalls

❌ **Don't**: Apply scroll immediately on wheel event → causes flicker
✅ **Do**: Batch scroll updates with setTimeout

❌ **Don't**: Use exact equality (`scrollTop === max`) → float precision issues
✅ **Do**: Use epsilon (`scrollTop < max - 0.001`)

❌ **Don't**: Scroll all overlapping components
✅ **Do**: Sort by area, scroll only the innermost that can scroll

## Next Steps

Read `02-virtualized-lists.md` to understand how to efficiently render only visible items in your scrollable component.
