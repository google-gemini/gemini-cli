# Gemini CLI - Project Structure and Architecture

**Last Updated:** 2025-11-19
**Companion to:** [Building an Investment Research AI Agent - Learning Guide](./building-ai-agent-guide.md)

This document provides a comprehensive overview of the Gemini CLI codebase structure, package organization, and component relationships.

---

## 📦 High-Level Package Structure

```
gemini-cli/
├── packages/
│   ├── core/              ⭐ Core AI agent engine (shared library)
│   ├── cli/               🖥️  Terminal interface (uses core)
│   ├── a2a-server/        🌐 Agent-to-Agent server (uses core)
│   ├── vscode-ide-companion/ 💻 VS Code extension (MCP integration)
│   └── test-utils/        🧪 Shared test utilities
├── integration-tests/     🔬 End-to-end tests
├── scripts/               🛠️  Build and automation scripts
├── docs/                  📚 Official documentation
└── learn_docs/            📖 Learning materials and guides
```

### Package Descriptions

| Package | Purpose | Key Dependencies | Entry Point |
|---------|---------|------------------|-------------|
| **@google/gemini-cli-core** | Core AI agent engine with orchestration, tools, and LLM integration | `@google/genai`, `@modelcontextprotocol/sdk` | `dist/index.js` |
| **@google/gemini-cli** | Terminal user interface built with React/Ink | `@google/gemini-cli-core`, `ink`, `react` | `dist/index.js` |
| **@google/gemini-cli-a2a-server** | HTTP server for Agent-to-Agent protocol | `@google/gemini-cli-core`, `express`, `@a2a-js/sdk` | `dist/a2a-server.mjs` |
| **vscode-ide-companion** | VS Code extension for IDE integration | `@modelcontextprotocol/sdk`, `express` | `dist/extension.cjs` |
| **@google/gemini-cli-test-utils** | Shared testing utilities | - | `dist/index.js` |

---

## 🔄 Package Dependency Graph

```
┌─────────────────────────────────────────────────────────────┐
│                         ROOT                                │
│                   (monorepo workspace)                      │
│                  npm workspaces pattern                     │
└────────────┬────────────────────────────┬───────────────────┘
             │                            │
             ▼                            ▼
    ┌────────────────┐          ┌────────────────────┐
    │   test-utils   │          │   vscode-companion │
    │  (shared lib)  │          │  (IDE extension)   │
    └────────────────┘          └────────────────────┘
             ▲                           │
             │                           │ MCP Protocol
             │                           │ (JSON-RPC)
             │                           ▼
    ┌────────┴─────────────────────────────────────┐
    │         @google/gemini-cli-core              │
    │     (Core AI Agent Engine - THE BRAIN)       │
    │  • GeminiClient (orchestrator)               │
    │  • Tool System (ToolRegistry)                │
    │  • Turn Management                           │
    │  • Chat History                              │
    │  • Prompts & Config                          │
    │  • Content Generator (LLM API)               │
    └───────────┬──────────────┬───────────────────┘
                │              │
                ▼              ▼
       ┌────────────────┐  ┌─────────────────┐
       │   @google/     │  │   a2a-server    │
       │   gemini-cli   │  │  (HTTP server)  │
       │  (Terminal UI) │  │  Express + A2A  │
       │   React/Ink    │  │                 │
       └────────────────┘  └─────────────────┘
```

### Dependency Flow Summary

1. **core** → Independent foundation, only depends on external libraries
2. **cli** → Depends on **core** (imports and uses GeminiClient)
3. **a2a-server** → Depends on **core** (exposes core via HTTP API)
4. **vscode-ide-companion** → Communicates with core via MCP protocol (separate process, no direct dependency)
5. **test-utils** → Used by all packages for testing

### Key Insight: Reusable Core

The **core** package is designed to be interface-agnostic. You can build:
- Terminal UI (✅ **cli** package)
- Web UI (replace CLI with web server)
- HTTP API (✅ **a2a-server** package)
- Desktop app (Electron + core)
- Mobile app (React Native + core)
- **Your investment research agent** (custom interface + core)

All using the same AI agent engine!

---

## 🧠 Core Package Deep Dive

The `packages/core/src/` directory contains the heart of the AI agent system.

### Directory Structure

