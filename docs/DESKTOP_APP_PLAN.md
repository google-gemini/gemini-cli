# macOS Desktop App Implementation Plan

## Overview

This document outlines the implementation plan for creating a native macOS desktop application wrapper for the Gemini CLI, replacing `packages/cli` with a new Electron-based frontend while reusing `packages/core` for all business logic.

## Tech Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Desktop Framework | Electron | Familiar JS ecosystem, good macOS support |
| Build Tool | electron-vite | Fast HMR, TypeScript support, modern DX |
| UI Framework | React 18+ | Aligns with existing codebase patterns |
| Styling | Tailwind CSS | Rapid UI development, utility-first |
| Platform | macOS only | Focused development, native optimizations |

## Architecture

### Package Structure

```
packages/
├── core/                    # UNCHANGED - Business logic, Gemini API
├── desktop/                 # NEW - Electron + React frontend
│   ├── electron.vite.config.ts
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── main/           # Electron main process
│   │   │   ├── index.ts    # App entry, window management
│   │   │   ├── ipc/        # IPC handlers
│   │   │   │   ├── gemini.ts       # Core integration
│   │   │   │   ├── tools.ts        # Tool execution
│   │   │   │   └── notifications.ts
│   │   │   ├── menu.ts     # macOS menu bar
│   │   │   └── store.ts    # Electron-store for preferences
│   │   │
│   │   ├── preload/        # Context bridge
│   │   │   └── index.ts    # Expose safe APIs to renderer
│   │   │
│   │   └── renderer/       # React UI
│   │       ├── index.html
│   │       ├── main.tsx
│   │       ├── App.tsx
│   │       ├── components/
│   │       │   ├── layout/
│   │       │   │   ├── SplitPane.tsx
│   │       │   │   ├── Sidebar.tsx
│   │       │   │   └── TitleBar.tsx
│   │       │   ├── chat/
│   │       │   │   ├── ChatView.tsx
│   │       │   │   ├── MessageList.tsx
│   │       │   │   ├── Message.tsx
│   │       │   │   ├── InputArea.tsx
│   │       │   │   └── StreamingText.tsx
│   │       │   ├── tools/
│   │       │   │   ├── ToolCallCard.tsx
│   │       │   │   ├── DiffView.tsx
│   │       │   │   ├── ShellOutput.tsx
│   │       │   │   └── ApprovalDialog.tsx
│   │       │   ├── files/
│   │       │   │   ├── FileViewer.tsx
│   │       │   │   ├── CodeEditor.tsx
│   │       │   │   └── FileTree.tsx
│   │       │   └── common/
│   │       │       ├── Button.tsx
│   │       │       ├── Input.tsx
│   │       │       └── Modal.tsx
│   │       ├── hooks/
│   │       │   ├── useGemini.ts
│   │       │   ├── useToolExecution.ts
│   │       │   ├── useFileViewer.ts
│   │       │   └── useNotifications.ts
│   │       ├── stores/
│   │       │   ├── chatStore.ts    # Zustand for chat state
│   │       │   └── uiStore.ts      # UI state (panels, etc.)
│   │       ├── types/
│   │       │   └── ipc.ts          # IPC type definitions
│   │       └── styles/
│   │           └── globals.css     # Tailwind imports
│   │
│   └── resources/          # App icons, etc.
│       └── icon.icns
│
├── cli/                    # Keep for CLI users (optional)
├── a2a-server/             # UNCHANGED
├── vscode-ide-companion/   # UNCHANGED
└── test-utils/             # UNCHANGED
```

### IPC Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        RENDERER PROCESS                          │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────┐ │
│  │  React UI   │  │   Zustand    │  │      useGemini()        │ │
│  │ Components  │──│    Store     │──│    window.api.xxx()     │ │
│  └─────────────┘  └──────────────┘  └───────────┬─────────────┘ │
└─────────────────────────────────────────────────┼───────────────┘
                                                  │ contextBridge
                                                  │ (preload.ts)
┌─────────────────────────────────────────────────┼───────────────┐
│                         MAIN PROCESS            │                │
│  ┌──────────────────────────────────────────────▼──────────────┐│
│  │                    IPC Handlers                              ││
│  │  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐    ││
│  │  │gemini:send  │  │tools:approve │  │notifications:show│    ││
│  │  │gemini:abort │  │tools:reject  │  │                  │    ││
│  │  │gemini:init  │  │tools:list    │  │                  │    ││
│  │  └──────┬──────┘  └──────┬───────┘  └──────────────────┘    ││
│  └─────────┼────────────────┼──────────────────────────────────┘│
│            │                │                                    │
│  ┌─────────▼────────────────▼─────────────────────────────────┐ │
│  │                   packages/core                             │ │
│  │  ┌─────────┐  ┌─────────────┐  ┌────────────┐  ┌─────────┐ │ │
│  │  │ Config  │  │GeminiClient │  │ToolRegistry│  │MessageBus│ │ │
│  │  └─────────┘  └─────────────┘  └────────────┘  └─────────┘ │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### IPC Channel Definitions

