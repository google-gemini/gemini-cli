# Layout Architecture Pattern

## The Goal

Create a layout with:
- **Top area**: Growing list of messages scrolling upward
- **Bottom area**: Fixed input box that stays at the bottom
- **Responsive**: Adapts to terminal resize
- **Alternate buffer mode**: Full-screen takeover like vim/less

## The Ink Flexbox Model

Ink uses **Yoga** (same layout engine as React Native) which provides flexbox-like layout.

### Key Ink Layout Props

```typescript
<Box
  flexDirection="row" | "column"    // Main axis direction
  flexGrow={1}                       // Grow to fill available space
  flexShrink={0}                     // Don't shrink below content size
  width="100%" | {number}            // Explicit width
  height="100%" | {number}           // Explicit height
  minHeight={number}                 // Minimum height
  maxHeight={number}                 // Maximum height
  overflowY="scroll" | "hidden"      // Overflow behavior
  scrollTop={number}                 // Scroll position (if overflow="scroll")
/>
```

## Core Layout Structure

**Source**: `/packages/cli/src/ui/layouts/DefaultAppLayout.tsx`

```typescript
export const DefaultAppLayout: React.FC = () => {
  const uiState = useUIState();

  return (
    <Box
      flexDirection="column"
      width={uiState.mainAreaWidth}
      height={uiState.terminalHeight - 1}  // Reserve 1 line for system
      flexShrink={0}
      flexGrow={0}
      overflow="hidden"
    >
      {/* Growing scrollable area */}
      <MainContent />

      {/* Fixed bottom area */}
      <Box flexDirection="column">
        <Notifications />
        {uiState.dialogsVisible ? (
          <DialogManager />
        ) : (
          <Composer />
        )}
        <ExitWarning />
      </Box>
    </Box>
  );
};
```

### MainContent Component

**Source**: `/packages/cli/src/ui/components/MainContent.tsx`

Two approaches depending on mode:

#### Approach 1: Static + Pending (Default)

```typescript
export const MainContent = () => {
  const historyItems = [
    <AppHeader key="app-header" />,
    ...uiState.history.map((h) => (
      <HistoryItemDisplay key={h.id} item={h} isPending={false} />
    )),
  ];

  const pendingItems = (
    <Box flexDirection="column">
      {pendingHistoryItems.map((item, i) => (
        <HistoryItemDisplay key={i} item={item} isPending={true} />
      ))}
    </Box>
  );

  return (
    <>
      {/* Ink's Static component = never re-renders */}
      <Static key={historyRemountKey} items={historyItems}>
        {(item) => item}
      </Static>
      {pendingItems}
    </>
  );
};
```

**Why Static?**: Once a message is finalized, it never changes. Using `<Static>` prevents unnecessary re-renders of old messages.

**Performance**: With 1000 messages, only the ~3 pending messages re-render on updates.

#### Approach 2: Scrollable Box (Alternate Buffer)

```typescript
return (
  <Box
    flexDirection="column"
    overflowY="scroll"
    scrollTop={Number.MAX_SAFE_INTEGER}  // Always scrolled to bottom
    maxHeight={availableTerminalHeight}
  >
    <Box flexDirection="column" flexShrink={0}>
      {historyItems}
      {pendingItems}
    </Box>
  </Box>
);
```

**Trade-off**: Simpler but re-renders more often. Used when alternate buffer is enabled.

### Composer Component (Input Area)

**Source**: `/packages/cli/src/ui/components/Composer.tsx`

```typescript
export const Composer = () => {
  return (
    <Box flexDirection="column" flexShrink={0}>
      {/* Status indicators */}
      <LoadingIndicator />
      <TodoTray />

      {/* Context summary and mode indicators */}
      <Box justifyContent="space-between">
        <ContextSummaryDisplay />
        <ShellModeIndicator />
      </Box>

      {/* Error details (expandable) */}
      {showErrorDetails && (
        <DetailedMessagesDisplay messages={consoleMessages} />
      )}

      {/* The actual input */}
      {isInputActive && (
        <InputPrompt
          buffer={buffer}
          onSubmit={handleFinalSubmit}
          // ... other props
        />
      )}

      {/* Footer */}
      <Footer />
    </Box>
  );
};
```

**Key**: Everything in Composer is `flexShrink={0}` so it doesn't shrink. MainContent grows to fill available space.

## Responsive Width Handling

```typescript
const terminalWidth = process.stdout.columns;
const isNarrow = terminalWidth < 80;

// Adjust layout for narrow terminals
<Box
  flexDirection={isNarrow ? 'column' : 'row'}
  alignItems={isNarrow ? 'flex-start' : 'center'}
>
  <ContextSummary />
  <ModeIndicators />
</Box>
```

## Terminal Size Management

```typescript
// Hook to track terminal size
export const useTerminalSize = () => {
  const [size, setSize] = useState({
    columns: process.stdout.columns,
    rows: process.stdout.rows,
  });

  useEffect(() => {
    const handleResize = () => {
      setSize({
        columns: process.stdout.columns,
        rows: process.stdout.rows,
      });
    };

    // Node.js emits 'resize' on SIGWINCH
    process.stdout.on('resize', handleResize);

    return () => {
      process.stdout.off('resize', handleResize);
    };
  }, []);

  return size;
};
```

## Alternate Buffer Mode

**What it is**: Full-screen takeover like vim, less, or top. Terminal content is preserved when exiting.

```typescript
import ansiEscapes from 'ansi-escapes';

// Enter alternate buffer
process.stdout.write(ansiEscapes.enterAlternativeScreen);

// Exit alternate buffer (on cleanup)
process.stdout.write(ansiEscapes.exitAlternativeScreen);
```