```
packages/core/src/
├── core/                      ⭐⭐⭐ CRITICAL - Main Agent Loop
│   ├── client.ts             → GeminiClient - Main orchestrator (THE CONDUCTOR)
│   ├── turn.ts               → Turn - Single loop iteration
│   ├── geminiChat.ts         → Chat history management
│   ├── prompts.ts            → System prompt construction
│   └── contentGenerator.ts   → LLM API abstraction layer
│
├── tools/                     ⭐⭐⭐ CRITICAL - Tool System
│   ├── tool-registry.ts      → ToolRegistry - Manages all available tools
│   ├── tools.ts              → Base tool classes and interfaces
│   ├── read-file.ts          → File reading tool
│   ├── write-file.ts         → File writing tool
│   ├── edit-file.ts          → File editing tool
│   ├── bash-tool.ts          → Shell command execution
│   ├── web-fetch.ts          → Web fetching tool
│   └── ... (many more tools)
│
├── config/                    ⭐⭐ Configuration System
│   ├── config.ts             → Service locator pattern
│   └── settings.ts           → User settings management
│
├── services/                  ⭐⭐ Background Services
│   ├── chatCompressionService.ts  → Context window management
│   ├── loopDetectionService.ts    → Prevent infinite loops
│   └── projectIndexService.ts     → Code indexing for search
│
├── utils/                     ⭐⭐ Utility Functions
│   ├── retry.ts              → Exponential backoff retries
│   ├── errors.ts             → Error handling utilities
│   └── filesearch/           → File search utilities
│
├── mcp/                       🔌 Model Context Protocol
│   └── token-storage/        → MCP server integration
│
├── policy/                    🛡️ Security & Policies
│   └── policies/             → Tool execution policies
│
├── commands/                  📝 Slash Commands
│   └── ... (command handlers)
│
├── agents/                    🤖 Specialized Agents
│   └── ... (sub-agents for specific tasks)
│
├── telemetry/                 📊 Monitoring & Analytics
│   └── clearcut-logger/      → Usage tracking
│
├── safety/                    🔒 Safety Filters
├── routing/                   🚦 Model Routing (Pro vs Flash)
├── ide/                       💻 IDE Integration Support
├── hooks/                     🪝 Lifecycle Hooks
└── output/                    📤 Output Formatting
```

### Core Components Detailed

#### 1. `core/client.ts` - GeminiClient (The Orchestrator)

**Purpose:** Main entry point for AI agent interactions. Manages the entire conversation lifecycle.

**Key Responsibilities:**
- Initializes chat sessions with system prompts and tools
- Orchestrates the agent loop (user input → LLM → tools → LLM → response)
- Manages conversation history and context
- Handles compression when context window fills up
- Implements retry logic and error recovery
- Routes between different models (Pro vs Flash)

**Critical Methods:**
```typescript
class GeminiClient {
  // Main method - sends message and streams responses
  async *sendMessageStream(
    request: string,
    signal?: AbortSignal,
    prompt_id?: string,
    turns?: Turn[]
  ): AsyncGenerator<Event>

  // Initializes chat with system prompt and tools
  async startChat(extraHistory?: Content[]): Promise<GeminiChat>

  // Sets up the client
  async initialize(): Promise<void>
}
```

**Location:** `packages/core/src/core/client.ts:419` (sendMessageStream method)

---

#### 2. `core/turn.ts` - Turn (Single Loop Iteration)

**Purpose:** Represents one complete turn in the agent loop (LLM call + tool executions).

**Key Responsibilities:**
- Streams responses from the LLM API
- Detects function calls in the response
- Queues tool executions
- Emits events (content, tool_call_request, tool_call_response)
- Handles multi-part responses (text + function calls)

**Critical Methods:**
```typescript
class Turn {
  // Main execution method
  async *run(
    model: ContentGenerator,
    request: GenerateContentRequest,
    signal?: AbortSignal
  ): AsyncGenerator<Event>
}
```

**Location:** `packages/core/src/core/turn.ts:236` (run method)

---

#### 3. `core/geminiChat.ts` - GeminiChat (History Manager)

**Purpose:** Manages conversation history and API communication.

**Key Responsibilities:**
- Maintains conversation history (user ↔ model messages)
- Manages both curated and comprehensive history
- Handles streaming responses from API
- Validates content before sending
- Auto-retries on invalid responses

**Critical Methods:**
```typescript
class GeminiChat {
  // Get conversation history
  getHistory(curated: boolean): Content[]

  // Add message to history
  addHistory(content: Content): void

  // Send message and stream response
  async *sendMessageStream(
    request: GenerateContentRequest,
    signal?: AbortSignal
  ): AsyncGenerator<GenerateContentStreamResult>
}
```

**Location:** `packages/core/src/core/geminiChat.ts:239` (sendMessageStream method)

---

#### 4. `core/prompts.ts` - System Prompts

**Purpose:** Constructs the system instruction that defines agent behavior.

**Key Responsibilities:**
- Builds comprehensive system prompts
- Includes context (directory, git info, environment)
- Defines agent personality and capabilities
- Incorporates user customizations (GEMINI.md files)

**Critical Functions:**
```typescript
function getCoreSystemPrompt(
  config: Config,
  userMemory?: string
): string
```

**Location:** `packages/core/src/core/prompts.ts`

**For Investment Research:** This is where you'd customize the agent's role:
```typescript
const investmentPrompt = `
You are an expert investment research analyst. Your role is to:
1. Analyze stocks using fundamental and technical analysis
2. Gather market data, news, and sentiment
3. Provide data-driven recommendations
4. Explain your reasoning clearly

