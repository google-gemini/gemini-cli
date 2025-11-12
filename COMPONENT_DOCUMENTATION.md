# Gemini CLI - Comprehensive Component Documentation

This document provides detailed descriptive information about the major components in the Gemini CLI codebase, their responsibilities, key properties, methods, and integration points.

---

## Table of Contents

1. [Core Components](#core-components)
2. [UI Components](#ui-components)
3. [Service Layer](#service-layer)
4. [Infrastructure Components](#infrastructure-components)
5. [Integration Components](#integration-components)

---

## Core Components

### GeminiClient

**Location:** `/packages/core/src/core/client.ts`

**Purpose:** The main orchestrator for Gemini API interactions, managing chat sessions, model routing, context compression, and the overall conversation lifecycle.

**Key Properties:**
- `chat?: GeminiChat` - Current chat session instance
- `generateContentConfig` - Configuration for content generation (temperature, topP)
- `sessionTurnCount` - Number of turns in the current session
- `loopDetector: LoopDetectionService` - Prevents infinite loops in conversations
- `compressionService: ChatCompressionService` - Manages context window compression
- `currentSequenceModel: string | null` - Model currently being used in a sequence
- `lastSentIdeContext: IdeContext | undefined` - Last IDE context sent to avoid redundancy
- `hasFailedCompressionAttempt: boolean` - Tracks compression failures

**Important Methods:**
- `initialize()` - Initializes the chat session
- `sendMessageStream()` - Main method for sending messages and receiving streamed responses; handles:
  - Loop detection
  - Context window overflow checking
  - Compression when needed
  - Model routing/stickiness
  - IDE context updates
  - Next speaker checks
- `startChat()` - Creates a new GeminiChat instance with tools and system instructions
- `tryCompressChat()` - Attempts to compress the chat history when context window fills up
- `generateContent()` - Generates content via API for non-streaming scenarios
- `setTools()` - Updates the tool declarations available to the model
- `resetChat()` - Resets the current chat session
- `resumeChat()` - Resumes from saved session data

**Integration Points:**
- Uses `GeminiChat` for low-level API communication
- Integrates with `LoopDetectionService` to prevent infinite loops
- Uses `ChatCompressionService` to compress context when needed
- Communicates through `ContentGenerator` for API calls
- Sends events via telemetry system
- Works with `ModelRouterService` for model selection

**Usage Example:**
```typescript
const client = new GeminiClient(config);
await client.initialize();

for await (const event of client.sendMessageStream(
  request,
  signal,
  promptId
)) {
  // Process streaming events
}
```

---

### GeminiChat

**Location:** `/packages/core/src/core/geminiChat.ts`

**Purpose:** Low-level API communication layer that wraps the Gemini API, handles retries, validates responses, and manages conversation history.

**Key Properties:**
- `history: Content[]` - Complete conversation history
- `generationConfig: GenerateContentConfig` - Model configuration
- `sendPromise: Promise<void>` - Ensures sequential message sending
- `chatRecordingService: ChatRecordingService` - Records conversations to disk
- `lastPromptTokenCount: number` - Token count from last request

**Important Methods:**
- `sendMessageStream()` - Sends a message and returns streaming response with:
  - Automatic retry on invalid content
  - Temperature adjustment on retries
  - Content validation
  - Recording of user messages and model responses
- `getHistory(curated)` - Returns conversation history (curated removes invalid turns)
- `addHistory()` - Adds content to history
- `setHistory()` - Replaces entire history
- `stripThoughtsFromHistory()` - Removes thought signatures from history
- `recordCompletedToolCalls()` - Records tool execution results
- `maybeIncludeSchemaDepthContext()` - Adds helpful context for schema errors

**Integration Points:**
- Uses `ContentGenerator` for API calls
- Integrates with `ChatRecordingService` for persistence
- Uses retry logic with exponential backoff
- Validates all streaming responses
- Handles fallback mode via config

**Key Features:**
- Automatic retry on invalid/empty responses (up to 2 attempts)
- Temperature increase on retries to get different outputs
- Comprehensive history validation
- Thought extraction and recording
- Token usage tracking

---

### CoreToolScheduler

**Location:** `/packages/core/src/core/coreToolScheduler.ts`

**Purpose:** Sequential tool execution engine that validates, schedules, confirms, and executes tool calls from the model.

**Key Properties:**
- `toolCalls: ToolCall[]` - Currently active tool call (max 1 at a time)
- `toolCallQueue: ToolCall[]` - Queue of pending tool calls
- `completedToolCallsForBatch: CompletedToolCall[]` - Completed tools in current batch
- `requestQueue` - Queue of batched tool call requests
- `config: Config` - Global configuration
- `messageBus?: MessageBus` - For policy-driven confirmations

**Tool Call States:**
- `validating` - Checking if tool call needs confirmation
- `awaiting_approval` - Waiting for user approval
- `scheduled` - Approved and ready to execute
- `executing` - Currently running
- `success` - Completed successfully
- `error` - Failed with error
- `cancelled` - User cancelled

**Important Methods:**
- `schedule()` - Queues tool call requests for execution
- `_processNextInQueue()` - Processes tool calls sequentially from queue
- `handleConfirmationResponse()` - Handles user approval/rejection/modification
- `attemptExecutionOfScheduledCalls()` - Executes approved tool calls
- `cancelAll()` - Cancels all pending and active tool calls
- `truncateAndSaveToFile()` - Handles large tool outputs
- `isAutoApproved()` - Checks if tool is on allow-list

**Integration Points:**
- Uses `ToolRegistry` to resolve tool definitions
- Integrates with `MessageBus` for policy-based confirmations
- Emits events to update handlers
- Supports editor modifications for tools
- Works with shell execution service

**Key Features:**
- Sequential execution (only 1 tool executes at a time)
- User confirmation for potentially dangerous operations
- Tool output truncation for large results
- Live output streaming support
- Editor-based modification of tool parameters before execution
- Fuzzy matching for tool name suggestions when tool not found

---

### AgentExecutor

**Location:** `/packages/core/src/agents/executor.ts`

**Purpose:** Implements the agentic loop for autonomous agents, managing multi-turn interactions, tool calls, and task completion.

**Key Properties:**
- `definition: AgentDefinition` - Agent configuration
- `agentId: string` - Unique identifier for this agent run
- `toolRegistry: ToolRegistry` - Isolated tools for this agent
- `runtimeContext: Config` - Global configuration
- `compressionService: ChatCompressionService` - Manages context compression
- `hasFailedCompressionAttempt: boolean` - Tracks compression state

**Important Methods:**
- `create()` - Static factory method that validates tools before creating executor
- `run()` - Main execution loop that:
  - Manages timeouts and turn limits
  - Executes turns until completion or limit reached
  - Handles recovery attempts when limits are hit
  - Processes tool calls
  - Validates output against schema
- `executeTurn()` - Executes a single agent turn (call model → process tool calls)
- `executeFinalWarningTurn()` - Final recovery attempt when agent hits limits
- `callModel()` - Calls the model with context and tools
- `processFunctionCalls()` - Executes tool calls requested by model
- `prepareToolsList()` - Builds tool declarations including mandatory `complete_task`

**Termination Modes:**
- `GOAL` - Task completed successfully
- `TIMEOUT` - Exceeded time limit
- `MAX_TURNS` - Exceeded turn limit
- `ABORTED` - User cancelled
- `ERROR` - Protocol violation or unhandled error

**Integration Points:**
- Uses `GeminiChat` for model communication
- Integrates with `ToolRegistry` for tool execution
- Emits activity events for monitoring
- Uses telemetry for logging
- Executes tools via non-interactive executor

**Key Features:**
- Non-interactive execution (no user prompts)
- Mandatory `complete_task` tool for termination
- Automatic recovery attempts when hitting limits
- Output validation via Zod schemas
- Parallel tool execution
- Context compression when needed
- Timeout and turn limit enforcement

---

### ContentGenerator

**Location:** `/packages/core/src/core/contentGenerator.ts`

**Purpose:** Abstract interface for generating content from various backends (Google GenAI SDK, Code Assist, fake responses).

**Interface:**
```typescript
interface ContentGenerator {
  generateContent(request, userPromptId): Promise<GenerateContentResponse>
  generateContentStream(request, userPromptId): Promise<AsyncGenerator>
  countTokens(request): Promise<CountTokensResponse>
  embedContent(request): Promise<EmbedContentResponse>
  userTier?: UserTierId
}
```

**Authentication Types:**
- `LOGIN_WITH_GOOGLE` - OAuth personal account
- `USE_GEMINI` - Gemini API key
- `USE_VERTEX_AI` - Vertex AI
- `CLOUD_SHELL` - Cloud Shell authentication

**Implementations:**
- `LoggingContentGenerator` - Wraps generators with logging
- `RecordingContentGenerator` - Records responses for replay
- `FakeContentGenerator` - Returns pre-recorded responses for testing
- Code Assist generator - Production OAuth implementation

**Integration Points:**
- Used by all components needing LLM access
- Configured via `Config` object
- Supports multiple authentication methods
- Can be wrapped for logging/recording

**Key Features:**
- Authentication abstraction
- Streaming and non-streaming support
- Token counting
- Embedding generation
- User tier information
- Proxy support
- Custom headers (user agent, installation ID)

---

### Config

**Location:** `/packages/core/src/config/config.ts`

**Purpose:** Central configuration manager providing global settings, service instances, and runtime state for the entire application.

**Key Properties:**
```typescript
private toolRegistry: ToolRegistry
private promptRegistry: PromptRegistry
private agentRegistry: AgentRegistry
private geminiClient: GeminiClient
private baseLlmClient: BaseLlmClient
private modelRouterService: ModelRouterService
private contentGenerator: ContentGenerator
private messageBus: MessageBus
private policyEngine: PolicyEngine
readonly modelConfigService: ModelConfigService
readonly storage: Storage
```

**Important Configuration:**
- Model selection and fallback state
- Tool allow/exclude lists
- MCP server configurations
- Extension loading
- File filtering options
- Compression settings
- Shell execution config
- Telemetry settings
- Sandbox configuration
- IDE integration state

**Important Methods:**
- `initialize()` - Initializes all services (must be called once)
- `refreshAuth()` - Switches authentication method
- `createToolRegistry()` - Creates and populates tool registry
- `getCompressionThreshold()` - Gets compression threshold from settings or experiments
- `getUserCaching()` - Gets caching setting from experiments
- Service getters: `getGeminiClient()`, `getToolRegistry()`, `getModelRouterService()`, etc.

**Integration Points:**
- Central dependency injection point
- Manages lifecycle of all major services
- Provides access to all registries
- Handles settings from multiple scopes
- Integrates with file system, git, IDE

**Key Features:**
- Lazy initialization of services
- Dynamic configuration updates
- Extension management
- Folder trust system
- Multi-scope settings (user, workspace, project)
- Experiment flag integration
- Comprehensive tool filtering
- Model fallback handling

---

## UI Components

### React/Ink Architecture

**Location:** `/packages/cli/src/ui/`

**Purpose:** Terminal-based UI using React and Ink library to render interactive components in the terminal.

**Key Technologies:**
- **React** - Component-based UI framework
- **Ink** - React renderer for terminal UIs
- **Contexts** - State management across components
- **Hooks** - Reusable logic

### Core Contexts

#### AppContext
**Purpose:** Provides version and startup warnings to all components

**Properties:**
- `version: string` - CLI version
- `startupWarnings: string[]` - Warnings to display on startup

#### UIStateContext
**Purpose:** Central state store for all UI state

**Key State:**
- History items and managers
- Dialog visibility states
- Authentication state
- Streaming state
- Buffer and input state
- Terminal dimensions
- IDE context
- Loading indicators
- Session statistics

#### UIActionsContext
**Purpose:** Action dispatchers for UI events

**Key Actions:**
- `handleThemeSelect()` - Change theme
- `handleAuthSelect()` - Change authentication
- `handleFinalSubmit()` - Submit user input
- `handleClearScreen()` - Clear terminal
- `vimHandleInput()` - Handle vim mode input
- Various dialog open/close actions

#### ConfigContext
**Purpose:** Provides access to Config instance throughout UI

#### ShellFocusContext
**Purpose:** Tracks if terminal window is focused

#### VimModeContext
**Purpose:** Manages Vim mode state and keybindings

---

### AppContainer

**Location:** `/packages/cli/src/ui/AppContainer.tsx`

**Purpose:** Root container that manages all application state, hooks, and context providers.

**Responsibilities:**
- Initializes config and services
- Manages all dialogs (auth, theme, settings, editor, etc.)
- Handles keyboard shortcuts
- Updates terminal title
- Manages message queue
- Coordinates between UI and core logic
- Handles session resume
- Manages folder trust
- Integrates with IDE

**Key Hooks Used:**
- `useHistory()` - History management
- `useGeminiStream()` - LLM streaming
- `useSlashCommandProcessor()` - Command handling
- `useTerminalSize()` - Terminal dimensions
- `useMemoryMonitor()` - Memory usage tracking
- `useLoadingIndicator()` - Loading states
- `useSessionResume()` - Session restoration
- `useSettings()` - Settings management

**Key Features:**
- Global keyboard handling (Ctrl+C, Ctrl+D, F12, etc.)
- Window title updates with status
- Copy mode support
- Debug profiler integration
- Extension management UI
- Auto-accept indicator
- Queue error handling

---

### Important Hooks

#### useGeminiStream
**Purpose:** Manages interaction with GeminiClient, streaming responses, and tool execution

**Responsibilities:**
- Submits queries to LLM
- Processes streaming events
- Manages tool confirmations
- Handles approval mode changes
- Tracks active PTY processes
- Manages loop detection

#### useHistoryManager
**Purpose:** Manages conversation history state

**Methods:**
- `addItem()` - Add history item
- `clearItems()` - Clear history
- `loadHistory()` - Load from saved session
- `replaceItem()` - Update existing item

#### useSlashCommandProcessor
**Purpose:** Parses and executes slash commands

**Features:**
- Command parsing and validation
- Auto-completion
- MCP prompt integration
- Built-in command handling
- Extension command discovery
- Confirmation dialogs for destructive commands

#### useReactToolScheduler
**Purpose:** React wrapper around CoreToolScheduler

**Features:**
- Tool call state management
- Confirmation UI coordination
- Live output updates
- Progress tracking

#### useTextBuffer
**Purpose:** Manages text input buffer with vim support

**Features:**
- Multi-line editing
- Cursor management
- File path validation
- Shell mode integration
- Undo/redo support

---

### Layout Components

#### InputPrompt
**Purpose:** Main user input area with auto-completion

**Features:**
- Multi-line input
- Command suggestions
- File path completion
- Slash command hints
- Vim mode support
- Syntax highlighting

#### HistoryView
**Purpose:** Renders conversation history

**Features:**
- Message rendering (user, assistant, tool, system)
- Markdown rendering
- Code syntax highlighting
- Thought display
- Tool call visualization
- Error display
- Streaming updates

#### StatusBar
**Purpose:** Bottom status bar with context info

**Displays:**
- Current model
- Branch name
- Context file count
- Memory usage
- Session stats
- User tier
- IDE connection status

---

## Service Layer

### ChatRecordingService

**Location:** `/packages/core/src/services/chatRecordingService.ts`

**Purpose:** Automatically records all conversations to disk in JSON format for later analysis and session resumption.

**Key Features:**
- Automatic session file creation
- Records all messages (user, assistant, thoughts, tool calls)
- Token usage tracking
- Metadata enrichment from ToolRegistry
- Session resumption support

**Storage Structure:**
```
~/.gemini/tmp/<project_hash>/chats/
  session-2025-01-11T14-30-abc123.json
```

**Record Format:**
```typescript
{
  sessionId: string
  projectHash: string
  startTime: string
  lastUpdated: string
  messages: [
    {
      id: string
      timestamp: string
      type: 'user' | 'gemini'
      content: PartListUnion
      thoughts?: ThoughtSummary[]
      toolCalls?: ToolCallRecord[]
      tokens?: TokensSummary
      model?: string
    }
  ]
}
```

**Integration Points:**
- Used by GeminiChat to record all interactions
- Provides data for session browser
- Enables conversation replay

---

### ChatCompressionService

**Location:** `/packages/core/src/services/chatCompressionService.ts`

**Purpose:** Compresses chat history when approaching context window limits by summarizing older messages.

**Key Configuration:**
- `DEFAULT_COMPRESSION_TOKEN_THRESHOLD` - 0.2 (compress at 20% of limit)
- `COMPRESSION_PRESERVE_THRESHOLD` - 0.3 (keep last 30% of history)

**Compression Strategy:**
1. Identifies split point (preserves recent 30% of conversation)
2. Sends older portion to model for summarization
3. Replaces old content with summary
4. Validates new token count doesn't exceed original

**Important Methods:**
- `compress()` - Main compression method
- `findCompressSplitPoint()` - Determines where to split history

**Integration Points:**
- Used by GeminiClient before each turn
- Works with ContentGenerator for summarization
- Logs telemetry events

**Failure Handling:**
- Won't compress if summary is larger than original
- Tracks failed attempts to avoid retry loops
- Can be forced via parameter

---

### FileDiscoveryService

**Location:** `/packages/core/src/services/fileDiscoveryService.ts`

**Purpose:** Discovers and indexes files in the workspace for tools to access.

**Features:**
- Recursive file scanning
- Respects .gitignore and .geminiignore
- File filtering by extension
- Directory depth limiting
- Fuzzy file searching

**Integration Points:**
- Used by Read, Glob, and other file tools
- Respects Config file filtering settings
- Integrates with FileExclusions

---

### GitService

**Location:** `/packages/core/src/services/gitService.ts`

**Purpose:** Git operations for checkpointing and workspace state management.

**Features:**
- Branch detection
- Commit creation
- Status checking
- Working tree validation
- Checkpoint management

**Integration Points:**
- Used when checkpointing is enabled
- Provides branch name for UI
- Used by status display

---

### ShellExecutionService

**Location:** `/packages/core/src/services/shellExecutionService.ts`

**Purpose:** Centralized service for executing shell commands with cross-platform support, PTY integration, and output streaming.

**Execution Methods:**
1. **PTY (node-pty or @lydell/node-pty)** - Full terminal emulation with ANSI support
2. **child_process** - Fallback when PTY unavailable

**Key Features:**
- Binary detection and handling
- Live output streaming
- ANSI color support via headless terminal
- Process group management
- Graceful termination (SIGTERM → SIGKILL)
- Output truncation for large results
- PTY resize support
- Scrollback support

**Important Methods:**
- `execute()` - Main execution method
- `writeToPty()` - Send input to running PTY
- `resizePty()` - Resize terminal dimensions
- `scrollPty()` - Scroll terminal viewport

**Integration Points:**
- Used by Shell tool for command execution
- Supports interactive shell mode
- Integrates with Config for terminal dimensions
- Emits structured output events

**Output Events:**
```typescript
type ShellOutputEvent =
  | { type: 'data', chunk: string | AnsiOutput }
  | { type: 'binary_detected' }
  | { type: 'binary_progress', bytesReceived: number }
```

---

### LoopDetectionService

**Location:** `/packages/core/src/services/loopDetectionService.ts`

**Purpose:** Detects when the agent is stuck in repetitive behavior and prompts for intervention.

**Detection Mechanisms:**
- Repeated identical tool calls
- Similar text generation patterns
- Time-based thresholds
- Event sequence analysis

**Integration Points:**
- Called by GeminiClient on each streaming event
- Triggers confirmation dialog when loop detected
- Can be reset per prompt

---

### ModelConfigService

**Location:** `/packages/core/src/services/modelConfigService.ts`

**Purpose:** Manages model configurations, aliases, and generation settings.

**Features:**
- Model aliasing (e.g., "auto" → actual model)
- Per-model configuration
- Generation config overrides
- Default settings management

**Integration Points:**
- Used by GeminiClient for model selection
- Supports model router decisions
- Provides model-specific settings

---

## Infrastructure Components

### ToolRegistry

**Location:** `/packages/core/src/tools/tool-registry.ts`

**Purpose:** Central registry for all tools (built-in, discovered, MCP) with filtering and lifecycle management.

**Key Responsibilities:**
- Tool registration and discovery
- Tool filtering (exclude/allow lists)
- Tool sorting and organization
- MCP tool management
- Discovered tool wrapping

**Tool Types:**
1. **Built-in Tools** - Core tools (Read, Write, Shell, etc.)
2. **Discovered Tools** - From tool discovery command
3. **MCP Tools** - From MCP servers

**Important Methods:**
- `registerTool()` - Register a tool
- `discoverAllTools()` - Discover tools from command/MCP
- `getFunctionDeclarations()` - Get active tool schemas for LLM
- `getTool()` - Retrieve specific tool
- `getAllTools()` - Get all active tools
- `removeMcpToolsByServer()` - Remove server's tools
- `sortTools()` - Order tools (built-in → discovered → MCP)

**Integration Points:**
- Used by Config to build initial registry
- Used by CoreToolScheduler to execute tools
- Updated when extensions load/unload
- Filtered based on Config settings

**Tool Filtering:**
- Tools can be excluded globally
- Tools can be allowed via allow-list
- MCP servers can be blocked
- Extensions can exclude tools

---

### AgentRegistry

**Location:** `/packages/core/src/agents/registry.ts`

**Purpose:** Manages discovery and registration of agent definitions.

**Built-in Agents:**
- **Codebase Investigator** - Autonomous codebase exploration agent

**Features:**
- Agent definition validation
- Agent enable/disable via settings
- Dynamic configuration from settings
- Agent discovery (future: extension-provided agents)

**Integration Points:**
- Initialized during Config setup
- Used to create SubagentToolWrapper
- Configured via Config settings

---

### PolicyEngine

**Location:** `/packages/core/src/policy/policy-engine.ts`

**Purpose:** Rule-based system for automatically approving/denying tool calls based on policies.

**Policy Decisions:**
- `ALLOW` - Auto-approve tool call
- `DENY` - Auto-reject tool call
- `ASK_USER` - Show confirmation dialog

**Rule Matching:**
```typescript
{
  toolName: string | pattern        // e.g., "server__*" for wildcards
  argsPattern?: RegExp               // Match against JSON args
  decision: PolicyDecision
  priority?: number                  // Higher priority = checked first
}
```

**Features:**
- Priority-based rule matching
- Regex pattern matching on args
- Wildcard tool name support
- Server name validation
- Non-interactive mode handling

**Integration Points:**
- Used by MessageBus for tool confirmations
- Can be configured per-server (MCP)
- Used by hooks for custom policies

---

### MessageBus

**Location:** `/packages/core/src/confirmation-bus/message-bus.ts`

**Purpose:** Event-driven communication bus for tool confirmations and policy decisions.

**Message Types:**
- `TOOL_CONFIRMATION_REQUEST` - Tool wants to execute
- `TOOL_CONFIRMATION_RESPONSE` - Approval/denial response
- `TOOL_POLICY_REJECTION` - Policy denied tool

**Flow:**
1. Tool publishes CONFIRMATION_REQUEST
2. MessageBus checks PolicyEngine
3. Based on decision:
   - ALLOW → Auto-approves
   - DENY → Sends rejection + response
   - ASK_USER → Forwards to UI

**Integration Points:**
- Used by MCP tools for confirmations
- Integrates with PolicyEngine
- Can be subscribed to by hooks
- Enables policy-based automation

---

### ModelRouterService

**Location:** `/packages/core/src/routing/modelRouterService.ts`

**Purpose:** Intelligent model selection using composable routing strategies.

**Routing Strategies (in priority order):**
1. **FallbackStrategy** - Use fallback model if in fallback mode
2. **OverrideStrategy** - Use explicitly set model override
3. **ClassifierStrategy** - Use LLM to classify and route
4. **DefaultStrategy** - Use configured default model

**Routing Process:**
1. GeminiClient calls `route()` with context
2. Strategies evaluated in priority order
3. First strategy to return decision wins
4. Decision logged to telemetry

**Routing Context:**
```typescript
{
  history: Content[]      // Conversation history
  request: PartListUnion  // Current request
  signal: AbortSignal     // Cancellation signal
}
```

**Integration Points:**
- Used by GeminiClient for model selection
- Logs decisions to telemetry
- Cached per message sequence (model stickiness)

---

### ExtensionManager

**Location:** `/packages/cli/src/config/extension-manager.ts`

**Purpose:** Manages lifecycle of extensions including loading, activation, updates, and uninstallation.

**Features:**
- Extension discovery
- Version checking
- Auto-updates (with user consent)
- Dependency resolution
- Extension isolation
- Settings injection

**Extension Structure:**
```
<extension-dir>/
  gemini.extension.json   # Manifest
  commands/              # Slash commands
  context/              # Context files
  agents/               # Agent definitions
```

**Integration Points:**
- Loaded during Config initialization
- Provides commands to CommandService
- Provides context files
- Can register tools via MCP
- UI shows update notifications

---

## Integration Components

### MCP Client

**Location:** `/packages/core/src/tools/mcp-client.ts` and `/packages/core/src/tools/mcp-client-manager.ts`

**Purpose:** Model Context Protocol client for integrating external tools and resources.

**Features:**
- Multiple transport types (stdio, SSE, HTTP, WebSocket, TCP)
- OAuth support
- Service account impersonation
- Tool discovery from servers
- Resource access
- Prompt template support

**MCP Server Configuration:**
```typescript
{
  command?: string              // For stdio
  args?: string[]
  url?: string                 // For SSE
  httpUrl?: string             // For streamable HTTP
  tcp?: string                 // For WebSocket
  oauth?: MCPOAuthConfig       // OAuth settings
  targetAudience?: string      // Service account
  trust?: boolean              // Skip policy checks
  includeTools?: string[]      // Filter tools
  excludeTools?: string[]
}
```

**Integration Points:**
- Tools registered in ToolRegistry
- Managed by McpClientManager
- Can be filtered/blocked via Config
- Supports policy-based confirmations
- Extension-provided servers supported

**Key Features:**
- Server lifecycle management
- Reconnection handling
- Tool namespacing (server__toolname)
- Error handling and logging
- Timeout management

---

### OAuth Provider

**Location:** `/packages/core/src/mcp/oauth-provider.ts`

**Purpose:** Handles OAuth flows for MCP servers requiring authentication.

**Supported Flows:**
- Dynamic discovery (OIDC)
- Google credentials
- Service account impersonation

**Features:**
- Token storage and refresh
- Browser-based auth flows
- Token expiration handling
- Multiple provider support

**Integration Points:**
- Used by MCP client
- Stores tokens securely
- Handles token refresh automatically

---

### Telemetry System

**Location:** `/packages/core/src/telemetry/`

**Purpose:** Comprehensive logging and analytics system for usage tracking and debugging.

**Telemetry Events:**
- Tool calls and results
- Model routing decisions
- Chat compressions
- Agent executions
- Loop detections
- Extension operations
- Performance metrics

**Backends:**
- OpenTelemetry (OTLP)
- File logging
- Clearcut (Google internal)
- Console logging

**Key Components:**
- `uiTelemetryService` - UI-level metrics
- `loggers.ts` - Event emission functions
- `types.ts` - Event definitions

**Configuration:**
```typescript
{
  enabled: boolean
  target: 'otlp' | 'file'
  otlpEndpoint: string
  logPrompts: boolean
  outfile?: string
}
```

**Integration Points:**
- All major operations emit events
- Can be disabled via settings
- Respects privacy settings
- Used for debugging and analytics

---

### IDE Integration

**Location:** `/packages/core/src/ide/` and `/packages/vscode-ide-companion/`

**Purpose:** Bidirectional integration with IDEs (VS Code, Zed) for enhanced developer experience.

**IDE Client Features:**
- Connection management
- Context synchronization
- File operations
- Diff management
- Trust state handling

**IDE Context:**
```typescript
{
  workspaceState?: {
    openFiles: File[]
    isTrusted?: boolean
  }
}
```

**File Context:**
```typescript
{
  path: string
  isActive: boolean
  cursor?: { line: number, character: number }
  selectedText?: string
}
```

**Integration Points:**
- `ideContextStore` - Global context state
- GeminiClient sends context with each turn
- Delta updates to reduce token usage
- Tool confirmations can use IDE UI
- File edits can be applied via IDE

**VS Code Extension:**
- WebSocket server for communication
- Workspace monitoring
- Diff preview
- Open file tracking
- Selection tracking

**Features:**
- Editor context injection
- Smart context updates (only deltas)
- IDE-based confirmations
- File diff preview
- Trust state synchronization

---

## Summary

The Gemini CLI is built with a well-architected component system:

**Core Layer** handles the fundamental LLM interaction:
- `GeminiClient` orchestrates the conversation
- `GeminiChat` manages API communication
- `CoreToolScheduler` executes tools sequentially
- `AgentExecutor` runs autonomous agents
- `ContentGenerator` abstracts API backends
- `Config` provides centralized configuration

**UI Layer** provides rich terminal experience:
- React/Ink for component-based UI
- Multiple contexts for state management
- AppContainer as the root coordinator
- Specialized hooks for complex interactions
- Keyboard shortcuts and vim mode support

**Service Layer** provides supporting functionality:
- Recording for session persistence
- Compression for context management
- Shell execution with PTY support
- File discovery and Git integration
- Loop detection for safety

**Infrastructure Layer** manages resources:
- ToolRegistry for tool lifecycle
- AgentRegistry for agent management
- PolicyEngine for automated decisions
- MessageBus for event-driven communication
- ModelRouterService for intelligent routing

**Integration Layer** connects external systems:
- MCP for external tool integration
- OAuth for secure authentication
- Telemetry for observability
- IDE integration for enhanced workflows

This architecture enables:
- Clean separation of concerns
- Easy testing and mocking
- Plugin/extension system
- Multiple authentication backends
- Cross-platform compatibility
- Rich interactive experiences
- Comprehensive observability
