# Agent Interface Layer — Type Reference

Framework-agnostic interfaces for gemini-cli to swap between its internal execution loop, ADK, OpenRouter, or any future agent framework via configuration.

**Pattern: `(string & {})`** — Used throughout on discriminator fields like `type`, `reason`, `kind`. This TypeScript trick preserves editor autocomplete for known values while still accepting any string at runtime. Without it, the union collapses to plain `string` and you lose suggestions for known values. Zero runtime cost.

---

## Events

### AgentEventCommon
Base fields on every event flowing between agent and host.

```typescript
interface AgentEventCommon {
  /** Unique id for the event. */
  id: string;
  /** ISO Timestamp for the time at which the event occurred. */
  timestamp: string;
  /** The concrete type of the event. */
  type: AgentEventType;
  /** Identifies the subagent thread, omitted for "main thread" events. */
  threadId?: string;
  /** Identifies the stream (tool loop execution) this event belongs to. */
  streamId?: string;
  /** Optional arbitrary metadata for the event. */
  _meta?: {
    /** Source of the event e.g. 'user' | 'ext:{ext_name}/hooks/{hook_name}'. */
    source?: string;
    [key: string]: unknown;
  };
}
```

### AgentEventType
Known event types with open extension.

```typescript
type AgentEventType =
  | 'initialize' | 'session_update' | 'message'
  | 'tool_request' | 'tool_update' | 'tool_response'
  | 'elicitation_request' | 'elicitation_response'
  | 'usage' | 'error' | 'stream_end' | 'custom'
  | (string & {});
```

### AgentEvents
Event map using interface + mapped type pattern. Interface (not union) enables declaration merging: any module can add new event types without modifying this file.

```typescript
interface AgentEvents {
  /** MUST be the first event emitted in a session. */
  initialize: Initialize;
  /** Updates configuration about the current session/agent. */
  session_update: SessionUpdate;
  /** Message content provided by user, agent, or developer. */
  message: Message;
  /** Tool request issued by the agent. */
  tool_request: ToolRequest;
  /** Intermediate progress on long-running tools (ephemeral, not sent to model). */
  tool_update: ToolUpdate;
  /** Tool response supplied by the host. */
  tool_response: ToolResponse;
  /** Elicitation request to be displayed to the user. */
  elicitation_request: ElicitationRequest;
  /** User's response to an elicitation to be returned to the agent. */
  elicitation_response: ElicitationResponse;
  /** Reports token usage information. */
  usage: Usage;
  /** Report errors. */
  error: ErrorData;
  /** Signals why a stream ended. Last event in a stream. */
  stream_end: StreamEnd;
  /** Custom events for things not otherwise covered above. */
  custom: CustomEvent;
}

/** Mapped type: discriminated union derived from the AgentEvents interface. */
type AgentEvent<
  EventType extends keyof AgentEvents = keyof AgentEvents,
> = AgentEventCommon & AgentEvents[EventType] & { type: EventType };
```

### Event Payloads