Guidelines:
- Always cite data sources
- Consider multiple timeframes
- Assess risk factors
- Provide balanced analysis
`;
```

---

#### 5. `core/contentGenerator.ts` - API Abstraction

**Purpose:** Abstract interface for LLM API calls (supports multiple auth methods).

**Key Responsibilities:**
- Handles authentication (OAuth, API key, Vertex AI)
- Manages streaming responses
- Implements retry logic with backoff
- Handles rate limiting

**Interface:**
```typescript
interface ContentGenerator {
  generateContent(request: GenerateContentRequest): Promise<GenerateContentResponse>
  generateContentStream(request: GenerateContentRequest): AsyncGenerator<GenerateContentStreamResult>
  countTokens(request: CountTokensRequest): Promise<CountTokensResponse>
}
```

**Location:** `packages/core/src/core/contentGenerator.ts`

---

### Tool System Deep Dive

#### `tools/tool-registry.ts` - ToolRegistry

**Purpose:** Central registry for all available tools.

**Key Responsibilities:**
- Registers tools at startup
- Converts tools to function declarations for LLM
- Validates tool parameters
- Executes tools and captures results
- Manages tool policies and confirmations

**Critical Methods:**
```typescript
class ToolRegistry {
  // Register a new tool
  register(tool: Tool): void

  // Get function declarations for LLM
  getFunctionDeclarations(): FunctionDeclaration[]

  // Get specific tool by name
  getTool(name: string): Tool | undefined

  // Execute a tool
  async executeTool(
    name: string,
    params: Record<string, unknown>
  ): Promise<ToolResult>
}
```

**Location:** `packages/core/src/tools/tool-registry.ts`

---

#### `tools/tools.ts` - Base Tool Classes

**Purpose:** Defines base classes and interfaces for building tools.

**Key Classes:**
```typescript
// Declarative tool (defined via JSON schema)
abstract class BaseDeclarativeTool implements Tool {
  abstract name: string
  abstract description: string
  abstract parameters: FunctionDeclarationSchema

  abstract execute(params: Record<string, unknown>): Promise<ToolResult>
}

// Dynamic tool (discovered at runtime, e.g., MCP tools)
interface DynamicTool extends Tool {
  // Tools loaded from MCP servers
}
```

**Location:** `packages/core/src/tools/tools.ts`

---

#### Example Tool: `tools/read-file.ts`

**Purpose:** Reads file contents and returns them to the LLM.

**Implementation Pattern:**
```typescript
export class ReadFileTool extends BaseDeclarativeTool {
  name = 'read_file'
  description = 'Reads the contents of a file'

  parameters = {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'Path to the file to read'
      }
    },
    required: ['file_path']
  }

  async execute(params: { file_path: string }): Promise<ToolResult> {
    const content = await fs.readFile(params.file_path, 'utf-8')
    return { result: content }
  }
}
```

**Location:** `packages/core/src/tools/read-file.ts`

---

### Services Deep Dive

#### `services/chatCompressionService.ts`

**Purpose:** Manages context window by compressing old messages when token limit approaches.

**Strategy:**
- Monitors token usage
- Summarizes old conversations
- Preserves important context
- Keeps recent messages intact

---

#### `services/loopDetectionService.ts`

**Purpose:** Prevents infinite loops in the agent.

**Strategy:**
- Detects repeated patterns
- Tracks tool call sequences
- Intervenes when loops detected
- Provides escape mechanisms

---

#### `services/projectIndexService.ts`

**Purpose:** Indexes codebase for fast search and context retrieval.

**Features:**
- File discovery
- Symbol extraction
- Fast search
- Relevance ranking

---

## 🖥️ CLI Package Deep Dive

The `packages/cli/src/` directory contains the terminal user interface.

### Directory Structure

```
packages/cli/src/
├── ui/                        🎨 React/Ink Terminal UI
│   ├── components/           → Chat UI, messages, views
│   │   ├── messages/         → Message rendering components
│   │   ├── shared/           → Shared UI components
│   │   └── views/            → Different view layouts
│   ├── auth/                 → Authentication flows (OAuth, API key)
│   ├── editors/              → Text editors (includes vim mode!)
│   ├── hooks/                → React hooks for state management
│   ├── contexts/             → React contexts (global state)
│   ├── state/                → State management
│   ├── layouts/              → Layout components
│   ├── themes/               → Color themes and styling
│   ├── utils/                → UI utility functions
│   └── noninteractive/       → Headless mode output (JSON, stream-json)
│
├── commands/                  🔧 CLI Commands
│   ├── extensions/           → Custom command system
│   └── mcp/                  → MCP-related commands
│
├── config/                    ⚙️ CLI-specific Config
│   └── extensions/           → Extension loading
│
├── services/                  🛠️ CLI Services
│   └── prompt-processors/    → Prompt processing pipelines
│
├── core/                      🎯 CLI Core Logic
│   └── ... (entry point, main loop)
│
└── utils/                     🔨 CLI Utilities
    └── ... (helper functions)
```