```typescript
// src/types/ipc.ts

export interface GeminiAPI {
  // Session management
  initialize(params: InitParams): Promise<void>;
  selectProject(path: string): Promise<void>;

  // Chat
  sendMessage(message: string, promptId: string): Promise<void>;
  abortRequest(): void;

  // Event subscriptions (renderer listens)
  onStreamEvent(callback: (event: StreamEvent) => void): () => void;
  onToolRequest(callback: (request: ToolRequest) => void): () => void;

  // Tool responses
  approveToolCall(callId: string): void;
  rejectToolCall(callId: string, reason?: string): void;
  approveAllPending(): void;

  // History
  getHistory(): Promise<Message[]>;
  clearHistory(): Promise<void>;

  // Config
  getSettings(): Promise<Settings>;
  updateSettings(settings: Partial<Settings>): Promise<void>;
}

export interface FileAPI {
  readFile(path: string): Promise<string>;
  watchFile(path: string, callback: (content: string) => void): () => void;
  openInEditor(path: string): Promise<void>;
}

export interface NotificationAPI {
  show(title: string, body: string): void;
}
```

## UI Design

### Main Window Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  ○ ○ ○                    Project Name                    ⚙️    │ <- Title bar (frameless)
├──────────────────────┬──────────────────────────────────────────┤
│                      │                                          │
│   Conversation       │         File Viewer                      │
│                      │                                          │
│  ┌────────────────┐  │  ┌────────────────────────────────────┐  │
│  │ User message   │  │  │  src/components/Button.tsx         │  │
│  └────────────────┘  │  ├────────────────────────────────────┤  │
│                      │  │  1  import React from 'react';     │  │
│  ┌────────────────┐  │  │  2                                 │  │
│  │ Assistant      │  │  │  3  export const Button = ({       │  │
│  │ response with  │  │  │  4    children,                    │  │
│  │ streaming...   │  │  │  5    onClick,                     │  │
│  │                │  │  │  6  }) => (                        │  │
│  │ ┌────────────┐ │  │  │  7    <button                      │  │
│  │ │ Tool: Edit │ │  │  │  8      className="btn"            │  │
│  │ │ [Diff]     │ │  │  │  9      onClick={onClick}          │  │
│  │ │ ✓ Approved │ │  │  │ 10    >                            │  │
│  │ └────────────┘ │  │  │ 11      {children}                 │  │
│  └────────────────┘  │  │ 12    </button>                    │  │
│                      │  │ 13  );                             │  │
│                      │  └────────────────────────────────────┘  │
├──────────────────────┴──────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────┐     │
│  │ Type a message...                                   ⏎  │     │
│  └────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

### Component Breakdown

#### Chat Components

| Component | Purpose | Key Features |
|-----------|---------|--------------|
| `ChatView` | Container for conversation | Scroll management, auto-scroll |
| `MessageList` | Renders message array | Virtualized for performance |
| `Message` | Single message display | User/assistant styling, markdown |
| `StreamingText` | Animated text reveal | Token-by-token rendering |
| `InputArea` | Message composer | Multi-line, submit on Enter |

#### Tool Components

| Component | Purpose | Key Features |
|-----------|---------|--------------|
| `ToolCallCard` | Inline tool display | Collapsible, status indicator |
| `DiffView` | File edit visualization | Side-by-side or unified diff |
| `ShellOutput` | Command execution display | ANSI color support, scrolling |
| `ApprovalDialog` | Confirmation modal | Approve/reject/approve all |

#### File Components

| Component | Purpose | Key Features |
|-----------|---------|--------------|
| `FileViewer` | Right pane container | Tab management |
| `CodeEditor` | Syntax-highlighted viewer | Line numbers, themes |
| `FileTree` | Project navigator | Expand/collapse, file icons |

## Core Integration Layer

### Main Process Setup