```typescript
/** Initializes a session by binding it to a specific agent and id.
 *  MUST be the first event emitted. */
interface Initialize {
  /** The unique identifier for the session. */
  sessionId: string;
  /** The unique location of the workspace (usually an absolute filesystem path). */
  workspace: string;
  /** The identifier of the agent being used for this session. */
  agentId: string;
  /** The schema declared by the agent that can be used for configuration. */
  configSchema?: Record<string, unknown>;
}

/** Updates config such as selected model or session title. */
interface SessionUpdate {
  /** If provided, updates the human-friendly title of the current session. */
  title?: string;
  /** If provided, updates agent-specific config information. */
  config?: Record<string, unknown>;
}

/** Message content. role distinguishes user input, agent output, and
 *  developer-injected context (system prompts, hook output, etc.). */
interface Message {
  role: 'user' | 'agent' | 'developer';
  content: ContentPart[];
}

/** Tool request issued by the agent. The host decides whether to
 *  execute (after policy check) and returns a ToolResponse. */
interface ToolRequest {
  /** A unique identifier for this tool request to be correlated by the response. */
  requestId: string;
  /** The name of the tool being requested. */
  name: string;
  /** The arguments for the tool. */
  args: Record<string, unknown>;
}

/**
 * Used to provide intermediate updates on long-running tools such as subagents
 * or shell commands. ToolUpdates are ephemeral status reporting mechanisms only,
 * they do not affect the final result sent to the model.
 */
interface ToolUpdate {
  requestId: string;
  /** Content to be presented to the user (progress output, etc.). */
  displayContent?: ContentPart[];
  /** Content to be sent to the model (if needed). */
  content?: ContentPart[];
  /** Structured progress data. */
  data?: Record<string, unknown>;
}

/** Tool response supplied by the host after executing a tool call. */
interface ToolResponse {
  requestId: string;
  name: string;
  /** Content representing the tool call's outcome to be presented to the user. */
  displayContent?: ContentPart[];
  /** Multi-part content to be sent to the model. */
  content?: ContentPart[];
  /** Structured data to be sent to the model. */
  data?: Record<string, unknown>;
  /** When true, the tool call encountered an error that will be sent to the model. */
  isError?: boolean;
}

/**
 * Elicitation request to be displayed to the user. Generic mechanism for
 * all cases where an agent needs user input: tool confirmations, auth,
 * model fallback, clarification, etc.
 *
 * `kind` distinguishes the type of interaction so the host/UI can render
 * the right controls and route the response correctly. Michael's original
 * design didn't have `kind` — we added it because gemini-cli has 6 confirmation
 * types, ADK has ToolConfirmation + requestCredential, and Claude has canUseTool.
 * Without `kind`, the host has to parse `_meta` or guess.
 */
interface ElicitationRequest {
  /** A unique ID for the elicitation request, correlated in response. */
  requestId: string;
  /** What kind of elicitation this is. */
  kind: ElicitationKind;
  /**
   * Whether the elicitation should be displayed as part of the message stream or
   * as a standalone dialog box.
   */
  display?: 'inline' | 'modal' | (string & {});
  /** The question / content to display to the user. */
  message: string;
  /** An optional heading/title for longer-form elicitation requests. */
  title?: string;
  /** JSON Schema describing what the response should look like.
   *  Makes the elicitation self-describing — UIs can render dynamically. */
  requestedSchema?: JsonSchema;
  /** Structured context for the UI (tool name, args, diff preview, etc.). */
  context?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
}

/** User's response to an elicitation to be returned to the agent. */
interface ElicitationResponse {
  requestId: string;
  action: 'accept' | 'decline' | 'cancel' | (string & {});
  /** The user's response data, validated against requestedSchema. */
  content?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
}

/** Reports token usage information.
 *  `cost` added because Claude SDK tracks total_cost_usd — cost visibility
 *  per-turn is essential as agents become production infrastructure. */
interface Usage {
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  /** Cost in USD for this usage increment. */
  cost?: { usd?: number };
}

/** Report errors. */
interface ErrorData {
  /** Error status code (e.g. Google RPC codes like 'RESOURCE_EXHAUSTED'). */
  status: string;
  /** User-facing message to be displayed. */
  message: string;
  /** When true, agent execution is halting because of the error. */
  fatal: boolean;
}

/**
 * Signals why a stream ended. Last event in every stream.
 * This is the one signal not covered by other events — the AsyncGenerator
 * completing is ambiguous (done? waiting for input? hit a limit?).
 * stream_end tells you why unambiguously and carries summary data.
 */
interface StreamEnd {
  /** Which stream ended. */
  streamId: string;
  /** Why this stream ended. */
  reason: StreamEndReason;
  /** End-of-stream summary data (cost, usage, turn count, result, etc.). */
  data?: Record<string, unknown>;
}

/** CustomEvents are kept in the trajectory but do not have any pre-defined purpose. */
interface CustomEvent {
  /** A unique type for this custom event. */
  kind: string;
  data?: Record<string, unknown>;
}
```

### StreamEndReason
Why the stream ended. No 'started' (that's `initialize`). No 'handoff' (that's a `transfer_to_agent` tool call). Pausing is implicit (elicitation/tool request events).

```typescript
type StreamEndReason =
  | 'completed'   // Agent finished successfully
  | 'failed'      // Agent encountered an error
  | 'aborted'     // Agent was cancelled by user/host
  | 'max_turns'   // Hit turn limit
  | 'max_budget'  // Hit budget limit
  | 'max_time'    // Hit time limit
  | 'refusal'     // Model refused the request
  | (string & {});
```