### Key CLI Components

#### UI Architecture (React/Ink)

The CLI uses **React** with **Ink** to render interactive terminal interfaces.

**Pattern:**
```typescript
// CLI renders React components to terminal
import { render } from 'ink'
import { GeminiClient } from '@google/gemini-cli-core'

function ChatApp() {
  const [messages, setMessages] = useState([])
  const client = useMemo(() => new GeminiClient(config), [])

  // Stream events from core and update UI
  useEffect(() => {
    (async () => {
      for await (const event of client.sendMessageStream(input)) {
        setMessages(prev => [...prev, event])
      }
    })()
  }, [input])

  return <MessageList messages={messages} />
}

render(<ChatApp />)
```

---

#### Headless Mode (`ui/noninteractive/`)

**Purpose:** Support for non-interactive scripting and automation.

**Output Formats:**
- **Text:** Simple text responses
- **JSON:** Structured output (`--output-format json`)
- **Stream JSON:** Newline-delimited events (`--output-format stream-json`)

**Use Case:**
```bash
# Get structured output for parsing
gemini -p "Analyze this code" --output-format json

# Stream events for monitoring
gemini -p "Run tests" --output-format stream-json | jq .
```

---

## 🌐 A2A Server Package

The `packages/a2a-server/` exposes the core AI agent via HTTP API.

### Structure

```
packages/a2a-server/src/
├── http/                      🌍 HTTP Server
│   └── server.ts             → Express server with A2A endpoints
│
└── ... (A2A protocol handlers)
```

### Purpose

Enable **agent-to-agent** communication:
- Other agents can call Gemini CLI as a service
- RESTful API for AI agent capabilities
- Supports distributed agent architectures

---

## 💻 VS Code Extension Package

The `packages/vscode-ide-companion/` provides IDE integration.

### Architecture

```
VS Code Extension (separate process)
         │
         │ MCP Protocol (JSON-RPC)
         │ over stdio/HTTP
         ▼
   Gemini CLI Core
   (running as MCP server)
```

### Features

- Diff editor integration
- File operations from IDE
- Commands accessible via Command Palette
- Real-time collaboration between IDE and agent

---

## 🔄 The Complete Agent Loop

This is how all components work together during a typical interaction.

```
┌──────────────────────────────────────────────────────────────┐
│  1. USER INPUT                                               │
│     packages/cli/src/ui/ captures input                     │
│     → Terminal UI component sends message to core            │
└────────────────┬─────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────┐
│  2. ORCHESTRATOR                                             │
│     packages/core/src/core/client.ts                         │
│     GeminiClient.sendMessageStream()                         │
│     • Initializes GeminiChat with tools                      │
│     • Manages conversation state                             │
│     • Coordinates Turn execution                             │
│     • Handles retries & errors                               │
└────────────────┬─────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────┐
│  3. PROMPT CONSTRUCTION                                      │
│     packages/core/src/core/prompts.ts                        │
│     getCoreSystemPrompt()                                    │
│     Builds complete prompt:                                  │
│     • System Instruction: "You are an expert..."             │
│     • Chat History: [previous messages]                      │
│     • Tool Declarations: getFunctionDeclarations()           │
│     • Current User Message: "Analyze AAPL stock"             │
└────────────────┬─────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────┐
│  4. API CALL                                                 │
│     packages/core/src/core/contentGenerator.ts               │
│     ContentGenerator.generateContentStream()                 │
│     → Send to Gemini API (streaming enabled)                 │
│     → Handles auth, retries, rate limits                     │
└────────────────┬─────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────┐
│  5. LLM RESPONSE (from Gemini API)                           │
│     Can return:                                              │
│     • Text: "Let me fetch the stock data for AAPL..."       │
│     • Function Calls: fetch_stock_price(ticker="AAPL")      │
│     • Both: Text explanation + Function Calls                │
└────────────────┬─────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────┐
│  6. TURN EXECUTION                                           │
│     packages/core/src/core/turn.ts                           │
│     Turn.run()                                               │
│     • Streams LLM response chunks                            │
│     • Detects function calls in response                     │
│     • Queues tool executions                                 │
│     • Emits events: content, tool_call_request               │
└────────────────┬─────────────────────────────────────────────┘
                 │
                 ▼
            ┌────┴─────┐
            │          │
      Text Only    Has Function Calls?
            │          │
            │          ▼
            │    ┌─────────────────────────────────────┐
            │    │  7. TOOL EXECUTION                  │
            │    │  packages/core/src/tools/           │
            │    │  ToolRegistry.executeTool()         │
            │    │  • Parse function call              │
            │    │  • Validate parameters (Zod)        │
            │    │  • Check policies (optional)        │
            │    │  • Request confirmation (optional)  │
            │    │  • Execute via tool.execute()       │
            │    │  • Capture results                  │
            │    └──────────────┬──────────────────────┘
            │                   │
            │                   ▼
            │    ┌─────────────────────────────────────┐
            │    │  8. TOOL RESULTS                    │
            │    │  {"price": 178.32, "volume": ...}   │
            │    └──────────────┬──────────────────────┘
            │                   │
            │                   ▼
            │    ┌─────────────────────────────────────┐
            │    │  9. SEND RESULTS BACK TO LLM        │
            │    │  Add functionResponse to history    │
            │    │  packages/core/src/core/            │
            │    │  geminiChat.ts adds to history      │
            │    │  → Loop back to step 4              │
            │    └──────────────┬──────────────────────┘
            │                   │
            └───────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────┐
│  10. STREAM FINAL RESPONSE TO USER                           │
│      packages/cli/src/ui/ renders response                   │
│      "AAPL is trading at $178.32, up 2.3% today.            │
│      Based on the data, here's my analysis..."               │
└──────────────────────────────────────────────────────────────┘
```

