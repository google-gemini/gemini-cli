# Mouse & Keyboard Input Handling

## The Challenge

Terminal input is **complex**:
- Raw ANSI escape sequences for special keys
- Two mouse protocols (SGR and X11)
- Bracketed paste mode for multi-line input
- Modifier keys encoded in escape sequences
- Need to differentiate actual keys from mouse events

## Mouse Input

### Enabling Mouse Tracking

**Source**: `/packages/cli/src/ui/utils/mouse.ts`

```typescript
export function enableMouseEvents() {
  // ?1002h = button event tracking (clicks + drags + scroll wheel)
  // ?1006h = SGR extended mouse mode (better coordinate handling)
  process.stdout.write('\u001b[?1002h\u001b[?1006h');
}

export function disableMouseEvents() {
  process.stdout.write('\u001b[?1006l\u001b[?1002l');
}
```

**Call on startup**:
```typescript
useEffect(() => {
  enableMouseEvents();
  return () => disableMouseEvents();
}, []);
```

### Mouse Event Types

```typescript
export type MouseEventName =
  | 'left-press'
  | 'left-release'
  | 'right-press'
  | 'right-release'
  | 'middle-press'
  | 'middle-release'
  | 'scroll-up'
  | 'scroll-down'
  | 'scroll-left'
  | 'scroll-right'
  | 'move';

export interface MouseEvent {
  name: MouseEventName;
  col: number;        // 1-indexed column
  row: number;        // 1-indexed row
  shift: boolean;     // Shift key held
  meta: boolean;      // Alt/Option key held
  ctrl: boolean;      // Ctrl key held
}
```

### SGR Mouse Protocol

**Format**: `\x1b[<button;col;row;M` (press) or `m` (release)

Example: `\x1b[<0;42;15M` = left click at column 42, row 15

```typescript
const SGR_MOUSE_REGEX = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])/;

export function parseSGRMouseEvent(
  buffer: string
): { event: MouseEvent; length: number } | null {
  const match = buffer.match(SGR_MOUSE_REGEX);
  if (!match) return null;

  const buttonCode = parseInt(match[1], 10);
  const col = parseInt(match[2], 10);
  const row = parseInt(match[3], 10);
  const action = match[4];
  const isRelease = action === 'm';

  // Decode modifiers from button code
  const shift = (buttonCode & 4) !== 0;
  const meta = (buttonCode & 8) !== 0;
  const ctrl = (buttonCode & 16) !== 0;

  // Decode button/scroll from button code
  const name = getMouseEventName(buttonCode, isRelease);

  return {
    event: { name, col, row, shift, meta, ctrl },
    length: match[0].length,
  };
}
```

### Decoding Button Code

```typescript
export function getMouseEventName(
  buttonCode: number,
  isRelease: boolean
): MouseEventName | null {
  // Scroll events
  if (buttonCode === 66) return 'scroll-left';
  if (buttonCode === 67) return 'scroll-right';
  if ((buttonCode & 64) === 64) {
    return (buttonCode & 1) === 0 ? 'scroll-up' : 'scroll-down';
  }

  // Move events
  const isMove = (buttonCode & 32) !== 0;
  if (isMove) return 'move';

  // Button events
  const button = buttonCode & 3;
  const type = isRelease ? 'release' : 'press';
  switch (button) {
    case 0: return `left-${type}`;
    case 1: return `middle-${type}`;
    case 2: return `right-${type}`;
    default: return null;
  }
}
```

### X11 Mouse Protocol (Fallback)

**Format**: `\x1b[M<byte><byte><byte>`

Three bytes encode: button code, column, row (each as char code + 32)

```typescript
const X11_MOUSE_REGEX = /^\x1b\[M(.{3})/;

export function parseX11MouseEvent(
  buffer: string
): { event: MouseEvent; length: number } | null {
  const match = buffer.match(X11_MOUSE_REGEX);
  if (!match) return null;

  const b = match[1].charCodeAt(0) - 32;
  const col = match[1].charCodeAt(1) - 32;
  const row = match[1].charCodeAt(2) - 32;

  // Decode same as SGR
  const shift = (b & 4) !== 0;
  const meta = (b & 8) !== 0;
  const ctrl = (b & 16) !== 0;

  // ... decode button/scroll ...

  return { event: { name, col, row, shift, meta, ctrl }, length: 4 };
}
```

### Using Mouse Events

```typescript
import { useMouse } from '../hooks/useMouse';

export const MyComponent = () => {
  useMouse((event: MouseEvent) => {
    if (event.name === 'scroll-up') {
      scrollUp();
    } else if (event.name === 'scroll-down') {
      scrollDown();
    } else if (event.name === 'left-press') {
      handleClick(event.col, event.row);
    }
  }, { isActive: true });

  return <Box>...</Box>;
};
```