### ElicitationKind
What type of user interaction the agent needs. Covers gemini-cli's 6 confirmation types, ADK's ToolConfirmation + requestCredential, Claude's canUseTool, and OpenAI's mcp_approval.

```typescript
type ElicitationKind =
  | 'tool_confirmation'   // Tool needs user approval before executing
  | 'model_fallback'      // Model unavailable, user picks alternative
  | 'auth_required'       // Tool/agent needs credentials
  | 'clarification'       // Agent needs more info from user
  | 'user_approval'       // Generic approval (non-tool)
  | (string & {});
```

---

## Session

### AgentSession
Runtime handle for an agent execution. Four methods with distinct semantics.

```typescript
/**
 * Created by SessionFactory.create(). This is the primary abstraction that
 * all agent backends implement — the host interacts with LocalAgent, ADK Runner,
 * OpenRouter, and any future backend through this single interface.
 *
 * Key pattern: stream() is used for BOTH starting AND continuing.
 * The stream ends when the agent needs input (tool result, elicitation).
 * Call stream() again with that input to get the next stream.
 * This matches ADK (call runAsync() again) and Michael (call send() again).
 */
interface AgentSession {
  /** Start or continue execution. Returns event stream + controller.
   *  First call: pass initial input and options to start.
   *  Subsequent calls: pass tool results, elicitation responses, or
   *  follow-up messages to continue after the previous stream ended. */
  stream(data: SessionStreamData, options?: ExecutionOptions): AgentResponse;

  /** Change session config mid-stream. Fire-and-forget — does NOT
   *  affect the event stream directly. Takes effect immediately. */
  update(config: SessionUpdateData): void;

  /** Intervene in the running generation. Fire-and-forget.
   *  Can inject content (redirect the model) or trigger actions
   *  (move to background, etc.). Broader than just content injection. */
  steer(data: SteerData): void;

  /** Cancel the current stream or entire execution. */
  abort(options?: { streamId?: string; reason?: string }): void;
}
```

- **`stream()`** — Start or continue execution. Returns event stream + controller. Call again with tool results or elicitation responses to continue after the stream ends.
- **`update()`** — Change session config mid-stream (permission mode, model, tools). Fire-and-forget.
- **`steer()`** — Intervene in the running generation (inject content, trigger actions). Fire-and-forget.
- **`abort()`** — Cancel the current execution. Optional `streamId` to target a specific stream.

### AgentResponse
Returned by `stream()`. Separates the event stream (read channel) from per-turn control (write channel).

```typescript
interface AgentResponse {
  /** The event stream. Yields events until the agent needs input
   *  (tool result, elicitation) or execution completes. */
  stream: AsyncGenerator<AgentEvent>;
  /** Per-turn control. */
  controller: AgentTurnController;
}

/** Per-turn control channel.
 *  abort() stops the current turn (model stops generating) but the session
 *  stays alive for the next stream() call. Distinct from session.abort()
 *  which terminates the entire execution. */
interface AgentTurnController {
  /** Steer the agent mid-turn. Promise resolves once steering message is sent. */
  steer?: (message: string | ContentPart[]) => Promise<void>;
  /** Tell the agent to abort the current generation. */
  abort: () => void;
}
```

### SessionStreamData
Input to `stream()` for starting or continuing execution. The `kind` field distinguishes new messages from tool results and elicitation responses — this is how the host tells the agent whether it's sending a new user message or resuming after a tool call.

```typescript
type SessionStreamData =
  | { kind: 'message'; content: string | ContentPart[] }
  | { kind: 'tool_result'; requestId: string; result: ToolResultData }
  | { kind: 'elicitation_response'; requestId: string; response: ElicitationResponseData };
```

### SessionUpdateData
Mid-stream config changes via `update()`. These are durable session properties — permission mode, model, tools, title. Separate from `steer()` which affects the running generation.

```typescript
interface SessionUpdateData {
  /** Change permission mode mid-session (e.g. switch to auto-accept). */
  permissionMode?: PermissionMode;
  /** Switch model mid-session (fallback, user override). */
  model?: string;
  /** Enable/disable tools mid-session (MCP connect/disconnect). */
  tools?: ToolDescriptor[];
  /** Human-friendly session title. */
  title?: string;
  /** Catch-all for agent-specific config. */
  config?: Record<string, unknown>;
}
```