### Event Flow

Throughout this loop, events are streamed:

```typescript
// Event types emitted during the loop
type Event =
  | { type: 'content', text: string }              // LLM text output
  | { type: 'tool_call_request', name, params }    // LLM wants to call tool
  | { type: 'tool_call_response', name, result }   // Tool execution result
  | { type: 'error', error }                       // Error occurred
  | { type: 'done' }                               // Turn complete
```

The CLI UI subscribes to these events and renders them in real-time.

---

## 🎯 Key Component Relationships

### 1. Core ↔ CLI Relationship

**Pattern:** CLI is a thin UI layer over the core engine.

```typescript
// packages/cli/src/core/index.ts (simplified)
import { GeminiClient } from '@google/gemini-cli-core'

async function main() {
  // CLI creates and configures the core client
  const config = loadConfig()
  const client = new GeminiClient(config)
  await client.initialize()

  // UI subscribes to events from the core
  for await (const event of client.sendMessageStream(userInput)) {
    // Render event in terminal UI
    renderEvent(event)
  }
}
```

**Key Insight:** The CLI never contains business logic. All AI agent logic lives in **core**.

---

### 2. ToolRegistry ↔ Individual Tools

**Pattern:** Registry pattern with dynamic tool registration.

```typescript
// packages/core/src/tools/tool-registry.ts
class ToolRegistry {
  private tools = new Map<string, Tool>()

  register(tool: Tool) {
    this.tools.set(tool.name, tool)
  }

  getFunctionDeclarations(): FunctionDeclaration[] {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }))
  }

  async executeTool(name: string, params: unknown): Promise<ToolResult> {
    const tool = this.tools.get(name)
    if (!tool) throw new Error(`Tool not found: ${name}`)

    return await tool.execute(params)
  }
}

// Individual tools implement the Tool interface
// packages/core/src/tools/read-file.ts
class ReadFileTool extends BaseDeclarativeTool {
  name = 'read_file'
  description = 'Reads file contents'
  parameters = { /* JSON schema */ }

  async execute(params: { file_path: string }) {
    // Implementation
    return { result: fileContents }
  }
}

// Registration at startup
toolRegistry.register(new ReadFileTool())
toolRegistry.register(new WebFetchTool())
toolRegistry.register(new BashTool())
// ... etc
```

---

### 3. GeminiClient ↔ Services

**Pattern:** Service composition for cross-cutting concerns.

```typescript
// packages/core/src/core/client.ts
class GeminiClient {
  private compressionService: ChatCompressionService
  private loopDetectionService: LoopDetectionService
  private projectIndexService: ProjectIndexService

  async *sendMessageStream(request: string) {
    // Services augment the main agent loop

    // Check for infinite loops
    if (this.loopDetectionService.isLooping()) {
      yield { type: 'error', error: 'Loop detected' }
      return
    }

    // Compress history if needed
    if (this.compressionService.shouldCompress()) {
      await this.compressionService.compress(this.chat)
    }

    // Use project index for context
    const relevantFiles = this.projectIndexService.search(request)

    // Continue with main loop...
    for await (const event of this.chat.sendMessageStream(request)) {
      yield event
    }
  }
}
```

**Services Responsibilities:**
- **ChatCompressionService:** Context window management
- **LoopDetectionService:** Prevent infinite tool loops
- **ProjectIndexService:** Fast code search and indexing

---

### 4. VS Code Extension ↔ Core (via MCP)

**Pattern:** Inter-process communication via Model Context Protocol.

```
┌─────────────────────┐         MCP Protocol          ┌──────────────┐
│ VS Code Extension   │ ◄─────────────────────────► │   CLI Core   │
│ (separate process)  │   JSON-RPC over stdio/HTTP   │  (MCP server)│
│                     │                               │              │
│ - UI integration    │   Request:                   │ - File ops   │
│ - Diff editor       │   read_file("path")          │ - Tools      │
│ - Commands          │                               │ - AI agent   │
│                     │   Response:                   │              │
│                     │   { content: "..." }          │              │
└─────────────────────┘                               └──────────────┘
```