```typescript
// src/main/ipc/gemini.ts

import { Config, ConfigParameters, GeminiClient, MessageBus, MessageBusType } from '@anthropic/core';
import { ipcMain, BrowserWindow } from 'electron';

let config: Config | null = null;
let client: GeminiClient | null = null;
let currentAbortController: AbortController | null = null;

export function setupGeminiHandlers(mainWindow: BrowserWindow) {

  ipcMain.handle('gemini:initialize', async (_, params: ConfigParameters) => {
    config = new Config({
      ...params,
      interactive: true,
      debugMode: false,
    });
    await config.initialize();
    client = config.getGeminiClient();

    // Subscribe to message bus for tool confirmations
    const messageBus = config.getMessageBus();
    messageBus.subscribe(MessageBusType.TOOL_CONFIRMATION_REQUEST, (request) => {
      mainWindow.webContents.send('tool:confirmation-request', request);
    });
  });

  ipcMain.handle('gemini:send', async (_, message: string, promptId: string) => {
    if (!client) throw new Error('Client not initialized');

    currentAbortController = new AbortController();
    const stream = client.sendMessageStream(
      [{ text: message }],
      currentAbortController.signal,
      promptId
    );

    for await (const event of stream) {
      mainWindow.webContents.send('gemini:stream-event', event);
    }
  });

  ipcMain.on('gemini:abort', () => {
    currentAbortController?.abort();
  });

  ipcMain.handle('tools:approve', async (_, callId: string) => {
    const messageBus = config?.getMessageBus();
    messageBus?.publish({
      type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
      correlationId: callId,
      confirmed: true,
    });
  });

  ipcMain.handle('tools:reject', async (_, callId: string) => {
    const messageBus = config?.getMessageBus();
    messageBus?.publish({
      type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
      correlationId: callId,
      confirmed: false,
    });
  });
}
```

### Preload Bridge

```typescript
// src/preload/index.ts

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  gemini: {
    initialize: (params) => ipcRenderer.invoke('gemini:initialize', params),
    send: (message, promptId) => ipcRenderer.invoke('gemini:send', message, promptId),
    abort: () => ipcRenderer.send('gemini:abort'),

    onStreamEvent: (callback) => {
      const handler = (_, event) => callback(event);
      ipcRenderer.on('gemini:stream-event', handler);
      return () => ipcRenderer.removeListener('gemini:stream-event', handler);
    },

    onToolRequest: (callback) => {
      const handler = (_, request) => callback(request);
      ipcRenderer.on('tool:confirmation-request', handler);
      return () => ipcRenderer.removeListener('tool:confirmation-request', handler);
    },
  },

  tools: {
    approve: (callId) => ipcRenderer.invoke('tools:approve', callId),
    reject: (callId) => ipcRenderer.invoke('tools:reject', callId),
  },

  notifications: {
    show: (title, body) => ipcRenderer.send('notifications:show', title, body),
  },
});
```

### React Hook

```typescript
// src/renderer/hooks/useGemini.ts

import { useState, useCallback, useEffect } from 'react';
import type { StreamEvent, ToolRequest } from '../types/ipc';

export function useGemini() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingTools, setPendingTools] = useState<ToolRequest[]>([]);

  useEffect(() => {
    const unsubStream = window.api.gemini.onStreamEvent((event) => {
      switch (event.type) {
        case 'content':
          setMessages(prev => appendToLastAssistant(prev, event.value));
          break;
        case 'tool_call_request':
          setMessages(prev => appendToolCall(prev, event.value));
          break;
        case 'finished':
          setIsStreaming(false);
          window.api.notifications.show('Task Complete', 'Gemini finished processing');
          break;
      }
    });

    const unsubTool = window.api.gemini.onToolRequest((request) => {
      setPendingTools(prev => [...prev, request]);
    });

    return () => {
      unsubStream();
      unsubTool();
    };
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
    setIsStreaming(true);

    const promptId = crypto.randomUUID();
    await window.api.gemini.send(text, promptId);
  }, []);

  const abort = useCallback(() => {
    window.api.gemini.abort();
    setIsStreaming(false);
  }, []);

  const approveTool = useCallback((callId: string) => {
    window.api.tools.approve(callId);
    setPendingTools(prev => prev.filter(t => t.callId !== callId));
  }, []);

  const rejectTool = useCallback((callId: string) => {
    window.api.tools.reject(callId);
    setPendingTools(prev => prev.filter(t => t.callId !== callId));
  }, []);

  return {
    messages,
    isStreaming,
    pendingTools,
    sendMessage,
    abort,
    approveTool,
    rejectTool,
  };
}
```

## Implementation Phases

### Phase 1: Foundation (Week 1-2)

**Goal:** Bootable Electron app with basic structure

- [ ] Scaffold electron-vite project in `packages/desktop`
- [ ] Configure TypeScript, Tailwind CSS
- [ ] Create main process entry point
- [ ] Set up IPC channel structure
- [ ] Create basic window with frameless title bar
- [ ] Implement split-pane layout shell
- [ ] Add macOS menu bar (File, Edit, View, Help)

**Deliverable:** App opens, shows split pane, menus work

