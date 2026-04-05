# ADK-TS (Agent Development Kit - TypeScript) Architecture Notes

## Package: `@google/adk` v0.4.0

**Location:** `/Users/adamfweidman/Desktop/adk-int/adk-js/core/`

## Agent Hierarchy

```
BaseAgent (abstract)
├── LlmAgent         - Model-driven agent with tools (the main one)
├── LoopAgent         - Runs sub-agents in a loop (maxIterations, escalate to exit)
├── ParallelAgent     - Runs sub-agents concurrently (isolated branches)
└── SequentialAgent   - Runs sub-agents sequentially
```

### BaseAgent Config

- `name: string` - Unique identifier (must be valid JS identifier)
- `description?: string` - One-line capability for model routing
- `parentAgent?: BaseAgent` - Parent in agent tree
- `subAgents?: BaseAgent[]` - Child agents
- `beforeAgentCallback / afterAgentCallback` - Pre/post execution hooks

### LlmAgent Config (extends BaseAgent)

- `model?: string | BaseLlm` - LLM to use
- `instruction?: string | InstructionProvider` - Agent-specific instructions
- `globalInstruction?: string | InstructionProvider` - Tree-wide (root only)
- `tools?: ToolUnion[]` - Available tools
- `generateContentConfig?: GenerateContentConfig` - LLM params
- `disallowTransferToParent / disallowTransferToPeers` - Transfer controls
- `includeContents?: 'default' | 'none'` - Context history inclusion
- `inputSchema / outputSchema` - Validation schemas
- `outputKey?: string` - Session state key for output storage
- `beforeModelCallback / afterModelCallback` - LLM hooks
- `beforeToolCallback / afterToolCallback` - Tool hooks
- `requestProcessors / responseProcessors` - LLM request/response processors
- `codeExecutor?: BaseCodeExecutor`

## Event System

### Event Interface

```typescript
interface Event extends LlmResponse {
  id: string;
  invocationId: string;
  author?: string; // "user" or agent name
  actions: EventActions; // State/artifact/auth/transfer operations
  longRunningToolIds?: string[];
  branch?: string; // Hierarchical agent path
  timestamp: number;
  content?: Content;
  partial?: boolean; // Streaming indicator
}
```

### EventActions

```typescript
interface EventActions {
  skipSummarization?: boolean;
  stateDelta: Record<string, unknown>;
  artifactDelta: Record<string, number>;
  transferToAgent?: string;
  escalate?: boolean;
  requestedAuthConfigs: Record<string, AuthConfig>;
  requestedToolConfirmations: Record<string, ToolConfirmation>;
}
```

### Structured Events (utility layer)

Converts raw Event to discriminated union:

```
EventType: THOUGHT | CONTENT | TOOL_CALL | TOOL_RESULT | CALL_CODE |
           CODE_RESULT | ERROR | ACTIVITY | TOOL_CONFIRMATION | FINISHED
```

## Tool System

### BaseTool (abstract)

- `name, description, isLongRunning`
- `_getDeclaration(): FunctionDeclaration` - OpenAPI schema for LLM
- `runAsync(request): Promise<unknown>` - Execute tool
- `processLlmRequest(request): Promise<void>` - Preprocessing

### Concrete Tool Types

1. **FunctionTool** - Generic typed tools (Zod schema support)
2. **AgentTool** - Wrap agents as tools (for hierarchical composition)
3. **MCPTool** - Model Context Protocol server tools
4. **GoogleSearchTool** - Built-in web search
5. **ExitLoopTool** - Signal loop exit
6. **LongRunningFunctionTool** - Async long-running operations

### BaseToolset

- Filter tools by predicate or string list
- `getTools(context)`, `close()`, `isToolSelected()`
- **MCPToolset** - Toolset for MCP server connections

## Session Management

### Session Interface

```typescript
interface Session {
  id: string;
  appName: string;
  userId: string;
  state: Record<string, unknown>; // Mutable key-value store
  events: Event[]; // Complete conversation history
  lastUpdateTime: number;
}
```

### Session Services

- `BaseSessionService` (abstract) - createSession, getSession, listSessions,
  deleteSession, appendEvent
- `InMemorySessionService` - In-process storage
- `DatabaseSessionService` - Mikro-ORM backed (SQL)

### State Management

- `State` class wraps base state + delta
- `get()` returns from delta if present, else base
- `set()` updates delta only
- `hasDelta()` checks if changes made

## Human-in-the-Loop (HITL)

### Tool Confirmation

