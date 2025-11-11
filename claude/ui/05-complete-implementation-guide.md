# Complete Implementation Guide

## Building an AI CLI UI from Scratch

This guide walks through building a production-quality scrolling chat UI with Ink, step-by-step.

## Prerequisites

```bash
npm install ink@^6.4.0 react@^19.0.0
npm install --save-dev @types/react @types/node typescript
```

## Step 1: Project Setup

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "lib": ["ES2022"],
    "jsx": "react",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  }
}
```

### package.json scripts

```json
{
  "scripts": {
    "dev": "tsx src/index.tsx",
    "build": "tsc"
  },
  "type": "module"
}
```

## Step 2: Basic App Structure

### src/index.tsx

```tsx
#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { App } from './App.js';

render(<App />);
```

### src/App.tsx

```tsx
import React from 'react';
import { Box } from 'ink';

export const App = () => {
  return (
    <Box flexDirection="column">
      <Box>Hello, AI CLI!</Box>
    </Box>
  );
};
```

Test: `npm run dev` should show "Hello, AI CLI!"

## Step 3: Add Input Providers

### src/contexts/KeypressContext.tsx

```tsx
import React, { createContext, useContext, useEffect, useRef, useCallback } from 'react';

export interface KeyEvent {
  name: string;
  sequence: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
}

type KeyHandler = (key: KeyEvent) => void;

interface KeypressContextType {
  subscribe: (handler: KeyHandler) => () => void;
}

const KeypressContext = createContext<KeypressContextType | null>(null);

