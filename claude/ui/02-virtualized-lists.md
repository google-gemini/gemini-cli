# Virtualized List Pattern

## The Problem

Rendering 1000+ chat messages with syntax highlighting, ANSI colors, and complex formatting will **kill performance**. React + Ink will try to render every single item, causing:
- Slow rendering (seconds of lag)
- High memory usage
- Sluggish scrolling
- Terminal flickering

## The Solution: Virtual Lists

**Only render what's visible** in the viewport. If you have 1000 messages but only 30 fit on screen, render only those 30 (plus a small buffer).

This is the **same pattern** used by:
- React Virtual
- react-window
- TanStack Virtual
- Mobile list views (iOS/Android)

## Implementation: VirtualizedList Component

**Source**: `/packages/cli/src/ui/components/shared/VirtualizedList.tsx` (500 lines)

### Core Concepts

#### 1. Scroll Anchor

Instead of tracking pixel-based `scrollTop`, track **which item** and **offset within item**:

```typescript
interface ScrollAnchor {
  index: number;    // Which item is at the top of viewport
  offset: number;   // Pixel offset within that item
}
```

**Why**: When items change height (e.g., streaming text updates), pixel-based scrolling breaks. Anchor-based scrolling maintains position relative to content.

#### 2. Height Estimation

```typescript
interface VirtualizedListProps<T> {
  data: T[];
  estimatedItemHeight: (index: number) => number;  // Estimate before measuring
  // ... other props
}
```

**Flow**:
1. Start with estimated heights
2. Render items in viewport
3. Measure actual heights with `measureElement()`
4. Update heights array
5. Recalculate layout

#### 3. Offset Calculation

```typescript
const { totalHeight, offsets } = useMemo(() => {
  const offsets: number[] = [0];
  let totalHeight = 0;

  for (let i = 0; i < data.length; i++) {
    const height = heights[i] ?? estimatedItemHeight(i);
    totalHeight += height;
    offsets.push(totalHeight);
  }

  return { totalHeight, offsets };
}, [heights, data, estimatedItemHeight]);
```

`offsets[i]` = pixel position where item `i` starts

#### 4. Visible Range Calculation

```typescript
// Find first visible item
const startIndex = Math.max(
  0,
  findLastIndex(offsets, (offset) => offset <= scrollTop) - 1
);

// Find last visible item
const endIndexOffset = offsets.findIndex(
  (offset) => offset > scrollTop + containerHeight
);
const endIndex = endIndexOffset === -1
  ? data.length - 1
  : Math.min(data.length - 1, endIndexOffset);
```

**With overscan**: Render `startIndex - 1` to `endIndex + 1` to reduce flicker during scrolling.

#### 5. Spacers for Non-Rendered Items

```typescript
const topSpacerHeight = offsets[startIndex] ?? 0;
const bottomSpacerHeight = totalHeight - (offsets[endIndex + 1] ?? totalHeight);

return (
  <Box flexDirection="column">
    <Box height={topSpacerHeight} flexShrink={0} />
    {renderedItems}
    <Box height={bottomSpacerHeight} flexShrink={0} />
  </Box>
);
```

This maintains correct scrollbar position and total content height.

### Complete Implementation