**Why MCP?**
- **Decoupling:** Extension and CLI can be updated independently
- **Security:** Extension runs in VS Code sandbox, CLI has file system access
- **Flexibility:** MCP is a standard protocol, can integrate with other tools

---

## 📊 Data Flow Example: Investment Research

Let's trace a complete example: **"Analyze AAPL stock"**

### User Request

```
User types in CLI: "Analyze AAPL stock and give me a buy/hold/sell recommendation"
```

### Flow Through System

```
┌─────────────────────────────────────────────────────────────┐
│ 1. CLI UI (packages/cli/src/ui/components/)                 │
│    User input captured → sent to GeminiClient               │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. GeminiClient (packages/core/src/core/client.ts)          │
│    Initializes chat with:                                   │
│    • System prompt: "You are an investment analyst..."      │
│    • Tools: [fetch_stock_data, analyze_financials,          │
│              get_news_sentiment, calculate_indicators]      │
│    • History: [previous conversation]                       │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Send to Gemini API                                       │
│    Request includes:                                        │
│    {                                                        │
│      systemInstruction: "You are an expert...",             │
│      contents: [                                            │
│        { role: "user", parts: [{ text: "Analyze AAPL" }] }  │
│      ],                                                     │
│      tools: [{ functionDeclarations: [...] }]               │
│    }                                                        │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. LLM Response (Gemini reasons and decides)                │
│    {                                                        │
│      text: "Let me fetch the latest data for AAPL...",     │
│      functionCalls: [                                       │
│        {                                                    │
│          name: "fetch_stock_data",                          │
│          args: { ticker: "AAPL", timeframe: "1Y" }          │
│        },                                                   │
│        {                                                    │
│          name: "get_news_sentiment",                        │
│          args: { ticker: "AAPL", days: 30 }                 │
│        }                                                    │
│      ]                                                      │
│    }                                                        │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Turn.run() Processes Response                            │
│    • Streams text to UI: "Let me fetch the latest data..."  │
│    • Detects 2 function calls                               │
│    • Emits tool_call_request events                         │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. ToolRegistry Executes Tools (in parallel)                │
│                                                             │
│    Tool 1: fetch_stock_data                                 │
│    → Calls Alpha Vantage API                                │
│    → Returns: { price: 178.32, change: +2.3%,               │
│                 volume: 58.2M, marketCap: 2.8T, ... }       │
│                                                             │
│    Tool 2: get_news_sentiment                               │
│    → Scrapes recent news articles                           │
│    → Runs sentiment analysis                                │
│    → Returns: { sentiment: 0.72, articles: [...],           │
│                 summary: "Mostly positive coverage" }       │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. Results Sent Back to LLM                                 │
│    History updated with:                                    │
│    {                                                        │
│      role: "function",                                      │
│      parts: [                                               │
│        { functionResponse: {                                │
│          name: "fetch_stock_data",                          │
│          response: { price: 178.32, ... }                   │
│        }},                                                  │
│        { functionResponse: {                                │
│          name: "get_news_sentiment",                        │
│          response: { sentiment: 0.72, ... }                 │
│        }}                                                   │
│      ]                                                      │
│    }                                                        │
│    → Loop back to step 3                                    │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│ 8. LLM Analyzes Results (Second Turn)                       │
│    {                                                        │
│      text: "Based on the data:                              │
│             - Current price: $178.32 (+2.3%)                │
│             - News sentiment: Positive (0.72)               │
│             - Technical indicators suggest...               │
│                                                             │
│             However, I need more financial data...",        │
│      functionCalls: [                                       │
│        {                                                    │
│          name: "analyze_financials",                        │
│          args: { ticker: "AAPL", metrics: ["PE", "EPS"] }   │
│        }                                                    │
│      ]                                                      │
│    }                                                        │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
        (Steps 6-7 repeat)
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│ 9. Final Response (No More Function Calls)                  │
│    {                                                        │
│      text: "**Investment Analysis for AAPL**                │
│                                                             │
│             **Recommendation: BUY**                         │
│                                                             │
│             Reasoning:                                      │
│             1. Strong fundamentals (PE: 28.5, EPS: $6.42)   │
│             2. Positive news sentiment (0.72)               │
│             3. Upward price momentum (+2.3% today)          │
│             4. Solid market position                        │
│                                                             │
│             Risks:                                          │
│             - High valuation compared to sector             │
│             - Regulatory scrutiny increasing                │
│                                                             │
│             Target price: $195 (12-month horizon)"          │
│    }                                                        │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│ 10. CLI UI Renders Final Response                           │
│     Terminal displays formatted analysis with:              │
│     • Syntax highlighting                                   │
│     • Structured sections                                   │
│     • Charts (if terminal supports)                         │
└─────────────────────────────────────────────────────────────┘
```

### Tool Execution Details