### SteerData
Mid-stream interventions via `steer()`. Can inject content into the running generation OR trigger actions. Not just messages — actions like Ctrl+B to move to background are steering too.

```typescript
interface SteerData {
  /** Target a specific stream (defaults to current). */
  streamId?: string;
  /** Content to inject into the running generation. */
  message?: string | ContentPart[];
  /** Action to trigger mid-stream. */
  action?: SteerAction;
  /** Action-specific data. */
  data?: Record<string, unknown>;
}

type SteerAction =
  | 'background'    // Move execution to background (Ctrl+B)
  | (string & {});  // extensible
```

### ExecutionOptions
Options passed on the first `stream()` call. These are creation-time concerns. Subsequent `stream()` calls only pass `SessionStreamData`. Mid-session changes go through `update()`.

```typescript
interface ExecutionOptions {
  /** Tool descriptors available to this execution. */
  tools?: ToolDescriptor[];
  /** Model override. */
  model?: string;
  /** Whether host wants to execute tools (agent pauses on tool calls). */
  hostToolExecution?: boolean;
  /** Streaming mode. */
  streaming?: boolean;
  /** Permission mode for this execution. */
  permissionMode?: PermissionMode;
  /** Session to resume (opaque ID or full snapshot). */
  sessionRef?: string | SessionSnapshot;
  /** Branch from sessionRef instead of continuing in-place. */
  forkSession?: boolean;
  /** Run without persisting session state. */
  ephemeral?: boolean;
  /** Telemetry context for distributed tracing. */
  traceContext?: TraceContext;
  /** Abort signal for cancellation propagation. */
  signal?: AbortSignal;
}

/** Permission modes covering gemini-cli (default/autoEdit/yolo/plan)
 *  and Claude SDK (default/acceptEdits/plan/dontAsk/bypassPermissions). */
type PermissionMode =
  | 'default'       // Normal — ask user for non-read-only tools
  | 'auto_edit'     // Auto-approve file edits
  | 'autonomous'    // Auto-approve all
  | 'plan'          // Read-only, no mutations
  | (string & {});
```

---

## Agent Descriptor

### AgentDescriptor
Static, serializable declaration of an agent's identity and capabilities. Consumed by registry, factory, policy, and UI without running the agent. This is our addition — Michael's doc defines how agents communicate (events, session) but not how they declare themselves.

```typescript
interface AgentDescriptor {
  /** Unique identifier. Must be a valid identifier (no spaces, special chars). */
  name: string;
  /** Human-friendly display name. */
  displayName?: string;
  /** One-line description for model routing and tool descriptions. */
  description: string;
  /** Executor type — factory key for creating the AgentSession. */
  executor: ExecutorType;
  /** Input schema (JSON Schema). What the agent accepts. */
  inputSchema: JsonSchema;
  /** Output schema. What the agent produces. */
  outputSchema?: JsonSchema;
  /** Declared capabilities (open string array, not fixed booleans). */
  capabilities?: AgentCapabilities;
  /** Tools the agent brings with it (not inherited from parent). */
  ownTools?: ToolDescriptor[];
  /** Tools the agent requires from the host. */
  requiredTools?: string[];
  /** Sub-agent descriptors (for composite agents). */
  subAgents?: AgentDescriptor[];
  /** Execution constraints. */
  constraints?: AgentConstraints;
  /** Metadata for discovery, trust, versioning. */
  metadata?: AgentMetadata;
}

/** Factory key for creating the right AgentSession implementation. */
type ExecutorType =
  | 'local'        // gemini-cli's built-in executor
  | 'adk'          // ADK-TS Runner
  | 'remote'       // A2A protocol / remote agent
  | 'openrouter'   // OpenRouter model-as-agent
  | 'browser'      // Browser automation agent
  | (string & {});

/** Open capability declaration. Array instead of Set for JSON serializability.
 *  Common conventions: 'elicitation', 'streaming', 'cancellation',
 *  'host_tool_execution', 'mid_stream_update'. */
type AgentCapabilities = string[];

interface AgentConstraints {
  maxTurns?: number;
  maxTimeMinutes?: number;
  maxLlmCalls?: number;
  /** Maximum spend in USD. From Claude SDK's maxBudgetUsd. */
  maxBudgetUsd?: number;
}

interface AgentMetadata {
  /** File path where agent was discovered. */
  filePath?: string;
  /** Content hash for trust verification. */
  hash?: string;
  /** Whether agent is experimental. */
  experimental?: boolean;
  /** Semver version of the agent. */
  version?: string;
  /** Interface version this agent targets. */
  interfaceVersion?: string;
}
```