```typescript
export const VirtualizedList = forwardRef(<T,>(
  props: VirtualizedListProps<T>,
  ref: React.Ref<VirtualizedListRef<T>>
) => {
  const {
    data,
    renderItem,
    estimatedItemHeight,
    keyExtractor,
    initialScrollIndex,
    initialScrollOffsetInIndex,
  } = props;

  // State
  const [scrollAnchor, setScrollAnchor] = useState(() => ({
    index: initialScrollIndex ?? 0,
    offset: initialScrollOffsetInIndex ?? 0,
  }));
  const [isStickingToBottom, setIsStickingToBottom] = useState(false);
  const [heights, setHeights] = useState<number[]>([]);
  const [containerHeight, setContainerHeight] = useState(0);

  const containerRef = useRef<DOMElement>(null);
  const itemRefs = useRef<Array<DOMElement | null>>([]);

  // Calculate offsets and total height
  const { totalHeight, offsets } = useMemo(() => {
    const offsets: number[] = [0];
    let totalHeight = 0;
    for (let i = 0; i < data.length; i++) {
      const height = heights[i] ?? estimatedItemHeight(i);
      totalHeight += height;
      offsets.push(totalHeight);
    }
    return { totalHeight, offsets };
  }, [heights, data, estimatedItemHeight]);

  // Convert scroll anchor to scrollTop
  const scrollTop = useMemo(() => {
    const offset = offsets[scrollAnchor.index] ?? 0;
    return offset + scrollAnchor.offset;
  }, [scrollAnchor, offsets]);

  // Calculate visible range
  const startIndex = Math.max(
    0,
    findLastIndex(offsets, (offset) => offset <= scrollTop) - 1
  );
  const endIndexOffset = offsets.findIndex(
    (offset) => offset > scrollTop + containerHeight
  );
  const endIndex = endIndexOffset === -1
    ? data.length - 1
    : Math.min(data.length - 1, endIndexOffset);

  // Measure rendered items
  useLayoutEffect(() => {
    // Measure container
    if (containerRef.current) {
      const height = Math.round(measureElement(containerRef.current).height);
      if (containerHeight !== height) {
        setContainerHeight(height);
      }
    }

    // Measure items
    let newHeights: number[] | null = null;
    for (let i = startIndex; i <= endIndex; i++) {
      const itemRef = itemRefs.current[i];
      if (itemRef) {
        const height = Math.round(measureElement(itemRef).height);
        if (height !== heights[i]) {
          if (!newHeights) {
            newHeights = [...heights];
          }
          newHeights[i] = height;
        }
      }
    }
    if (newHeights) {
      setHeights(newHeights);
    }
  });

  // Render items with spacers
  const topSpacerHeight = offsets[startIndex] ?? 0;
  const bottomSpacerHeight = totalHeight - (offsets[endIndex + 1] ?? totalHeight);

  const renderedItems = [];
  for (let i = startIndex; i <= endIndex; i++) {
    const item = data[i];
    if (item) {
      renderedItems.push(
        <Box
          key={keyExtractor(item, i)}
          width="100%"
          ref={(el) => { itemRefs.current[i] = el; }}
        >
          {renderItem({ item, index: i })}
        </Box>
      );
    }
  }

  return (
    <Box
      ref={containerRef}
      overflowY="scroll"
      scrollTop={scrollTop}
      width="100%"
      height="100%"
      flexDirection="column"
    >
      <Box flexShrink={0} width="100%" flexDirection="column">
        <Box height={topSpacerHeight} flexShrink={0} />
        {renderedItems}
        <Box height={bottomSpacerHeight} flexShrink={0} />
      </Box>
    </Box>
  );
});
```

### Exposed Methods via Ref

```typescript
useImperativeHandle(ref, () => ({
  scrollBy: (delta: number) => { /* ... */ },
  scrollTo: (offset: number) => { /* ... */ },
  scrollToEnd: () => { /* ... */ },
  scrollToIndex: ({ index, viewOffset, viewPosition }) => { /* ... */ },
  scrollToItem: ({ item, viewOffset, viewPosition }) => { /* ... */ },
  getScrollIndex: () => scrollAnchor.index,
  getScrollState: () => ({
    scrollTop,
    scrollHeight: totalHeight,
    innerHeight: containerHeight,
  }),
}));
```

## Stick-to-Bottom Behavior

**Critical for chat UIs**: Auto-scroll to bottom when new messages arrive, BUT only if user was already at the bottom.

```typescript
const [isStickingToBottom, setIsStickingToBottom] = useState(false);

useLayoutEffect(() => {
  const wasAtBottom =
    scrollTop >= totalHeight - containerHeight - 1; // Epsilon check

  // If user scrolled back to bottom, enable sticking
  if (wasAtBottom && scrollTop >= prevScrollTop.current) {
    setIsStickingToBottom(true);
  }

  const listGrew = data.length > prevDataLength.current;

  // Auto-scroll if list grew AND we're sticking
  if (listGrew && isStickingToBottom) {
    setScrollAnchor({
      index: data.length - 1,
      offset: SCROLL_TO_ITEM_END, // Special constant: Number.MAX_SAFE_INTEGER
    });
  }

  // Update refs for next cycle
  prevDataLength.current = data.length;
  prevScrollTop.current = scrollTop;
}, [data.length, scrollTop, totalHeight, containerHeight]);
```