## Keyboard Input

### Raw Mode

Enable raw mode to receive input character-by-character:

```typescript
useEffect(() => {
  process.stdin.setRawMode(true);
  process.stdin.resume();

  return () => {
    process.stdin.setRawMode(false);
    process.stdin.pause();
  };
}, []);
```

**Raw mode**: Input is NOT line-buffered, special keys send escape sequences

### Reading Input

```typescript
useEffect(() => {
  const handleData = (data: Buffer) => {
    const str = data.toString('utf8');
    parseInput(str);
  };

  process.stdin.on('data', handleData);

  return () => {
    process.stdin.off('data', handleData);
  };
}, []);
```

### Common Escape Sequences

| Key | Sequence | Hex |
|-----|----------|-----|
| Arrow Up | `\x1b[A` | ESC [ A |
| Arrow Down | `\x1b[B` | ESC [ B |
| Arrow Right | `\x1b[C` | ESC [ C |
| Arrow Left | `\x1b[D` | ESC [ D |
| Home | `\x1b[H` or `\x1b[1~` | |
| End | `\x1b[F` or `\x1b[4~` | |
| Page Up | `\x1b[5~` | |
| Page Down | `\x1b[6~` | |
| Delete | `\x1b[3~` | |
| F1 | `\x1bOP` | |
| F2 | `\x1bOQ` | |
| Ctrl+C | `\x03` | |
| Ctrl+D | `\x04` | |
| Enter | `\r` or `\n` | |
| Backspace | `\x7f` or `\x08` | |
| Tab | `\t` | |
| Escape | `\x1b` | |

### Parsing Keyboard Input

**Challenge**: A single `data` event might contain:
- Multiple keys: `"abc"`
- Partial escape sequence: `"\x1b["` (incomplete arrow key)
- Mouse event mixed with key: `"\x1b[<0;10;10Mabc"`

**Solution**: Use a generator-based parser with buffering.

```typescript
function* parseKeys(buffer: string): Generator<Key> {
  let i = 0;

  while (i < buffer.length) {
    // Check for mouse events first
    const mouseEvent = parseMouseEvent(buffer.slice(i));
    if (mouseEvent) {
      i += mouseEvent.length;
      continue; // Skip mouse events in key parsing
    }

    // Check for escape sequences
    if (buffer[i] === '\x1b') {
      const escapeSeq = parseEscapeSequence(buffer.slice(i));
      if (escapeSeq) {
        yield escapeSeq.key;
        i += escapeSeq.length;
        continue;
      }

      // Incomplete escape sequence, need more data
      if (i === buffer.length - 1) {
        return; // Wait for more input
      }
    }

    // Regular character
    yield { name: buffer[i], sequence: buffer[i] };
    i++;
  }
}
```

### Handling Modifiers

Modifiers are encoded in escape sequences:

```typescript
// Ctrl+Arrow: \x1b[1;5A (up), \x1b[1;5B (down), etc.
// Shift+Arrow: \x1b[1;2A (up), \x1b[1;2B (down), etc.
// Alt+Arrow: \x1b[1;3A (up), \x1b[1;3B (down), etc.

const MODIFIER_REGEX = /^\x1b\[1;(\d+)([A-Z])/;

function parseModifiedKey(buffer: string): Key | null {
  const match = buffer.match(MODIFIER_REGEX);
  if (!match) return null;

  const modifierCode = parseInt(match[1], 10);
  const keyChar = match[2];

  const key: Key = {
    name: getKeyName(keyChar),
    sequence: match[0],
    shift: (modifierCode & 1) !== 0,
    alt: (modifierCode & 2) !== 0,
    ctrl: (modifierCode & 4) !== 0,
    meta: (modifierCode & 8) !== 0,
  };

  return key;
}
```

### Bracketed Paste Mode

**What it is**: Multi-line pastes are wrapped in special sequences to distinguish from typing.

```typescript
// Enable bracketed paste
process.stdout.write('\x1b[?2004h');

// Input format:
// \x1b[200~ ... pasted text ... \x1b[201~
```

**Parsing**:
```typescript
const PASTE_START = '\x1b[200~';
const PASTE_END = '\x1b[201~';

let isPasting = false;
let pasteBuffer = '';

function handleInput(data: string) {
  if (data.includes(PASTE_START)) {
    isPasting = true;
    pasteBuffer = '';
    data = data.slice(data.indexOf(PASTE_START) + PASTE_START.length);
  }

  if (isPasting) {
    if (data.includes(PASTE_END)) {
      const endIndex = data.indexOf(PASTE_END);
      pasteBuffer += data.slice(0, endIndex);
      handlePaste(pasteBuffer);
      isPasting = false;
      pasteBuffer = '';
      data = data.slice(endIndex + PASTE_END.length);
    } else {
      pasteBuffer += data;
      return;
    }
  }

  // Process remaining data as normal input
  parseKeys(data);
}
```

### Kitty Keyboard Protocol

**What it is**: Enhanced keyboard protocol for better key detection.

**Detection**:
```typescript
// Query support
process.stdout.write('\x1b[?u');

// Response: \x1b[?{flags}u if supported

const KITTY_RESPONSE_REGEX = /^\x1b\[\?(\d+)u/;

function detectKittyProtocol(): Promise<boolean> {
  return new Promise((resolve) => {
    const handleData = (data: Buffer) => {
      const str = data.toString('utf8');
      if (KITTY_RESPONSE_REGEX.test(str)) {
        resolve(true);
      }
    };

    process.stdin.once('data', handleData);

    setTimeout(() => {
      process.stdin.off('data', handleData);
      resolve(false);
    }, 100);
  });
}
```

**Enable**:
```typescript
// Push enhanced mode
process.stdout.write('\x1b[>1u');

// Pop on exit
process.stdout.write('\x1b[<1u');
```

## Input Event Management with Context

### KeypressContext Pattern

```typescript
interface KeyEvent {
  name: string;
  sequence: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
}

type KeyHandler = (key: KeyEvent) => void;

const KeypressContext = createContext<{
  subscribe: (handler: KeyHandler) => () => void;
} | null>(null);

export const KeypressProvider: React.FC<{ children: ReactNode }> = ({
  children
}) => {
  const handlers = useRef<Set<KeyHandler>>(new Set());

  useEffect(() => {
    process.stdin.setRawMode(true);
    process.stdin.resume();

    const handleData = (data: Buffer) => {
      const str = data.toString('utf8');
      for (const key of parseKeys(str)) {
        // Notify all subscribers
        for (const handler of handlers.current) {
          handler(key);
        }
      }
    };

    process.stdin.on('data', handleData);

    return () => {
      process.stdin.off('data', handleData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    };
  }, []);

  const subscribe = useCallback((handler: KeyHandler) => {
    handlers.current.add(handler);
    return () => handlers.current.delete(handler);
  }, []);

  return (
    <KeypressContext.Provider value={{ subscribe }}>
      {children}
    </KeypressContext.Provider>
  );
};
```

### useKeypress Hook

```typescript
export const useKeypress = (
  handler: KeyHandler,
  options: { isActive: boolean } = { isActive: true }
) => {
  const context = useContext(KeypressContext);
  if (!context) {
    throw new Error('useKeypress must be used within KeypressProvider');
  }

  useEffect(() => {
    if (options.isActive) {
      return context.subscribe(handler);
    }
  }, [context, handler, options.isActive]);
};
```

### Usage in Components

```typescript
export const InputPrompt = () => {
  const [buffer, setBuffer] = useState('');
  const [cursorPos, setCursorPos] = useState(0);

  useKeypress((key) => {
    if (key.name === 'return') {
      handleSubmit(buffer);
      setBuffer('');
      setCursorPos(0);
    } else if (key.name === 'backspace') {
      setBuffer(buffer.slice(0, cursorPos - 1) + buffer.slice(cursorPos));
      setCursorPos(Math.max(0, cursorPos - 1));
    } else if (key.name === 'left') {
      setCursorPos(Math.max(0, cursorPos - 1));
    } else if (key.name === 'right') {
      setCursorPos(Math.min(buffer.length, cursorPos + 1));
    } else if (key.sequence.length === 1 && !key.ctrl && !key.meta) {
      // Regular character
      setBuffer(buffer.slice(0, cursorPos) + key.sequence + buffer.slice(cursorPos));
      setCursorPos(cursorPos + 1);
    }
  }, { isActive: true });

  return <Text>{buffer}</Text>;
};
```

## Key Takeaways

1. **Enable mouse tracking** - Use SGR protocol (better than X11)
2. **Raw mode for keyboard** - Get character-by-character input
3. **Parse escape sequences** - Use generator-based parser
4. **Bracketed paste mode** - Handle multi-line pastes correctly
5. **Context + hooks pattern** - Centralized input management
6. **Handle incomplete sequences** - Buffer partial escape sequences
7. **Filter mouse from keyboard** - Parse mouse events before keys

## Common Pitfalls

❌ **Don't**: Parse input as single characters
✅ **Do**: Handle multi-byte escape sequences

❌ **Don't**: Forget to restore terminal on exit
✅ **Do**: Disable raw mode, mouse tracking in cleanup

❌ **Don't**: Block on stdin reads
✅ **Do**: Use event-based 'data' listener

❌ **Don't**: Assume one key per data event
✅ **Do**: Use generator to yield multiple keys

## Next Steps

Read `05-complete-implementation-guide.md` for a step-by-step guide to building a complete AI CLI UI.