---

## Tools

### ToolDescriptor
How a tool declares itself to agents and the host. Michael's doc has ToolRequest/ToolResponse but no type for declaring a tool — the host needs a standard shape when provisioning tools to an agent.

```typescript
interface ToolDescriptor {
  name: string;
  displayName?: string;
  description: string;
  /** JSON Schema for parameters. */
  parametersSchema: JsonSchema;
  /** Open key-value hints for policy and UI (readOnly, destructive, etc.). */
  annotations?: ToolAnnotations;
}

interface ToolAnnotations {
  [key: string]: unknown;
}
```

### ToolCallRequest / ToolResultData
Tool call from agent to host, and result back.

```typescript
/** Tool call request from agent to host. */
interface ToolCallRequest {
  /** Correlation ID for matching request to response. */
  requestId: string;
  /** Tool name. */
  name: string;
  /** Tool arguments. */
  args: Record<string, unknown>;
}

/** Tool call result from host to agent. */
interface ToolResultData {
  /** Content for the model (what goes into conversation history). */
  llmContent: ContentPart[];
  /** Content for the user (what gets displayed). */
  displayContent?: ContentPart[];
  /** Whether the tool encountered an error. */
  isError?: boolean;
  /** Structured error type. */
  errorType?: string;
  /** Additional tool calls triggered by this result. */
  tailCalls?: ToolCallRequest[];
}
```

### ToolProvider
Host-side tool execution interface.

```typescript
interface ToolProvider {
  /** Get all available tool descriptors for an agent. */
  getToolsForAgent(agentName: string): ToolDescriptor[];
  /** Execute a tool call (after policy check). */
  execute(request: ToolCallRequest, context: ToolExecutionContext): Promise<ToolResultData>;
  /** Check if a tool call is allowed (policy + confirmation). */
  authorize(request: ToolCallRequest): Promise<PolicyDecision>;
}
```

---

## Factory

### SessionFactory
Registry that maps executor types to factory functions that create `AgentSession` instances. Replaces the hard-coded if/else chain in `SubagentToolWrapper.createInvocation()`.

```typescript
interface SessionFactory {
  /** Register a factory for an executor type. */
  register(executorType: string, creator: SessionCreator): void;
  /** Create a session for a descriptor. The returned session is NOT yet
   *  running — call session.stream() to start execution. */
  create(descriptor: AgentDescriptor, context: HostContext): AgentSession;
  /** Check if an executor type is registered. */
  has(executorType: string): boolean;
}

type SessionCreator = (descriptor: AgentDescriptor, context: HostContext) => AgentSession;
```

### HostContext
Services the host provides to executors.

```typescript
interface HostContext {
  /** Policy engine for tool call authorization. */
  policyEngine: PolicyEvaluator;
  /** Hook system for lifecycle interception. */
  hookSystem: LifecycleInterceptor;
  /** Elicitation channel for user interactions. */
  elicitation: ElicitationChannel;
  /** Tool registry for host-provided tools. */
  toolRegistry: ToolProvider;
  /** Model configuration service. */
  modelConfig: ModelConfigProvider;
  /** Session service for persistence. */
  sessionService: SessionProvider;
  /** Abort signal from parent. */
  signal?: AbortSignal;
  /** Telemetry context. */
  traceContext?: TraceContext;
}
```

---

## Policy

### PolicyEvaluator
Host-enforced authorization. The agent has NO say in policy — it is entirely host-enforced. Generic `action` string (not `toolName`) so it works for tools, agents, file access, etc.