**With Ink**:

```typescript
import { render } from 'ink';

const instance = render(<App />, {
  stdout: process.stdout,
  stdin: process.stdin,
  exitOnCtrlC: false,
});

// Enter alternate buffer
process.stdout.write(ansiEscapes.enterAlternativeScreen);

// On exit
instance.waitUntilExit().then(() => {
  process.stdout.write(ansiEscapes.exitAlternativeScreen);
});
```

## Component Hierarchy

```
App
├─ SettingsContext.Provider
├─ KeypressProvider
├─ MouseProvider
├─ ScrollProvider
└─ AppContainer
   └─ DefaultAppLayout
      ├─ MainContent (flexGrow=1)
      │  ├─ Static (finalized history)
      │  │  └─ HistoryItemDisplay[]
      │  └─ Box (pending items)
      │     └─ HistoryItemDisplay[]
      │
      └─ Composer (flexShrink=0, fixed at bottom)
         ├─ LoadingIndicator
         ├─ TodoTray
         ├─ StatusRow
         │  ├─ ContextSummaryDisplay
         │  └─ ModeIndicators
         ├─ DetailedMessagesDisplay (conditional)
         ├─ InputPrompt
         └─ Footer
```

## Height Calculation Pattern

```typescript
const uiState = useUIState();

// Available height for main content
const availableHeight = useMemo(() => {
  const terminalHeight = process.stdout.rows;

  // Calculate height used by fixed bottom components
  const composerHeight = calculateComposerHeight(uiState);

  // Remaining height for scrollable content
  return Math.max(1, terminalHeight - composerHeight - 1);
}, [uiState.terminalHeight, uiState.composerState]);
```

## Context-Based State Management

Instead of prop drilling, use React Context:

```typescript
// UIStateContext.tsx
interface UIState {
  buffer: string;
  terminalWidth: number;
  terminalHeight: number;
  history: HistoryItem[];
  pendingHistoryItems: HistoryItem[];
  isInputActive: boolean;
  // ... 120+ more properties
}

const UIStateContext = createContext<UIState | null>(null);

export const useUIState = () => {
  const context = useContext(UIStateContext);
  if (!context) {
    throw new Error('useUIState must be used within UIStateProvider');
  }
  return context;
};

// Usage
const MyComponent = () => {
  const uiState = useUIState();
  return <Text>{uiState.buffer}</Text>;
};
```

**Advantage**: Components deep in the tree can access state without prop drilling.

**Disadvantage**: Any state change causes ALL consumers to re-render. Mitigate with:
1. `React.memo()` on expensive components
2. Split into multiple contexts (UIState, UIActions, SessionContext, etc.)
3. Use `useMemo()` for expensive calculations

## Measuring Components

Ink provides `measureElement` and `getBoundingBox`:

```typescript
import { measureElement, getBoundingBox } from 'ink';

const ref = useRef<DOMElement>(null);

useLayoutEffect(() => {
  if (ref.current) {
    // Get dimensions
    const { width, height } = measureElement(ref.current);

    // Get position
    const box = getBoundingBox(ref.current);
    // box: { x, y, width, height }
  }
});

return <Box ref={ref}>Content</Box>;
```

**When to measure**:
- `useLayoutEffect` - Before paint (prevents flicker)
- After ref is set
- After content changes

## Static Content Pattern

```typescript
import { Static } from 'ink';

const items = ['Item 1', 'Item 2', 'Item 3'];

return (
  <Static items={items}>
    {(item) => <Text key={item}>{item}</Text>}
  </Static>
);
```

**Behavior**:
- Items render once and never update
- New items can be appended
- Perfect for finalized chat history
- Dramatically improves performance

**When items change**:
```typescript
// Force remount by changing key
<Static key={remountKey} items={items}>
  {(item) => <Text>{item}</Text>}
</Static>
```

## Dialog/Modal Pattern

```typescript
export const DialogManager = () => {
  const uiState = useUIState();

  if (!uiState.dialogsVisible) {
    return null;
  }

  // Render dialog over the input area
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.border.default}
    >
      {uiState.currentDialog === 'settings' && <SettingsDialog />}
      {uiState.currentDialog === 'model' && <ModelDialog />}
      {uiState.currentDialog === 'theme' && <ThemeDialog />}
    </Box>
  );
};
```

Dialogs replace the `<Composer>` in the layout:

```typescript
{uiState.dialogsVisible ? (
  <DialogManager />
) : (
  <Composer />
)}
```

## Key Takeaways

1. **Flexbox layout** - Use flexDirection, flexGrow, flexShrink
2. **Static for finalized content** - Huge performance win
3. **Fixed bottom, growing top** - flexShrink=0 for input, flexGrow=1 for messages
4. **Context for state** - Avoid prop drilling
5. **Measure with useLayoutEffect** - Prevent layout flicker
6. **Alternate buffer** - Full-screen mode with ansi-escapes
7. **Responsive width** - Check terminal width, adjust layout

## Common Pitfalls

❌ **Don't**: Put everything in one giant context
✅ **Do**: Split into multiple contexts (state, actions, settings, etc.)

❌ **Don't**: Re-render finalized messages
✅ **Do**: Use `<Static>` for immutable content

❌ **Don't**: Hardcode dimensions
✅ **Do**: Use process.stdout.columns/rows and handle resize

❌ **Don't**: Use useEffect for measurements
✅ **Do**: Use useLayoutEffect

## Next Steps

Read `04-mouse-keyboard-input.md` to understand how to capture and parse terminal input events.