**Key insight**: `SCROLL_TO_ITEM_END` is a special offset value that means "scroll to bottom of this item" rather than "scroll to top of this item".

## Performance Characteristics

| Scenario | Without Virtualization | With Virtualization |
|----------|----------------------|---------------------|
| 100 messages | Fast (~50ms) | Fast (~50ms) |
| 1,000 messages | Slow (~500ms) | Fast (~50ms) |
| 10,000 messages | Unusable (~5s+) | Fast (~50ms) |

**Memory usage**: Only stores DOM for ~30-50 items regardless of total count.

## Common Pitfalls

❌ **Don't**: Use pixel-based scrollTop exclusively
✅ **Do**: Use scroll anchor (index + offset)

❌ **Don't**: Measure all items upfront
✅ **Do**: Estimate, then measure on-demand

❌ **Don't**: Forget spacers
✅ **Do**: Add top/bottom spacers for non-rendered items

❌ **Don't**: Auto-scroll when user is reading history
✅ **Do**: Only auto-scroll if user was already at bottom

❌ **Don't**: Use `useEffect` for measurements
✅ **Do**: Use `useLayoutEffect` to measure before paint

## Edge Cases Handled

### 1. Dynamic Item Heights

When streaming text updates, item heights change:

```typescript
// Store measured heights
const [heights, setHeights] = useState<number[]>([]);

// Re-measure on every render (only visible items)
useLayoutEffect(() => {
  for (let i = startIndex; i <= endIndex; i++) {
    const measured = measureElement(itemRefs.current[i]);
    if (measured.height !== heights[i]) {
      updateHeight(i, measured.height);
    }
  }
});
```

### 2. List Shrinks

```typescript
// If scroll position becomes invalid after list shrinks
if (scrollAnchor.index >= data.length && data.length > 0) {
  const newScrollTop = Math.max(0, totalHeight - containerHeight);
  setScrollAnchor(getAnchorForScrollTop(newScrollTop));
}
```

### 3. Container Resize

```typescript
useLayoutEffect(() => {
  const newHeight = measureElement(containerRef.current).height;
  if (newHeight !== containerHeight) {
    setContainerHeight(newHeight);
    // If sticking to bottom, re-scroll to bottom with new container size
    if (isStickingToBottom) {
      scrollToEnd();
    }
  }
});
```

### 4. Initial Scroll Position

```typescript
const [scrollAnchor, setScrollAnchor] = useState(() => {
  const scrollToEnd =
    initialScrollIndex === SCROLL_TO_ITEM_END ||
    (initialScrollIndex >= data.length - 1 &&
     initialScrollOffsetInIndex === SCROLL_TO_ITEM_END);

  if (scrollToEnd) {
    return {
      index: data.length > 0 ? data.length - 1 : 0,
      offset: SCROLL_TO_ITEM_END,
    };
  }

  return {
    index: initialScrollIndex ?? 0,
    offset: initialScrollOffsetInIndex ?? 0,
  };
});
```

## Integration with ScrollProvider

```typescript
// In your scrollable component
const listRef = useRef<VirtualizedListRef<Message>>(null);

useScrollable({
  ref: containerRef,
  getScrollState: () => listRef.current?.getScrollState() ?? defaultState,
  scrollBy: (delta) => listRef.current?.scrollBy(delta),
  hasFocus: () => true,
  flashScrollbar: () => { /* visual feedback */ },
}, isActive);

return (
  <VirtualizedList
    ref={listRef}
    data={messages}
    renderItem={renderMessage}
    estimatedItemHeight={(i) => 10} // rough estimate
    keyExtractor={(msg, i) => msg.id}
    initialScrollIndex={SCROLL_TO_ITEM_END}
  />
);
```

## Key Takeaways

1. **Anchor-based scrolling** - Track item index + offset, not just pixels
2. **Estimate then measure** - Start with estimates, measure actual heights
3. **Spacers maintain scroll** - Use Box components for non-rendered space
4. **Stick-to-bottom flag** - Track whether user wants auto-scroll
5. **useLayoutEffect for measurement** - Measure before paint to prevent flicker

## Next Steps

Read `03-layout-architecture.md` to understand how the virtualized list fits into the overall component structure.