```typescript
interface PolicyEvaluator {
  /** Evaluate an action against policy. */
  evaluate(request: PolicyRequest): Promise<PolicyDecision>;
  /** Get actions statically denied (for pre-filtering without args). */
  getExcluded(scope?: string): string[];
}

interface PolicyRequest {
  /** What is being evaluated (tool name, agent name, resource path, etc.). */
  action: string;
  /** Arguments/context for the action. */
  args?: Record<string, unknown>;
  /** Who is requesting (agent name, user ID, etc.). */
  principal?: string;
  /** Nesting path for hierarchical policy inheritance. */
  principalPath?: string[];
  /** Additional context (MCP server name, approval mode, etc.). */
  context?: Record<string, unknown>;
}

/** Maps to ADK SecurityPlugin's PolicyOutcome (ALLOW/DENY/CONFIRM)
 *  and gemini-cli's TOML policy decisions. */
type PolicyOutcome =
  | 'allow'     // Proceed
  | 'deny'      // Block
  | 'ask_user'  // Prompt user for confirmation
  | (string & {});

type PolicyDecision =
  | { outcome: 'allow'; message?: string; _meta?: Record<string, unknown> }
  | { outcome: 'deny'; reason: string; _meta?: Record<string, unknown> }
  | { outcome: 'ask_user'; hint?: string; _meta?: Record<string, unknown> }
  | { outcome: PolicyOutcome; _meta?: Record<string, unknown>; [key: string]: unknown };
```

---

## Hooks

### LifecycleInterceptor
How executors notify the host about lifecycle events so hooks fire regardless of backend. Generic `fire()` with open hook point string rather than separate typed methods — new hook points can be added without changing the interface.

```typescript
interface LifecycleInterceptor {
  /** Fire a lifecycle hook by name. */
  fire(hookPoint: HookPoint, payload: Record<string, unknown>): Promise<HookResult>;
  /** Check which hook points the host supports. */
  supportedHookPoints(): HookPoint[];
}

/** Known hook points from gemini-cli (11) + ADK plugins (12). */
type HookPoint =
  | 'before_agent' | 'after_agent'
  | 'before_model' | 'after_model'
  | 'before_tool'  | 'after_tool'
  | 'on_event' | 'on_user_message'
  | 'before_run' | 'after_run'
  | 'on_model_error' | 'on_tool_error'
  | 'before_tool_selection' | 'notification'
  | 'session_start' | 'session_end' | 'pre_compress'
  | (string & {});

type HookResult = {
  /** Should execution continue? */
  action: 'proceed' | 'block';
  /** Why blocked (if action is 'block'). */
  reason?: string;
  /** Modifications to apply (hook-point-specific). */
  modifications?: Record<string, unknown>;
  /** Message for the user (not sent to the model). */
  systemMessage?: string;
  _meta?: Record<string, unknown>;
};
```

---

## Content

### ContentPart
Provider-agnostic content model used throughout. Aligns with Michael's ContentPart types. `refusal` added based on both Claude SDK (`stop_reason: "refusal"`) and OpenAI (`response.refusal.delta/done`) — model refusals are operationally important. `code`/`code_result` added for code execution agents.

```typescript
type ContentPart = (
  /** Represents text. */
  | { type: 'text'; text: string }
  /** Represents model thinking output. */
  | { type: 'thought'; thought: string; thoughtSignature?: string }
  /** Represents rich media (image/video/pdf/etc) included inline. */
  | { type: 'media'; mimeType: string; data?: string; uri?: string }
  /** Represents an inline reference to a resource, e.g. @-mention of a file. */
  | { type: 'reference'; text: string; uri?: string; mimeType?: string; data?: string }
  /** Represents a model refusal (safety/policy trigger). */
  | { type: 'refusal'; text: string }
  /** Code block. */
  | { type: 'code'; language: string; code: string }
  /** Code execution result. */
  | { type: 'code_result'; output: string; exitCode?: number }
  /** Function call (for model history serialization). */
  | { type: 'function_call'; name: string; args: Record<string, unknown>; id: string }
  /** Function response (for model history serialization). */
  | { type: 'function_response'; name: string; response: unknown; id: string }
) & {
  /** Per-part metadata. Aligns with Michael's ContentPart._meta design. */
  _meta?: Record<string, unknown>;
};
```

---

## Model

### ModelInterface
Provider-agnostic LLM access. Owned by the executor, not the host. No `@google/genai` types — adapters translate at the boundary.