During step 6, here's what happens inside a tool:

```typescript
// packages/core/src/tools/investment/fetch-stock-data.ts (hypothetical)
export class FetchStockDataTool extends BaseDeclarativeTool {
  name = 'fetch_stock_data'
  description = 'Fetches current stock price and market data'

  parameters = {
    type: 'object',
    properties: {
      ticker: { type: 'string', description: 'Stock ticker symbol (e.g., AAPL)' },
      timeframe: { type: 'string', description: 'Timeframe for data (1D, 1M, 1Y)' }
    },
    required: ['ticker']
  }

  async execute(params: { ticker: string; timeframe?: string }) {
    try {
      // Call external API (Alpha Vantage, Yahoo Finance, etc.)
      const response = await fetch(
        `https://api.example.com/stock/${params.ticker}?timeframe=${params.timeframe}`
      )
      const data = await response.json()

      // Transform and return
      return {
        result: {
          ticker: params.ticker,
          price: data.price,
          change: data.change_percent,
          volume: data.volume,
          marketCap: data.market_cap,
          dayHigh: data.high,
          dayLow: data.low,
          fiftyTwoWeekHigh: data.week_52_high,
          fiftyTwoWeekLow: data.week_52_low
        }
      }
    } catch (error) {
      // Error handling with retry logic
      return {
        error: `Failed to fetch data for ${params.ticker}: ${error.message}`
      }
    }
  }
}
```

---

## 💡 Building Your Investment Research Agent

### Strategy 1: Extend Existing Codebase

Add custom tools to `packages/core/src/tools/`:

```
packages/core/src/tools/
├── ... (existing tools)
├── investment/                    ← NEW FOLDER
│   ├── fetch-stock-data.ts
│   ├── analyze-financials.ts
│   ├── get-news-sentiment.ts
│   ├── calculate-indicators.ts
│   └── compare-stocks.ts
└── index.ts (export all tools)
```

**Steps:**
1. Create tool classes implementing `BaseDeclarativeTool`
2. Register tools in `ToolRegistry` at startup
3. Customize system prompt in `prompts.ts`
4. Build and test with existing CLI

---

### Strategy 2: Create Standalone Package

Build a new package that uses **core** as a library:

```
my-investment-agent/
├── src/
│   ├── tools/              → Custom investment tools
│   ├── prompts/            → Investment-specific prompts
│   ├── api/                → Web API or CLI interface
│   └── index.ts            → Main entry point
├── package.json
│   dependencies:
│     "@google/gemini-cli-core": "^0.17.0"
└── ...
```

**Benefits:**
- Independent deployment
- Custom UI (web dashboard, mobile app, etc.)
- Focused on investment domain
- Can still contribute tools back to Gemini CLI

---

### Example: Minimal Investment Agent

```typescript
// my-investment-agent/src/index.ts
import { GeminiClient, ToolRegistry, BaseDeclarativeTool } from '@google/gemini-cli-core'

// 1. Define investment tools
class StockDataTool extends BaseDeclarativeTool {
  name = 'fetch_stock_data'
  description = 'Fetches current stock price and market data'
  parameters = { /* schema */ }

  async execute(params: { ticker: string }) {
    // Call Alpha Vantage, Yahoo Finance, etc.
    const data = await fetchStockData(params.ticker)
    return { result: data }
  }
}

class NewsAnalysisTool extends BaseDeclarativeTool {
  name = 'get_news_sentiment'
  description = 'Analyzes recent news sentiment for a stock'
  parameters = { /* schema */ }

  async execute(params: { ticker: string, days: number }) {
    // Fetch news and analyze sentiment
    const sentiment = await analyzeNewsSentiment(params.ticker, params.days)
    return { result: sentiment }
  }
}

// 2. Create orchestrator
class InvestmentResearchAgent {
  private client: GeminiClient
  private toolRegistry: ToolRegistry

  async initialize() {
    // Register tools
    this.toolRegistry = new ToolRegistry()
    this.toolRegistry.register(new StockDataTool())
    this.toolRegistry.register(new NewsAnalysisTool())

    // Configure client with custom system prompt
    const config = {
      systemPrompt: `You are an expert investment research analyst.
        Your role is to analyze stocks and provide data-driven recommendations.
        Always cite your sources and explain your reasoning.`,
      toolRegistry: this.toolRegistry,
      model: 'gemini-2.5-pro'
    }

    this.client = new GeminiClient(config)
    await this.client.initialize()
  }

  async *analyzeStock(ticker: string) {
    const prompt = `Analyze ${ticker} stock and provide a buy/hold/sell recommendation
                    based on fundamentals, technicals, and news sentiment.`

    // Stream responses
    for await (const event of this.client.sendMessageStream(prompt)) {
      yield event
    }
  }
}

// 3. Use it
const agent = new InvestmentResearchAgent()
await agent.initialize()