export const KeypressProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const handlers = useRef<Set<KeyHandler>>(new Set());

  useEffect(() => {
    if (!process.stdin.setRawMode) {
      console.error('stdin is not a TTY');
      return;
    }

    process.stdin.setRawMode(true);
    process.stdin.resume();

    const handleData = (data: Buffer) => {
      const str = data.toString('utf8');

      // Simple parser for this example
      const key: KeyEvent = {
        name: str === '\r' ? 'return' : str === '\x7f' ? 'backspace' : str,
        sequence: str,
        ctrl: str.charCodeAt(0) < 32,
      };

      for (const handler of handlers.current) {
        handler(key);
      }
    };

    process.stdin.on('data', handleData);

    return () => {
      process.stdin.off('data', handleData);
      if (process.stdin.setRawMode) {
        process.stdin.setRawMode(false);
      }
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

### src/contexts/MouseContext.tsx

```tsx
import React, { createContext, useContext, useEffect, useRef, useCallback } from 'react';

export interface MouseEvent {
  name: 'left-press' | 'left-release' | 'scroll-up' | 'scroll-down';
  col: number;
  row: number;
}

type MouseHandler = (event: MouseEvent) => void;

interface MouseContextType {
  subscribe: (handler: MouseHandler) => () => void;
}

const MouseContext = createContext<MouseContextType | null>(null);

export const MouseProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const handlers = useRef<Set<MouseHandler>>(new Set());

  useEffect(() => {
    // Enable SGR mouse tracking
    process.stdout.write('\u001b[?1002h\u001b[?1006h');

    const handleData = (data: Buffer) => {
      const str = data.toString('utf8');

      // Simple SGR parser
      const sgrMatch = str.match(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/);
      if (sgrMatch) {
        const buttonCode = parseInt(sgrMatch[1], 10);
        const col = parseInt(sgrMatch[2], 10);
        const row = parseInt(sgrMatch[3], 10);
        const isRelease = sgrMatch[4] === 'm';

        let name: MouseEvent['name'] | null = null;

        if ((buttonCode & 64) === 64) {
          name = (buttonCode & 1) === 0 ? 'scroll-up' : 'scroll-down';
        } else if (!isRelease && (buttonCode & 3) === 0) {
          name = 'left-press';
        } else if (isRelease && (buttonCode & 3) === 0) {
          name = 'left-release';
        }

        if (name) {
          const event: MouseEvent = { name, col, row };
          for (const handler of handlers.current) {
            handler(event);
          }
        }
      }
    };

    process.stdin.on('data', handleData);

    return () => {
      process.stdin.off('data', handleData);
      // Disable mouse tracking
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
  if (!context) {
    throw new Error('useMouse must be used within MouseProvider');
  }

  useEffect(() => {
    if (options.isActive) {
      return context.subscribe(handler);
    }
  }, [context, handler, options.isActive]);
};
```

## Step 4: Create Message List Component

### src/types.ts

```tsx
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}
```

### src/components/MessageList.tsx

```tsx
import React from 'react';
import { Box, Text, Static } from 'ink';
import { Message } from '../types.js';

interface MessageListProps {
  messages: Message[];
}

export const MessageList: React.FC<MessageListProps> = ({ messages }) => {
  return (
    <Static items={messages}>
      {(message) => (
        <Box key={message.id} flexDirection="column" marginBottom={1}>
          <Text bold color={message.role === 'user' ? 'cyan' : 'green'}>
            {message.role === 'user' ? 'You' : 'Assistant'}:
          </Text>
          <Text>{message.content}</Text>
        </Box>
      )}
    </Static>
  );
};
```

## Step 5: Create Input Component

### src/components/InputPrompt.tsx

```tsx
import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { useKeypress } from '../contexts/KeypressContext.js';

interface InputPromptProps {
  onSubmit: (text: string) => void;
}

export const InputPrompt: React.FC<InputPromptProps> = ({ onSubmit }) => {
  const [buffer, setBuffer] = useState('');

  useKeypress((key) => {
    if (key.name === 'return' && buffer.trim()) {
      onSubmit(buffer);
      setBuffer('');
    } else if (key.name === 'backspace') {
      setBuffer((prev) => prev.slice(0, -1));
    } else if (key.sequence.length === 1 && !key.ctrl && !key.meta) {
      setBuffer((prev) => prev + key.sequence);
    } else if (key.ctrl && key.name === 'c') {
      process.exit(0);
    }
  }, { isActive: true });

  return (
    <Box flexDirection="column">
      <Box>
        <Text color="blue">{'> '}</Text>
        <Text>{buffer}</Text>
        <Text color="gray">█</Text>
      </Box>
      <Text dimColor>Press Ctrl+C to exit</Text>
    </Box>
  );
};
```

## Step 6: Assemble Main App

### src/App.tsx (updated)

```tsx
import React, { useState } from 'react';
import { Box } from 'ink';
import { KeypressProvider } from './contexts/KeypressContext.js';
import { MouseProvider } from './contexts/MouseContext.js';
import { MessageList } from './components/MessageList.js';
import { InputPrompt } from './components/InputPrompt.js';
import { Message } from './types.js';

export const App = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Hello! How can I help you today?',
      timestamp: new Date(),
    },
  ]);

  const handleSubmit = async (text: string) => {
    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);

    // Simulate AI response
    setTimeout(() => {
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `You said: "${text}"`,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, aiMessage]);
    }, 500);
  };

  return (
    <KeypressProvider>
      <MouseProvider>
        <Box flexDirection="column" height={process.stdout.rows - 1}>
          {/* Growing message area */}
          <Box flexGrow={1} flexDirection="column">
            <MessageList messages={messages} />
          </Box>

          {/* Fixed input area */}
          <Box flexShrink={0} flexDirection="column" borderStyle="single" borderTop>
            <InputPrompt onSubmit={handleSubmit} />
          </Box>
        </Box>
      </MouseProvider>
    </KeypressProvider>
  );
};
```

Test: You should now have a working chat interface!

## Step 7: Add Virtualized Scrolling

Create `src/components/VirtualizedMessageList.tsx` based on the pattern in `02-virtualized-lists.md`.

**Key changes**:
1. Estimate message height: ~3 lines per message
2. Use `VirtualizedList` instead of `Static`
3. Expose scroll methods via ref
4. Auto-scroll to bottom on new messages

## Step 8: Add Scroll Management

Create `src/contexts/ScrollProvider.tsx` based on the pattern in `01-scroll-management.md`.

**Integration**:
1. Wrap app in `<ScrollProvider>`
2. Register `VirtualizedMessageList` with `useScrollable`
3. Handle mouse wheel events

## Step 9: Add Alternate Buffer Mode

```tsx
import ansiEscapes from 'ansi-escapes';

useEffect(() => {
  process.stdout.write(ansiEscapes.enterAlternativeScreen);

  return () => {
    process.stdout.write(ansiEscapes.exitAlternativeScreen);
  };
}, []);
```

## Step 10: Handle Terminal Resize

```tsx
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

  process.stdout.on('resize', handleResize);

  return () => {
    process.stdout.off('resize', handleResize);
  };
}, []);
```

## Step 11: Add Syntax Highlighting

```bash
npm install highlight.js marked
```

```tsx
import { marked } from 'marked';
import hljs from 'highlight.js';

const renderMarkdown = (content: string) => {
  const tokens = marked.lexer(content);

  return tokens.map((token) => {
    if (token.type === 'code') {
      const highlighted = hljs.highlight(token.text, {
        language: token.lang || 'plaintext',
      });

      // Convert ANSI colors to Ink components
      return <CodeBlock code={highlighted.value} />;
    }

    return <Text>{token.raw}</Text>;
  });
};
```

## Step 12: Add Streaming Support

```tsx
const [streamingContent, setStreamingContent] = useState('');

const handleStreamingResponse = async (text: string) => {
  setStreamingContent('');

  // Simulate streaming
  const words = text.split(' ');

  for (const word of words) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    setStreamingContent((prev) => prev + word + ' ');
  }

  // Finalize message
  const finalMessage: Message = {
    id: Date.now().toString(),
    role: 'assistant',
    content: streamingContent,
    timestamp: new Date(),
  };

  setMessages((prev) => [...prev, finalMessage]);
  setStreamingContent('');
};
```

## Step 13: Production Hardening

### Error Boundaries

```tsx
class ErrorBoundary extends React.Component {
  componentDidCatch(error: Error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }

  render() {
    return this.props.children;
  }
}
```

### Graceful Exit

```tsx
useEffect(() => {
  const handleExit = () => {
    // Cleanup: restore terminal, close connections
    process.stdout.write(ansiEscapes.exitAlternativeScreen);
    process.exit(0);
  };

  process.on('SIGINT', handleExit);
  process.on('SIGTERM', handleExit);

  return () => {
    process.off('SIGINT', handleExit);
    process.off('SIGTERM', handleExit);
  };
}, []);
```

### Performance Monitoring

```tsx
useEffect(() => {
  const start = Date.now();

  return () => {
    const duration = Date.now() - start;
    if (duration > 100) {
      console.warn(`Slow render: ${duration}ms`);
    }
  };
});
```

## Complete File Structure

```
src/
├── index.tsx                    # Entry point
├── App.tsx                      # Main app component
├── types.ts                     # Type definitions
├── components/
│   ├── MessageList.tsx          # Message display
│   ├── VirtualizedMessageList.tsx  # Virtualized message list
│   ├── InputPrompt.tsx          # Input component
│   └── CodeBlock.tsx            # Syntax highlighting
├── contexts/
│   ├── KeypressContext.tsx      # Keyboard input provider
│   ├── MouseContext.tsx         # Mouse input provider
│   └── ScrollProvider.tsx       # Scroll management provider
└── hooks/
    ├── useKeypress.ts           # Keyboard hook
    ├── useMouse.ts              # Mouse hook
    └── useScrollable.ts         # Scroll registration hook
```

## Testing Checklist

- [ ] Basic message display works
- [ ] Input captures keystrokes
- [ ] Enter sends message
- [ ] Backspace deletes characters
- [ ] Ctrl+C exits cleanly
- [ ] Mouse wheel scrolls message list
- [ ] New messages auto-scroll to bottom
- [ ] User can scroll up without auto-scroll
- [ ] Terminal resize adjusts layout
- [ ] 1000+ messages render without lag
- [ ] Syntax highlighting works
- [ ] Streaming updates render smoothly
- [ ] Alternate buffer mode toggles cleanly

## Next Steps

1. Add command palette (/)
2. Add file picker (@)
3. Add settings dialog
4. Add theme system
5. Add vim mode
6. Add clipboard support
7. Integrate with actual LLM API

See `06-code-snippets.md` for reusable code patterns.