```typescript
interface ModelInterface {
  /** Generate content (non-streaming). */
  generate(request: ModelRequest): Promise<ModelResponse>;
  /** Generate content (streaming). */
  generateStream(request: ModelRequest): AsyncGenerator<ModelResponse>;
}

interface ModelRequest {
  /** System instruction. */
  systemInstruction?: ContentPart[];
  /** Conversation history. */
  messages: ModelMessage[];
  /** Available tools. */
  tools?: ToolDescriptor[];
  /** Tool calling mode. */
  toolMode?: 'auto' | 'any' | 'none';
  /** Generation config. */
  config?: ModelGenerationConfig;
}

interface ModelMessage {
  role: 'user' | 'model' | 'system';
  content: ContentPart[];
}

interface ModelResponse {
  content: ContentPart[];
  toolCalls?: ToolCallRequest[];
  usage?: { inputTokens?: number; outputTokens?: number; cachedTokens?: number };
  /** Raw provider-specific response (escape hatch). */
  _raw?: unknown;
}

interface ModelGenerationConfig {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  stopSequences?: string[];
  thinkingConfig?: { thinkingBudget?: number; includeThoughts?: boolean };
}
```

---

## Persistence

### SessionProvider
How sessions are persisted and resumed. Out of scope for the initial interface (we implement it, just don't standardize the interface yet) but included here for completeness.

```typescript
interface SessionProvider {
  /** Create a new session. */
  create(agentName: string, metadata?: Record<string, unknown>): Promise<SessionHandle>;
  /** Load an existing session. */
  load(sessionId: string): Promise<SessionHandle | undefined>;
  /** List sessions for an agent. */
  list(agentName?: string): Promise<SessionSummary[]>;
  /** Delete a session. */
  delete(sessionId: string): Promise<void>;
}

interface SessionHandle {
  id: string;
  agentName: string;
  /** Replay events to reconstruct state (trajectory concept). */
  events: AgentEvent[];
  /** Key-value state. */
  state: Record<string, unknown>;
  /** Append an event to the session. */
  append(event: AgentEvent): Promise<void>;
  /** Get a snapshot for serialization. */
  snapshot(): SessionSnapshot;
  lastUpdateTime: number;
}

interface SessionSnapshot {
  id: string;
  agentName: string;
  events: AgentEvent[];
  state: Record<string, unknown>;
}

interface SessionSummary {
  id: string;
  agentName: string;
  title?: string;
  lastUpdateTime: number;
  eventCount: number;
}
```

---

## Composition

### CompositionConfig
How agents compose into hierarchies, parallel groups, sequential chains, and loops. Maps to ADK's LoopAgent, ParallelAgent, SequentialAgent.

```typescript
type CompositionPattern =
  | 'hierarchical'  // Parent calls children as tools
  | 'sequential'    // Children run in order
  | 'parallel'      // Children run concurrently
  | 'loop'          // Children repeat until exit
  | 'transfer'      // Peer-to-peer handoff via transfer_to_agent tool
  | (string & {});

interface CompositionConfig {
  pattern: CompositionPattern;
  children: AgentDescriptor[];
  /** For loops: max iterations. */
  maxIterations?: number;
  /** For transfers: which agents can be transferred to. */
  transferTargets?: string[];
  /** For hierarchical: recursion depth limit. */
  maxDepth?: number;
}
```

---

## Telemetry

### TelemetryBridge
Observability across agent boundaries. Defined in terms of OpenTelemetry concepts but doesn't require OTel as a dependency.

```typescript
interface TraceContext {
  /** OpenTelemetry trace ID. */
  traceId: string;
  /** Parent span ID. */
  parentSpanId?: string;
  /** Baggage items. */
  baggage?: Record<string, string>;
}

interface TelemetryBridge {
  /** Start a span for an agent execution. */
  startAgentSpan(agentName: string, context?: TraceContext): TelemetrySpan;
  /** Record a tool call within a span. */
  recordToolCall(span: TelemetrySpan, toolName: string, args: Record<string, unknown>): void;
  /** Record a model call. */
  recordModelCall(span: TelemetrySpan, model: string, usage: Usage): void;
  /** Record an error. */
  recordError(span: TelemetrySpan, error: Error): void;
}

interface TelemetrySpan {
  /** Create a child span (for sub-agents). */
  createChild(name: string): TelemetrySpan;
  /** End the span. */
  end(status?: 'ok' | 'error'): void;
  /** Get context for propagation to child executors. */
  getContext(): TraceContext;
}
```