console.log(`Analyzing AAPL...`)
for await (const event of agent.analyzeStock('AAPL')) {
  if (event.type === 'content') {
    process.stdout.write(event.text)
  }
}
```

---

## 🎓 Key Architectural Patterns

### 1. **Separation of Concerns**

- **Core** = Business logic (AI agent engine)
- **CLI** = Presentation layer (terminal UI)
- **A2A Server** = API layer (HTTP interface)
- **VS Code Extension** = Integration layer (IDE features)

### 2. **Dependency Inversion**

Tools don't know about the agent. Agent doesn't know about the UI. Communication via events and interfaces.

### 3. **Registry Pattern**

`ToolRegistry` allows dynamic tool discovery and execution without hardcoding dependencies.

### 4. **Event Streaming**

Async generators (`AsyncGenerator`) enable real-time streaming of responses.

### 5. **Service Composition**

Cross-cutting concerns (compression, loop detection, indexing) implemented as composable services.

---

## 🚀 Learning Roadmap Recap

Your learning guide already mapped out the perfect path. Here it is with exact file locations:

### Phase 1: Core Agent Loop ⭐⭐⭐
1. `packages/core/src/core/client.ts:419` - `sendMessageStream()` method
2. `packages/core/src/core/turn.ts:236` - `run()` method
3. `packages/core/src/core/geminiChat.ts:239` - `sendMessageStream()` method

### Phase 2: Tool System ⭐⭐⭐
4. `packages/core/src/tools/tools.ts` - Base tool classes and interfaces
5. `packages/core/src/tools/tool-registry.ts` - Tool management
6. `packages/core/src/tools/read-file.ts` - Example tool implementation
7. `packages/core/src/tools/web-fetch.ts` - Another example tool

### Phase 3: System Design ⭐⭐
8. `packages/core/src/core/prompts.ts` - System prompt construction
9. `packages/core/src/core/contentGenerator.ts` - API abstraction
10. `packages/core/src/config/config.ts` - Configuration patterns

### Phase 4: Production Features ⭐
11. `packages/core/src/utils/retry.ts` - Retry logic
12. `packages/core/src/services/chatCompressionService.ts` - Context management
13. `packages/core/src/services/loopDetectionService.ts` - Loop prevention

### Phase 5: UI (Optional)
14. `packages/cli/src/ui/components/` - Terminal UI components
15. `packages/cli/src/ui/noninteractive/` - Headless mode

---

## 📖 Quick Reference

### Most Important Files

| File | Purpose | Priority |
|------|---------|----------|
| `packages/core/src/core/client.ts` | Main orchestrator | ⭐⭐⭐ |
| `packages/core/src/core/turn.ts` | Loop iteration | ⭐⭐⭐ |
| `packages/core/src/tools/tool-registry.ts` | Tool management | ⭐⭐⭐ |
| `packages/core/src/tools/tools.ts` | Tool base classes | ⭐⭐⭐ |
| `packages/core/src/core/prompts.ts` | Prompt construction | ⭐⭐ |
| `packages/core/src/core/geminiChat.ts` | History management | ⭐⭐ |
| `packages/core/src/config/config.ts` | Configuration | ⭐⭐ |

### Package Entry Points

| Package | Entry Point |
|---------|-------------|
| **core** | `packages/core/src/index.ts` |
| **cli** | `packages/cli/src/index.ts` |
| **a2a-server** | `packages/a2a-server/src/http/server.ts` |
| **vscode-ide-companion** | `packages/vscode-ide-companion/src/extension.ts` |

---

## 🎯 Summary

### What Makes This Architecture Powerful

1. **Agentic Loop:** LLM can call tools, see results, reason, and call more tools autonomously
2. **Streaming:** Real-time responses via async generators (don't wait for completion)
3. **Tool Abstraction:** Easy to add new capabilities without modifying core logic
4. **Error Recovery:** Automatic retries, fallbacks, validation built-in
5. **Context Management:** Automatic compression when context window fills
6. **Production-Ready:** Logging, telemetry, policy enforcement, security
7. **Extensible:** MCP support, custom tools, multiple interfaces

### For Investment Research

- **Data Tools:** Stock prices, financials, news, SEC filings, market data
- **Analysis Tools:** Technical indicators, DCF models, peer comparisons
- **Reasoning:** LLM chains tools together intelligently (fetch → analyze → summarize)
- **Real-time:** Stream results as analysis progresses
- **Reliable:** Retry failed API calls, handle rate limits gracefully

---

## 🔗 Related Documentation

- [Building an Investment Research AI Agent - Learning Guide](./building-ai-agent-guide.md) - Detailed learning roadmap
- [Official Gemini CLI Documentation](../docs/) - Full documentation
- [MCP Integration Guide](../docs/tools/mcp-server.md) - Extending with MCP
- [Tools API Development](../docs/core/tools-api.md) - Creating custom tools

---

*Now you have a complete map of the Gemini CLI architecture. Start with the Phase 1 files and build incrementally. Good luck building your investment research agent!*