```typescript
class ToolConfirmation {
  hint?: string; // Guidance for user
  confirmed: boolean; // User approval
  payload?: unknown; // Additional context
}
```

### Security Plugin

- `beforeToolCallback` - Evaluates policy before tool execution
- `BasePolicyEngine` interface with `evaluate()` method
- `PolicyOutcome`: DENY | CONFIRM | ALLOW

### Auth Requests

- `context.requestCredential(authConfig)` - Request auth from user
- `context.getAuthResponse(authConfig)` - Check for auth response
- Sets `eventActions.requestedAuthConfigs[functionCallId]`

## Multi-Agent Patterns

### Agent Transfer

- LlmAgent injects `transfer_to_agent(agentName)` tool
- Sets `eventActions.transferToAgent = targetAgentName`
- Runner resolves target and continues
- Can transfer to: sub-agents, parent (if not disabled), peers (if not disabled)

### Parallel Agent

- Runs all subAgents concurrently
- Isolates each via `branch` context
- Sub-agents don't see peer history
- Merges event streams with fair ordering

### Loop Agent

- Repeatedly runs subAgents
- `maxIterations` caps loop count
- Exits on `event.actions.escalate === true`

## Plugin System

### BasePlugin Lifecycle Hooks (14 hooks!)

- `onUserMessageCallback` - Preprocess user messages
- `beforeRunCallback` - Before agent run (can short-circuit)
- `onEventCallback` - Per-event (can modify events)
- `afterRunCallback` - Final cleanup
- `beforeAgentCallback / afterAgentCallback` - Agent lifecycle
- `beforeModelCallback / afterModelCallback` - LLM lifecycle
- `onModelErrorCallback` - Model error handling
- `beforeToolCallback / afterToolCallback` - Tool lifecycle
- `onToolErrorCallback` - Tool error handling

### Built-in Plugins

- **LoggingPlugin** - Debug logging
- **SecurityPlugin** - Policy enforcement + tool confirmation
- **PluginManager** - Plugin orchestration

## Runner

### Runner Config

```typescript
interface RunnerConfig {
  appName: string;
  agent: BaseAgent; // Root agent
  plugins?: BasePlugin[];
  artifactService?: BaseArtifactService;
  sessionService: BaseSessionService; // Required
  memoryService?: BaseMemoryService;
  credentialService?: BaseCredentialService;
}
```

### RunConfig (per-run options)

```typescript
interface RunConfig {
  speechConfig?: SpeechConfig;
  responseModalities?: Modality[];
  maxLlmCalls?: number; // Default 500
  pauseOnToolCalls?: boolean; // Client-side tool execution
  streamingMode?: StreamingMode; // NONE | SSE | BIDI
  // ... audio/live configs
}
```

### Execution Pipeline

1. Load or create session
2. Create InvocationContext
3. Run pluginManager.runOnUserMessageCallback()
4. Append user message to session
5. Run agent.runAsync(invocationContext) → yields events
6. For each non-partial event: append to session
7. Run pluginManager.runOnEventCallback()
8. Run pluginManager.runAfterRunCallback()

## Model Layer

### BaseLlm (abstract)

- `generateContentAsync(llmRequest, stream?): AsyncGenerator<LlmResponse>`
- `connect(llmRequest): Promise<BaseLlmConnection>` - For live/streaming

### Implementations

- `Gemini` - Google Gemini API
- `ApigeeLlm` - Apigee-wrapped models
- `LLMRegistry` - Static registry for model lookup

## Service Adapters (all abstract base + implementations)

| Service               | Implementations                |
| --------------------- | ------------------------------ |
| BaseSessionService    | InMemory, Database (Mikro-ORM) |
| BaseArtifactService   | InMemory, File, GCS            |
| BaseMemoryService     | InMemory                       |
| BaseCredentialService | InMemory                       |
| BaseCodeExecutor      | BuiltIn                        |

## Design Patterns

1. **Symbol-based type guards** - Every class uses `Symbol.for()` + `isXxx()`
2. **Abstract base classes** - Service interfaces via abstract classes
3. **Async generators** - All agent execution yields events
4. **Context objects** - Rich context passed to callbacks/tools
5. **Delta state** - Session state + event action deltas
6. **Plugin middleware** - 14 hooks at multiple execution points
7. **Tree-based hierarchy** - Parent-child agents with root traversal
8. **Branch isolation** - Parallel agents use branch paths
9. **Callback chains** - Multiple callbacks per stage with early termination