### Phase 2: Core Integration (Week 3-4)

**Goal:** Connect to packages/core, send messages

- [ ] Import and initialize `Config` from core
- [ ] Implement `gemini:initialize` IPC handler
- [ ] Implement `gemini:send` with streaming
- [ ] Create preload bridge for all channels
- [ ] Build `useGemini` hook
- [ ] Display streaming responses in chat view
- [ ] Handle errors gracefully

**Deliverable:** Can send messages, see streaming responses

### Phase 3: Tool Execution UI (Week 5-6)

**Goal:** Full tool execution with approval workflow

- [ ] Subscribe to MessageBus tool confirmations
- [ ] Build `ToolCallCard` component
- [ ] Implement approval dialog
- [ ] Create `DiffView` for file edits
- [ ] Create `ShellOutput` for command results
- [ ] Wire up approve/reject handlers
- [ ] Add "Approve All" functionality

**Deliverable:** Can execute tools with visual feedback

### Phase 4: File Viewer Panel (Week 7-8)

**Goal:** Functional right-side file viewer

- [ ] Implement `FileViewer` container
- [ ] Build `CodeEditor` with syntax highlighting (Monaco or CodeMirror)
- [ ] Add file watching for live updates
- [ ] Implement tab management
- [ ] Create "Open in Editor" action
- [ ] Link tool edits to file viewer preview

**Deliverable:** See file contents, diffs sync to viewer

### Phase 5: Polish & Features (Week 9-10)

**Goal:** Production-ready macOS app

- [ ] Implement system notifications
- [ ] Add preferences window
- [ ] Create project selector (folder picker)
- [ ] Implement session persistence
- [ ] Add keyboard shortcuts
- [ ] Dark mode support (respect system)
- [ ] Performance optimization (virtualization)
- [ ] Error boundaries and logging

**Deliverable:** Complete, polished macOS app

### Phase 6: Distribution (Week 11-12)

**Goal:** Distributable app package

- [ ] Configure electron-builder
- [ ] Set up code signing
- [ ] Create DMG installer
- [ ] Add auto-update support
- [ ] Write user documentation
- [ ] Create release workflow

**Deliverable:** Signed .dmg ready for distribution

## Technical Decisions

### State Management

**Choice: Zustand**

Rationale:
- Lightweight, minimal boilerplate
- Works well with React hooks
- Easy integration with Electron IPC
- Good TypeScript support

```typescript
// Example store
import { create } from 'zustand';

interface ChatStore {
  messages: Message[];
  addMessage: (msg: Message) => void;
  appendToLast: (text: string) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  appendToLast: (text) => set((s) => ({
    messages: s.messages.map((m, i) =>
      i === s.messages.length - 1
        ? { ...m, content: m.content + text }
        : m
    ),
  })),
}));
```

### Code Editor

**Choice: Monaco Editor**

Rationale:
- Same editor as VS Code
- Excellent TypeScript/JavaScript support
- Built-in diff viewer
- Large ecosystem

Alternative: CodeMirror 6 (lighter weight, if Monaco too heavy)

### Diff Visualization

**Choice: react-diff-viewer-continued**

Rationale:
- React native, works with Tailwind
- Supports syntax highlighting
- Unified and split view modes
- Good performance

### Markdown Rendering

**Choice: react-markdown + remark-gfm**

Rationale:
- Well-maintained
- GFM support (tables, task lists)
- Customizable components
- Works with syntax highlighting

## Security Considerations

1. **Context Isolation**: Enabled by default in electron-vite
2. **Node Integration**: Disabled in renderer
3. **Preload Scripts**: Only expose necessary APIs
4. **File Access**: Respect sandbox, use IPC for file operations
5. **Tool Execution**: All tools run in main process, not renderer

## Performance Considerations

1. **Virtual Scrolling**: Use `react-window` for message list
2. **Debounced Updates**: Batch streaming tokens
3. **Lazy Loading**: Load Monaco editor on demand
4. **Memory**: Clean up event listeners, abort pending requests

## Open Questions

1. **Authentication Flow**: How to handle OAuth in desktop app? (Likely: open browser, handle callback)
2. **MCP Servers**: Should desktop app support MCP? (Probably yes, same as CLI)
3. **History Storage**: Reuse CLI history format or new schema?
4. **CLI Deprecation**: Keep CLI or eventually replace entirely?

---

## Next Steps

1. **Scaffold the project** - Create `packages/desktop` with electron-vite
2. **Set up build system** - Ensure it integrates with monorepo
3. **Create window shell** - Basic Electron window with split pane
4. **Wire up first IPC** - Initialize Config, test connection

Ready to begin implementation?
