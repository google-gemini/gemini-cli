# Phase 2 Interface Layer: Comprehensive Outline

## Purpose

This document enumerates every interface required to make gemini-cli framework-agnostic -- capable of running agents via its own execution loop, ADK-TS, OpenRouter, or any future agent framework, selected by configuration.

Each interface is grouped by priority, annotated with rationale, mapped to existing systems, and tagged with open questions. The audience is the engineering team implementing Phase 2.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [P0 Interfaces (Must Define First)](#2-p0-interfaces)
3. [P1 Interfaces (Define After P0)](#3-p1-interfaces)
4. [P2 Interfaces (Can Follow)](#4-p2-interfaces)
5. [Dependency Graph](#5-dependency-graph)
6. [Abhi's Questions: Traceability Matrix](#6-abhis-questions-traceability-matrix)
7. [Questions the Team Should Be Asking](#7-questions-the-team-should-be-asking)
8. [Migration Path](#8-migration-path)

---

## 1. Architecture Overview

The interface layer sits between gemini-cli's host systems (UI, hooks, policy, confirmation) and the agent execution backends:

```
                         gemini-cli Host
          ┌──────────────────────────────────────────┐
          │  UI  │ Hooks │ Policy │ Confirmation Bus  │
          └──────┬───────┬────────┬──────────────────┘
                 │       │        │
          ┌──────▼───────▼────────▼──────────────────┐
          │        Interface Layer (this doc)          │
          │  AgentDescriptor │ AgentSession  │ Events  │
          │  ToolContract    │ SessionContract         │
          └──────┬───────────┬───────────────┬────────┘
                 │           │               │
        ┌────────▼──┐  ┌────▼────┐  ┌───────▼───────┐
        │  Local     │  │  ADK    │  │  OpenRouter/  │
        │  Executor  │  │  Runner │  │  External     │
        └───────────┘  └─────────┘  └───────────────┘
```

### Core Principle: Descriptor / Executor Separation

An agent has two facets:

- **AgentDescriptor** -- what the agent IS. Identity, schemas, capabilities, composability metadata. Consumed by SubagentTool, AgentRegistry, PolicyEngine, and UI without running the agent.
- **AgentSession** -- how the agent RUNS. The stateful runtime handle: `send()` for between-turn data, `update()` for mid-stream changes, `abort()` for cancellation. Created by a factory keyed on `executor: string`.

This separation is the foundational insight. Every interface below supports it.

### Design Philosophy: Define Shape, Not Vocabulary

Every interface follows these rules:

1. **Known values + open string.** Discriminator fields use the TypeScript pattern `'known1' | 'known2' | (string & {})` — you get IDE autocomplete and compile-time checking for well-known values, while still accepting any string at runtime for extensibility. New values can be added by any implementation without changing the interface. We start with enums covering gemini-cli, ADK, Claude SDK, and OpenAI, then extend as needed.

2. **`Record<string, unknown>` for extensibility.** Where implementations need host/framework-specific data (MCP server names, approval modes, tool annotations), they go in open `context`, `_meta`, or `annotations` fields. The interface doesn't know or care about the contents.

3. **`JsonSchema` for self-description.** Elicitation requests describe their expected response shape. Tool descriptors describe their parameters. Agent descriptors describe their input/output. The schema IS the documentation — UIs can render dynamically.

4. **Conventions documented, not enforced.** Common patterns (capability names like `'elicitation'`, annotation keys like `readOnly`, elicitation kinds like `'tool_confirmation'`) are documented as conventions in comments, but the interface compiles and works without them. Implementations define their own vocabulary.

5. **No upstream dependencies.** No `@google/genai` types, no ADK types, no gemini-cli internal types in the interface signatures. Everything is provider-agnostic. Adapters translate at the boundary.

6. **Superset, not lowest-common-denominator.** Interfaces are designed from the superset of gemini-cli, ADK-TS, Claude Agent SDK, and OpenAI Codex/Agents SDK. If a concept appears in 2+ systems (cost tracking, session forking, refusal signals, structured termination), it belongs in the interface. If it's unique to one system (OpenAI's 53 granular streaming events), it's an implementation detail handled by adapters. See `NOTES-cross-sdk-comparison.md` for the full analysis.

---

## 2. P0 Interfaces

These must be defined first. Everything else builds on them.

---

### 2.1 AgentEvent -- The Event Stream Contract

**What it is:** The discriminated union of all events that can flow between an agent executor and the host. This is the universal wire format.

**Why we need it:** Every other component consumes or produces these events. The UI renders them. Hooks intercept them. Adapters translate to/from them. Without a stable event contract, nothing else can be built.

**Abhi's questions answered:** #5 (what events for UX), partially #1 (events as the communication channel)

**Existing systems touched:**
- `CoreEventEmitter` (maps AgentEvents to UI events)
- `SubagentActivityEvent` / `SubagentProgress` (replaced by standard events)
- `StreamEventType` in GeminiChat (content_delta, thought, etc.)
- Hook input/output types (hooks observe/modify events)

**Proposed shape:**

```typescript
interface AgentEventBase {
  /** Unique event ID. */
  id: string;
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** The concrete type of the event. */
  type: AgentEventType;
  /** Which agent emitted this event. Distinct from threadId (thread identity)
   *  and source (attribution like 'user' or 'host'). */
  agentId?: string;
  /** Identifies the subagent thread. Omitted for root agent. */
  threadId?: string;
  /** Source attribution: 'agent', 'user', 'host', 'ext:name/hooks/hookName'. */
  source?: string;
  /** Extensibility escape hatch. */
  _meta?: Record<string, unknown>;
}

/** Known event types + open extension.
 *  `(string & {})` preserves IDE autocomplete for known values
 *  while accepting any string at runtime. */
type AgentEventType =
  | 'initialize' | 'session_update' | 'message'
  | 'tool_request' | 'tool_update' | 'tool_response'
  | 'elicitation_request' | 'elicitation_response'
  | 'usage' | 'error' | 'stream_end' | 'custom'
  | (string & {});

/**
 * Event map — uses Michael's interface + mapped type pattern.
 * Interface (not union) enables declaration merging: any module can
 * add new event types without modifying this file.
 */
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
  /** User's response to an elicitation. */
  elicitation_response: ElicitationResponse;
  /** Reports token usage and cost information. */
  usage: Usage;
  /** Report errors. */
  error: ErrorData;
  /** Signals why the stream ended. Last event in a stream. */
  stream_end: StreamEnd;
  /** Custom events for things not otherwise covered above. */
  custom: CustomEvent;
}

/** Mapped type: discriminated union derived from AgentEvents interface. */
type AgentEvent<
  EventType extends keyof AgentEvents = keyof AgentEvents,
> = AgentEventBase & AgentEvents[EventType] & { type: EventType };

/** Reports token usage and cost information. */
interface Usage {
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  /** Cost in USD for this usage increment. From Claude SDK's total_cost_usd. */
  cost?: { usd?: number };
}

/** Why the stream ended. Open extension via `(string & {})`. */
type StreamEndReason =
  | 'completed'   // Agent finished successfully
  | 'failed'      // Agent encountered an error
  | 'aborted'     // Agent was cancelled by user/host
  | 'max_turns'   // Hit turn limit
  | 'max_budget'  // Hit budget limit
  | 'max_time'    // Hit time limit
  | 'refusal'     // Model refused the request
  | (string & {});

/** Last event in a stream. Tells the host why the stream ended
 *  and carries summary data (cost, usage, turn count, etc.). */
interface StreamEnd {
  /** Why this stream ended. */
  reason: StreamEndReason;
  /** End-of-stream data (open shape).
   *  For completed: { result?, cost?, usage?, numTurns? }
   *  For failed: { error?, message? } */
  data?: Record<string, unknown>;
}
```

**Key design decisions (see NOTES-cross-sdk-comparison.md for full rationale):**

1. **`type: AgentEventType` with known values + open extension** — Uses the `'known' | (string & {})` pattern throughout. We start with 12 well-known event types derived from the superset (gemini-cli, ADK, Claude SDK, OpenAI). New event types can be added by any implementation without changing the interface. IDE autocomplete works for known values. Aligns with Michael's open `type: string` while adding type safety.

2. **`interface AgentEvents` + mapped type (from Michael)** — Uses an interface (not a union type) so that any module can add new event types via declaration merging without modifying this file. The mapped type `AgentEvent<EventType>` derives the discriminated union automatically. This is strictly better than an explicit union for extensibility.

3. **`agentId` on the event base** — Every event carries which agent emitted it. Distinct from `threadId` (which identifies the execution thread) and `source` (which is attribution like 'user' or 'host'). Essential for multi-agent scenarios where events from different agents flow through the same stream.

4. **12 event types is the right abstraction level** — Cross-SDK analysis confirms every category is needed. `stream_end` replaces a more general `lifecycle` event — its only job is to signal why the stream ended, which is the one thing not covered by other events. OpenAI's 53 events are too granular (implementation details of the Responses API). Our ToolUpdate correctly abstracts over OpenAI's 15+ per-tool progress events. Claude SDK's 6 message types are too coarse (no tool progress, no elicitation).

5. **Streaming via the AsyncGenerator itself** — Both Claude SDK (StreamEvent opt-in) and OpenAI (delta/done pairs) use streaming, but their patterns are provider-specific. The AsyncGenerator is the streaming mechanism — each Message event yields as it arrives. No `partial` flag needed; the stream being open signals more content is coming. Adapters translate delta/done pairs into individual yielded events.

6. **`stream_end` for termination signaling** — The only signal not covered by other events is "why did the stream end?" `stream_end` carries a `reason` (completed, failed, max_turns, etc.) + open `data` bag for cost/usage/result. Start is covered by `initialize`. Pausing is implicit (elicitation/tool request events). Both Claude SDK (ResultMessage subtypes) and OpenAI (completed/incomplete/failed) validate the need for structured end-of-stream events.

7. **Handoff is a tool call, not a stream_end reason** — OpenAI Agents SDK has explicit `handoff_requested/handoff_occurred` events. ADK has `transfer_to_agent` tool + `eventActions.transferToAgent`. We treat handoff as a tool call (`transfer_to_agent`) that the host intercepts. This avoids duplicating routing logic between end-of-stream events and tool calls.

8. **Pausing is implicit** — No explicit pause/resume events. When an agent emits an `elicitation_request` or `tool_request` event, the stream ends. The host calls `session.stream()` with the response data to get the next stream. This matches ADK (call `runAsync()` again) and Michael (call `send()` again).

9. **Cost tracking on Usage** — Claude SDK tracks `total_cost_usd`. As agents become production infrastructure, cost visibility is essential. Added `cost: { usd }` to Usage.

10. **Refusal as ContentPart, not event** — OpenAI has `response.refusal.delta/done` events; Claude has `stop_reason: "refusal"`. Rather than adding a 13th event type, we add `{ type: 'refusal'; text: string }` as a ContentPart. This keeps the event taxonomy stable.

11. **Event ordering:** Strictly ordered within a thread. Across threads (parallel sub-agents), the host merges streams by timestamp.

12. **Backpressure:** AsyncGenerator naturally provides backpressure via `yield`. Validated by all SDKs — Claude, Codex, and ADK all use async generators/iterators.

**Relationship to prior work (see NOTES-cross-sdk-comparison.md for full analysis):**
| Concept | Dewitt | Michael | Claude SDK | OpenAI/Codex | This proposal |
|---------|--------|---------|------------|-------------|---------------|
| Event base | `AgentEvent` (11) | `AgentEvent` (11) | `SDKMessage` (6) | 53 streaming events | `AgentEvent` (12) via interface + mapped type |
| Agent ID | — | — | — | — | `agentId` on event base |
| Streaming | `content` event | `message` event | `StreamEvent` (opt-in) | `output_text.delta/done` | AsyncGenerator yields Message events |
| Tool progress | `activity` | `tool_update` | — | per-tool events (15+) | ToolUpdate (ephemeral) |
| HITL | `tool_confirmation` | `elicitation_*` | `canUseTool` callback | `mcp_approval_*` | ElicitationRequest/Response |
| Stream end | `finished` | `initialize` | `ResultMessage` | `response.created/completed/failed` | `stream_end` with `reason` + open `data` |
| Termination | — | — | typed subtypes (5) | `completed/incomplete/failed` | `StreamEnd.reason` (completed/failed/max_turns/etc.) |
| Handoff | — | — | — | `handoff_*` events | Tool call (`transfer_to_agent`) |
| Metadata | none | `_meta` everywhere | — | — | `_meta` on base + ContentPart |
| Sub-agents | `Agent<T>` | `threadId` | `AgentDefinition` | `handoff_*` events | `threadId` + `agentId` |
| Token tracking | none | `usage` | `ResultMessage.usage` | `response.completed` | Usage |
| Cost tracking | — | — | `total_cost_usd` | — | `Usage.cost` |
| Refusal | — | — | `stop_reason: "refusal"` | `refusal.delta/done` | `ContentPart.refusal` + `StreamEnd.reason: 'refusal'` |
| Session fork | — | — | `forkSession` | — | `ExecutionRequest.forkSession` |

---

### 2.2 AgentDescriptor -- What an Agent IS

**What it is:** A static, serializable declaration of an agent's identity, capabilities, input/output schemas, tool declarations, and composability metadata. This is what everything reads WITHOUT running the agent.

**Why we need it:** Today, `AgentDefinition` (with `LocalAgentDefinition` and `RemoteAgentDefinition`) serves this role but is tightly coupled to the local execution model. We need a framework-agnostic version. SubagentTool, AgentRegistry, PolicyEngine, and the UI all consume descriptors.

**Abhi's questions answered:** #4 (composable agent requirements), #6 (tool isolation declaration)

**Existing systems touched:**
- `AgentDefinition` / `LocalAgentDefinition` / `RemoteAgentDefinition` (replaced/extended)
- `AgentRegistry` (discovers and stores descriptors)
- `SubagentTool` (wraps descriptor as a tool)
- `SubagentToolWrapper.createInvocation()` (routes by `kind` -- becomes `executor`)
- ADK `BaseAgentConfig` (name, description, subAgents)

**Proposed shape:**

```typescript
type ExecutorType =
  | 'local'        // gemini-cli's built-in executor (LocalAgentSession)
  | 'adk'          // ADK-TS Runner
  | 'remote'       // A2A protocol / remote agent
  | 'openrouter'   // OpenRouter model-as-agent
  | 'browser'      // Browser automation agent
  | (string & {}); // extensible

interface AgentDescriptor {
  /** Unique identifier. Must be a valid identifier (no spaces, special chars).
   *  (ADK: BaseAgent.name — validated as valid JS identifier) */
  name: string;
  /** Human-friendly display name */
  displayName?: string;
  /** One-line description for model routing and tool descriptions */
  description: string;
  /** Executor type — factory key for creating the AgentSession.
   *  (See NOTES-adk-alignment.md §1 — ADK agents always use 'adk') */
  executor: ExecutorType;
  /** Input schema (JSON Schema). What the agent accepts. */
  inputSchema: JsonSchema;
  /** Output schema. What the agent produces. */
  outputSchema?: JsonSchema;
  /** Declared capabilities */
  capabilities?: AgentCapabilities;
  /** Tools the agent brings with it (not inherited from parent) */
  ownTools?: ToolDescriptor[];
  /** Tools the agent requires from the host */
  requiredTools?: string[];
  /** Sub-agent descriptors (for composite agents) */
  subAgents?: AgentDescriptor[];
  /** Execution constraints */
  constraints?: AgentConstraints;
  /** Metadata for discovery, trust, versioning */
  metadata?: AgentMetadata;
}

/**
 * Open capability declaration. Not a fixed set of booleans.
 * Agents declare what they support; the host reads and adapts.
 * New capabilities can be added without changing the interface.
 *
 * Common capabilities (conventions, not enforced):
 *   'elicitation' — can handle user questions mid-stream
 *   'pause_resume' — can be paused and resumed
 *   'cancellation' — can be cancelled mid-execution
 *   'multi_turn' — can receive messages while running
 *   'host_tool_execution' — accepts tool results from the host
 *   'stream_end_events' — emits stream_end events (completed/failed/etc.)
 *   'streaming' — can stream partial content
 *   'mid_stream_update' — supports session.update() for mid-stream config/content
 *
 * Using a Set<string> instead of boolean fields means:
 *   - New capabilities don't require interface changes
 *   - Agents from different frameworks can declare framework-specific caps
 *   - The host can check: descriptor.capabilities?.has('elicitation')
 */
type AgentCapabilities = string[];
// Used as: descriptor.capabilities?.includes('elicitation')
// Array instead of Set because descriptors must be JSON-serializable.

interface AgentConstraints {
  maxTurns?: number;
  maxTimeMinutes?: number;
  maxLlmCalls?: number;
  /** Maximum spend in USD. From Claude SDK's maxBudgetUsd — increasingly
   *  standard for production deployments.
   *  (See NOTES-cross-sdk-comparison.md §4.2) */
  maxBudgetUsd?: number;
}

interface AgentMetadata {
  /** File path where agent was discovered */
  filePath?: string;
  /** Content hash for trust verification */
  hash?: string;
  /** Whether agent is experimental */
  experimental?: boolean;
  /** Semver version of the agent */
  version?: string;
  /** Interface version this agent targets */
  interfaceVersion?: string;
}
```

**Key design questions:**
1. **How does `executor: string` replace `kind: 'local' | 'remote'`?** Today `SubagentToolWrapper.createInvocation()` has a hard-coded `if/else` chain. The factory pattern uses `executor` as a registry key. Registering a new executor type requires no code changes to the wrapper.
2. **ownTools vs requiredTools:** `ownTools` are tools the agent brings (e.g., an ADK agent with custom functions). `requiredTools` are tools the agent expects the host to provide (e.g., "I need file_read"). The host decides which to grant. This answers Abhi's question #6 about tool isolation.
3. **How does this relate to ADK's `BaseAgentConfig`?** An adapter maps `BaseAgentConfig` + `LlmAgentConfig` to `AgentDescriptor`. The ADK agent's `tools`, `subAgents`, `name`, `description` all have direct mappings.
4. **Serialization:** Descriptors must be JSON-serializable for agent cards, registry storage, and A2A protocol. No functions or class instances.

---

### 2.3 AgentSession -- The Runtime Handle

**What it is:** The stateful runtime handle for an agent execution. Created by a factory, it provides four methods: `stream()` to start/continue execution, `update()` for mid-stream config changes, `steer()` for mid-stream interventions, and `abort()` for cancellation.

**Why we need it:** This is the primary abstraction that all agent backends implement. The host interacts with LocalAgent, ADK Runner, OpenRouter, and any future backend through this single interface. Without it, switching backends requires code changes throughout the host.

**Abhi's questions answered:** #1 (send messages to running agent), #2 (steering with function response vs user input), #3 (persist/restart sessions)

**Existing systems touched:**
- `LocalAgentSession` (becomes the 'local' session implementation)
- ADK `Runner.runAsync()` (wrapped by 'adk' session)
- `SubagentToolWrapper.createInvocation()` (factory creates sessions by `executor` key)
- `GeminiChat` (used internally by local session)
- Dewitt's `Agent<TInput, TOutput>` with `runAsync()` / `runEphemeral()` (#22097)

**Proposed shape:**

```typescript
/**
 * The runtime handle for an agent execution.
 *
 * Four methods:
 *   stream() — start or continue: returns event stream + controller
 *   update() — mid-stream:        change session config while running
 *   steer()  — mid-stream:        intervene in the running generation
 *   abort()  — cancel:            stop the current turn or entire execution
 *
 * Created by SessionFactory.create(). Aligns with Michael's AgentSession
 * and subsumes Dewitt's Agent.runAsync() / runEphemeral() (#22097).
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
   *  follow-up messages to continue after the previous stream ended.
   *
   *  ADK: runner.runAsync() — call again with new content to continue.
   *  Michael: agent.send(session, data) → AgentResponse.
   *  Dewitt: agent.runAsync(input) (start only).
   *  Codex: thread.runStreamed(prompt). */
  stream(data: SessionStreamData, options?: ExecutionOptions): AgentResponse;

  /** Change session config mid-stream. Fire-and-forget — does NOT affect
   *  the event stream directly. Takes effect immediately.
   *  (Aligns with Michael's AgentSend.update / AgentSession.update()) */
  update(config: SessionUpdateData): void;

  /** Intervene in the running generation. Fire-and-forget.
   *  Can inject content (redirect the model) or trigger actions
   *  (move to background, etc.). Broader than just content injection.
   *  (Extends Michael's AgentTurnController.steer()) */
  steer(data: SteerData): void;

  /** Cancel the current turn or entire execution.
   *  (Aligns with Michael's AgentSession.abort()) */
  abort(reason?: string): void;
}

/**
 * Returned by stream(). Separates the event stream (read channel)
 * from per-turn control (write channel).
 * (Aligns with Michael's AgentResponse = { stream, controller })
 */
interface AgentResponse {
  /** The event stream. Yields events until the agent needs input
   *  (tool result, elicitation) or execution completes. */
  stream: AsyncGenerator<AgentEvent>;
  /** Per-turn control. */
  controller: TurnController;
}

/** Per-turn control channel. */
interface TurnController {
  /** Abort the current turn (model stops generating), but the session
   *  stays alive for the next stream() call. Distinct from session.abort()
   *  which terminates the entire execution. */
  abort: () => void;
}

/** What can be passed to stream() to start or continue execution.
 *  Same data for starting (message) and continuing (tool result, elicitation). */
type SessionStreamData =
  | { kind: 'message'; content: string | ContentPart[] }
  | { kind: 'tool_result'; requestId: string; result: ToolResultData }
  | { kind: 'elicitation_response'; requestId: string; response: ElicitationResponseData };

/** Mid-stream session config changes. Fire-and-forget via update(). */
interface SessionUpdateData {
  /** Change permission mode mid-session. */
  permissionMode?: PermissionMode;
  /** Switch model mid-session (fallback, user override). */
  model?: string;
  /** Enable/disable tools mid-session (MCP connect/disconnect). */
  tools?: ToolDescriptor[];
  /** Human-friendly session title. */
  title?: string;
  /** Catch-all for anything else. */
  config?: Record<string, unknown>;
}

/** Mid-stream intervention. Fire-and-forget via steer().
 *  Can inject content OR trigger actions — not just messages.
 *  Examples: redirect model, move to background (Ctrl+B),
 *  pause/resume tool execution. */
interface SteerData {
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

interface ExecutionOptions {
  /** Tool descriptors available to this execution. */
  tools?: ToolDescriptor[];
  /** Model override. */
  model?: string;
  /** Whether host wants to execute tools (agent pauses on tool calls).
   *  (ADK: RunConfig.pauseOnToolCalls) */
  hostToolExecution?: boolean;
  /** Streaming mode. */
  streaming?: boolean;
  /** Permission mode for this execution.
   *  Both gemini-cli (default/autoEdit/yolo/plan) and Claude SDK
   *  (default/acceptEdits/plan/dontAsk/bypassPermissions) have this concept. */
  permissionMode?: PermissionMode;
  /** Session to resume (opaque ID or full snapshot). */
  sessionRef?: string | SessionSnapshot;
  /** Branch from sessionRef instead of continuing in-place.
   *  From Claude SDK's forkSession — enables "what if" exploration. */
  forkSession?: boolean;
  /** Run without persisting session state.
   *  (Dewitt's runEphemeral — handled as option, not separate method) */
  ephemeral?: boolean;
  /** Telemetry context for distributed tracing. */
  traceContext?: TraceContext;
  /** Abort signal for cancellation propagation. */
  signal?: AbortSignal;
}

type PermissionMode =
  | 'default'       // Normal — ask user for non-read-only tools
  | 'auto_edit'     // Auto-approve file edits (gemini-cli: autoEdit)
  | 'autonomous'    // Auto-approve all (gemini-cli: yolo, Claude: bypassPermissions)
  | 'plan'          // Read-only, no mutations (both gemini-cli and Claude)
  | (string & {});

type ExecutionState =
  | { status: 'running'; turnCount: number }
  | { status: 'idle' }  // Between turns — waiting for stream()
  | { status: 'completed'; reason: StreamEndReason; data?: Record<string, unknown> }
  | { status: 'error'; error: ErrorData }
  | { status: 'aborted'; reason: string };
```

**Example usage:**

```typescript
const session = factory.create(descriptor, context);

// Turn 1 — start with message
let { stream, controller } = session.stream(
  { kind: 'message', content: 'Fix the login bug' },
  { permissionMode: 'default', hostToolExecution: true }
);

for await (const event of stream) {
  if (event.type === 'tool_request') {
    // Host runs policy, executes tool...
    const result = await executeTool(event);
    // Stream ended — continue with tool result (Turn 2)
    ({ stream, controller } = session.stream(
      { kind: 'tool_result', requestId: event.requestId, result }
    ));
    // Stream resumes in the same for-await loop
  }
  if (event.type === 'elicitation_request') {
    const response = await showConfirmationUI(event);
    ({ stream, controller } = session.stream(
      { kind: 'elicitation_response', requestId: event.requestId, response }
    ));
  }
  // Meanwhile, mid-stream:
  // session.update({ permissionMode: 'autonomous' });  // switch mode
  // session.steer({ action: 'background' });            // Ctrl+B
  // session.steer({ message: 'focus on tests' });       // redirect
  // controller.abort();                                  // cancel this turn
}
// Loop ends when stream_end event is received
```

**Key design decisions:**

1. **Four-method design — `stream()`, `update()`, `steer()`, `abort()`:**
   Each method has distinct semantics:
   - **`stream()`** = start or continue execution, returns new event stream
   - **`update()`** = change session config mid-stream (fire-and-forget)
   - **`steer()`** = intervene in running generation (fire-and-forget)
   - **`abort()`** = cancel

   `update()` and `steer()` are both mid-stream and fire-and-forget, but they affect different things: `update()` changes **what the session is configured to do** (model, permissions, tools), `steer()` changes **what the agent is currently doing** (inject content, trigger actions like background).

2. **`stream()` for both start and continue (no separate `run()` or `send()`):**
   When the stream ends because the agent needs input (tool result, elicitation response), you call `stream()` again with that input to get the next stream. This matches:
   - ADK: call `runAsync()` again with new content
   - Michael: call `send()` again, get new `AgentResponse`
   - Codex: call `runStreamed()` again

   The `SessionStreamData` union handles the "function response vs new user input" distinction (Abhi's #2): `kind: 'tool_result'` vs `kind: 'message'`.

3. **`steer()` is broader than content injection:**
   `steer()` can inject content (`message`) OR trigger actions (`action`). Ctrl+B to move to background is `steer({ action: 'background' })`. Redirecting the model is `steer({ message: "do X instead" })`. The `SteerAction` type is open via `(string & {})` for future actions.

4. **Turn abort vs session abort:**
   `controller.abort()` aborts the current turn (model stops generating, session stays alive for the next `stream()`). `session.abort()` terminates the entire execution. Michael's design has the same split.

5. **`runEphemeral` as option, not method:**
   Dewitt's `Agent` has two methods: `runAsync` (stateful) and `runEphemeral` (stateless). We handle this via `options.ephemeral: boolean`.

6. **`ExecutionOptions` only on first `stream()` call:**
   Options like `tools`, `model`, `hostToolExecution`, `sessionRef` are creation-time concerns. They're passed on the first `stream()` call. Subsequent calls only pass `SessionStreamData`. Mid-session changes go through `update()`.

**Relationship to prior work:**
| | Dewitt (#22097) | Michael (latest) | ADK-TS | Claude SDK | Codex SDK | This proposal |
|--|--------|---------|--------|------------|-----------|---------------|
| **Create** | `AgentFactory` | `agent.loadSession()` | `new Runner()` | N/A | `codex.startThread()` | `factory.create(descriptor)` |
| **Start** | `runAsync(input)` | `session.send({message})` | `runner.runAsync()` | `query({prompt})` | `thread.run()` | `session.stream({message}, options)` |
| **Continue** | N/A | `session.send({elicitations})` | `runner.runAsync()` again | `query({resume})` | same thread | `session.stream({tool_result})` |
| **Mid-stream config** | N/A | `session.update(config)` | N/A | N/A | N/A | `session.update({permissionMode})` |
| **Mid-stream steer** | N/A | `controller.steer(msg)` | N/A | N/A | N/A | `session.steer({message})` |
| **Mid-stream action** | N/A | N/A | N/A | N/A | N/A | `session.steer({action: 'background'})` |
| **Turn abort** | N/A | `controller.abort()` | N/A | N/A | N/A | `controller.abort()` |
| **Session abort** | AbortSignal | `session.abort()` | N/A | N/A | N/A | `session.abort()` |
| **Fork** | N/A | N/A | N/A | `forkSession: true` | N/A | `options.forkSession` |
| **Ephemeral** | `runEphemeral()` | N/A | N/A | N/A | N/A | `options.ephemeral` |

---

### 2.4 SessionFactory -- Pluggable Agent Creation

**What it is:** A registry that maps `executor: string` types to factory functions that create `AgentSession` instances. Aligns with Michael's `Agent.loadSession()` as the creation entry point and Dewitt's `AgentFactory` pattern (#22097).

**Why we need it:** Today, `SubagentToolWrapper.createInvocation()` has hard-coded routing:
```typescript
// CURRENT (subagent-tool-wrapper.ts lines 74-103)
if (definition.kind === 'remote') {
  return new RemoteAgentInvocation(...);
}
if (definition.name === BROWSER_AGENT_NAME) {
  return new BrowserAgentInvocation(...);
}
return new LocalSubagentInvocation(...);
```
This must become a pluggable factory keyed on `descriptor.executor`.

**Abhi's questions answered:** #4 (composable agent with minimal adjustment)

**Existing systems touched:**
- `SubagentToolWrapper.createInvocation()` (replaced by factory lookup)
- `AgentRegistry` (provides descriptors to factory)
- Dewitt's `LocalAgentSession.create()` / `AgentFactory` (#22097)

**Proposed shape:**

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

interface HostContext {
  /** Policy engine for tool call authorization */
  policyEngine: PolicyEvaluator;
  /** Hook system for lifecycle interception */
  hookSystem: LifecycleInterceptor;
  /** Elicitation channel for user interactions (tool confirmation, auth, etc.) */
  elicitation: ElicitationChannel;
  /** Tool registry for host-provided tools */
  toolRegistry: ToolProvider;
  /** Model configuration service */
  modelConfig: ModelConfigProvider;
  /** Session service for persistence */
  sessionService: SessionProvider;
  /** Abort signal from parent */
  signal?: AbortSignal;
  /** Telemetry context */
  traceContext?: TraceContext;
}
```

**Key design questions:**
1. **Where does HostContext come from?** The host (gemini-cli) assembles it from its services. Each executor implementation picks what it needs. ADK executor uses modelConfig, local executor uses everything.
2. **Lifecycle:** Does the factory create one executor per invocation, or one per agent that handles multiple invocations? Per invocation is simpler and matches the current `createInvocation()` pattern.
3. **Registration timing:** Executors are registered at startup. ADK executor registered when `@google/adk` is available. OpenRouter executor registered when configured. Default local executor always registered.

---

### 2.5 ToolContract -- The Tool Execution Boundary

**What it is:** The interface between the host's tool system and the agent executor. Defines how tools are described, how calls are authorized, and how results flow back.

**Why we need it:** Tools are the primary action mechanism. The host owns policy enforcement, confirmation, and hooks. The agent only declares intent to call a tool. This boundary must be clean regardless of which executor is running.

**Abhi's questions answered:** #6 (tool isolation for subagents)

**Existing systems touched:**
- `DeclarativeTool` / `BaseDeclarativeTool` (host-side tool implementation)
- `ToolRegistry` (host-side tool discovery and provisioning)
- `PolicyEngine.evaluate()` (authorization at the boundary)
- `CoreToolScheduler` (validation, approval, scheduling, execution)
- `ToolCallRequestInfo` / `ToolCallResponseInfo` (scheduler types)
- `ToolResult` (llmContent + displayContent + error)
- ADK `BaseTool` / `FunctionTool` (agent-side tools)

**Proposed shape:**

```typescript
/** What a tool looks like to the agent (declaration only, no execution) */
interface ToolDescriptor {
  name: string;
  displayName?: string;
  description: string;
  /** JSON Schema for parameters */
  parametersSchema: JsonSchema;
  /** Hints for policy and UI */
  annotations?: ToolAnnotations;
}

interface ToolAnnotations {
  /** Open key-value hints for policy and UI.
   *  Not an enum — hosts and tools define their own vocabulary.
   *
   *  Common conventions (not enforced by interface):
   *    readOnly: boolean — tool only reads, never mutates
   *    destructive: boolean — tool may cause irreversible changes
   *    longRunning: boolean — tool may take significant time
   *    idempotent: boolean — safe to retry
   *    category: string — tool category for grouping
   *
   *  Hosts interpret these for policy and UI. Unrecognized
   *  annotations are preserved and passed through. */
  [key: string]: unknown;
}

/** Tool call request from agent to host */
interface ToolCallRequest {
  /** Correlation ID for matching request to response */
  requestId: string;
  /** Tool name */
  name: string;
  /** Tool arguments */
  args: Record<string, unknown>;
}

/** Tool call result from host to agent */
interface ToolResultData {
  /** Content for the model (what goes into conversation history) */
  llmContent: ContentPart[];
  /** Content for the user (what gets displayed) */
  displayContent?: ContentPart[];
  /** Whether the tool encountered an error */
  isError?: boolean;
  /** Structured error details */
  errorType?: string;
  /** Tail calls: additional tool calls triggered by this result */
  tailCalls?: ToolCallRequest[];
}

/** Host-side tool provider interface */
interface ToolProvider {
  /** Get all available tool descriptors for an agent */
  getToolsForAgent(agentName: string): ToolDescriptor[];
  /** Execute a tool call (after policy check) */
  execute(request: ToolCallRequest, context: ToolExecutionContext): Promise<ToolResultData>;
  /** Check if a tool call is allowed (policy + confirmation) */
  authorize(request: ToolCallRequest): Promise<ToolAuthorizationResult>;
}

/** Reuses PolicyDecision — tool authorization IS policy evaluation */
type ToolAuthorizationResult = PolicyDecision;
```

**Key design questions:**
1. **Agent-owned tools:** When a sub-agent brings its own tools (`descriptor.ownTools`), who executes them? Option A: Agent executes internally (bypasses policy). Option B: Agent declares them, host wraps them with policy. Recommendation: Option B for safety. The host creates `DeclarativeTool` wrappers around agent-declared tools, applying policy.
2. **Tool namespacing:** Agent-owned tools should be namespaced: `agentName.toolName`. This prevents conflicts and enables per-agent policy rules. Mirrors MCP's `mcp_server_tool` pattern.
3. **Tail calls:** gemini-cli's `ToolResult.tailCall` triggers additional tool calls from a tool result. Does this concept cross the interface boundary? Yes -- the host may need to execute tail calls before sending the result to the agent.
4. **Long-running tools:** How does `ToolUpdateEvent` (progress) relate to the `ToolProvider`? The host emits `ToolUpdateEvent` while `execute()` is in progress. This could be via a callback or by having `execute()` return an `AsyncGenerator<ToolUpdateEvent, ToolResultData>`.

---

## 3. P1 Interfaces

Define after P0 is stable. These depend on the event contract and executor interface.

---

### 3.1 PolicyEvaluator -- Host-Enforced Authorization

**What it is:** The interface through which any executor can query the host's policy engine. The agent has NO say in policy -- it is entirely host-enforced.

**Why we need it:** Every tool call must be checked. External agents (ADK, OpenRouter) must not bypass policy. The current PolicyEngine is an implementation detail; we need an interface that executors call.

**Abhi's questions answered:** #6 (tool isolation is a policy concern)

**Existing systems touched:**
- `PolicyEngine` (TOML-based, 5-tier priority system)
- `CoreToolScheduler` (calls policy before execution)
- ADK `SecurityPlugin` / `BasePolicyEngine` (simpler: DENY/CONFIRM/ALLOW)
- Approval modes (default, autoEdit, yolo, plan)

**Proposed shape:**

```typescript
interface PolicyEvaluator {
  /** Evaluate an action against policy. Generic — not just for tools.
   *  Could evaluate tool calls, agent invocations, file access, etc. */
  evaluate(request: PolicyRequest): Promise<PolicyDecision>;
  /** Get actions statically denied (for pre-filtering without args). */
  getExcluded(scope?: string): string[];
}

interface PolicyRequest {
  /** What is being evaluated. Open string, not an enum.
   *  Examples: tool name, agent name, resource path */
  action: string;
  /** Arguments/context for the action (for conditional policies) */
  args?: Record<string, unknown>;
  /** Who is requesting. Could be agent name, user ID, etc. */
  principal?: string;
  /** Nesting path for hierarchical policy inheritance */
  principalPath?: string[];
  /** Additional context for policy evaluation.
   *  Hosts put implementation-specific context here
   *  (MCP server name, tool annotations, approval mode, etc.) */
  context?: Record<string, unknown>;
}

/** Known policy outcomes + open extension.
 *  Maps to ADK SecurityPlugin's PolicyOutcome (ALLOW/DENY/CONFIRM)
 *  and gemini-cli's TOML policy decisions.
 *  (See NOTES-adk-alignment.md §6) */
type PolicyOutcome =
  | 'allow'     // ADK: PolicyOutcome.ALLOW, gemini-cli: allow
  | 'deny'      // ADK: PolicyOutcome.DENY, gemini-cli: deny
  | 'ask_user'  // ADK: PolicyOutcome.CONFIRM → requestConfirmation(), gemini-cli: ask_user
  | (string & {});

type PolicyDecision =
  | { outcome: 'allow'; message?: string; _meta?: Record<string, unknown> }
  | { outcome: 'deny'; reason: string; _meta?: Record<string, unknown> }
  | { outcome: 'ask_user'; hint?: string; _meta?: Record<string, unknown> }
  | { outcome: PolicyOutcome; _meta?: Record<string, unknown>; [key: string]: unknown };
```

**Why generic:** The interface uses `action` (open string) instead of `toolName`, and `context` (open record) instead of specific fields like `mcpServer` or `approvalMode`. This means:
- gemini-cli's TOML policy engine implements this with its 5-tier system, putting `mcpServer` and `approvalMode` in `context`
- ADK's SecurityPlugin implements this with its simpler DENY/CONFIRM/ALLOW
- Future systems can add their own context without changing the interface

**Key design questions:**
1. **Policy for opaque agents:** If an ADK agent calls a tool internally (with `pauseOnToolCalls: false`), policy is bypassed. The host should mandate `hostToolExecution: true` for safety-critical environments. Trust boundary is at the host.
2. **Agent-level policy:** Policy can evaluate agents themselves (action = agent name), not just tools. The existing gemini-cli pattern (agents are tools for policy purposes) works.
3. **Policy inheritance for sub-agents:** A sub-agent inherits the parent's policy context. Additional restrictions can be layered. The `principalPath` field enables depth-aware rules.
4. **Extensibility:** New policy dimensions (rate limiting, cost budgets, data classification) are just new fields in `context` — no interface changes needed.

---

### 3.2 LifecycleInterceptor -- Lifecycle Interception

**What it is:** The interface through which executors notify the host about lifecycle events, enabling hooks to fire regardless of which backend runs.

**Why we need it:** gemini-cli's 11 hook types must work regardless of backend. When ADK controls the model, hooks still work because AdkGeminiModel wraps GeminiChat. But for fully opaque agents, hooks can only fire if the executor delegates lifecycle events back to the host.

**Abhi's questions answered:** #5 (events for UX -- hooks are a key UX mechanism)

**Existing systems touched:**
- `HookSystem` (coordinator, registry, runner, aggregator)
- All 11 hook types
- `AdkGeminiModel` (dewitt's adapter that preserves hook injection points)

**Proposed shape:**

```typescript
/**
 * Generic lifecycle interception. NOT a fixed set of named hooks.
 * The host defines what hook points exist; executors fire the ones
 * they support. New hook points can be added without changing the interface.
 */
/** Known hook points from gemini-cli (11) + ADK plugins (12).
 *  (See NOTES-adk-alignment.md §5 for complete mapping) */
type HookPoint =
  // ADK plugin callbacks
  | 'before_agent' | 'after_agent'
  | 'before_model' | 'after_model'
  | 'before_tool'  | 'after_tool'
  | 'on_event' | 'on_user_message'
  | 'before_run' | 'after_run'
  | 'on_model_error' | 'on_tool_error'
  // gemini-cli hooks (additional)
  | 'before_tool_selection' | 'notification'
  | 'session_start' | 'session_end' | 'pre_compress'
  | (string & {});

interface LifecycleInterceptor {
  /**
   * Fire a lifecycle hook by name.
   * @param hookPoint - Open string: 'before_model', 'after_tool', 'session_start', etc.
   * @param payload - Hook-specific data (open shape)
   * @returns Hook result: proceed, block, or modify
   */
  fire(hookPoint: HookPoint, payload: Record<string, unknown>): Promise<HookResult>;

  /**
   * Check which hook points the host supports.
   * Executors can query this to know what to fire.
   */
  supportedHookPoints(): HookPoint[];
}

type HookResult = {
  /** Should execution continue? */
  action: 'proceed' | 'block';
  /** Why blocked (if action is 'block') */
  reason?: string;
  /** Modifications to apply (hook-point-specific, open shape).
   *  For 'before_model': might contain modified request.
   *  For 'before_tool': might contain modified args.
   *  For 'after_tool': might contain additional context.
   *  The executor interprets this per hook point. */
  modifications?: Record<string, unknown>;
  /** Message for the user (not sent to the model) */
  systemMessage?: string;
  /** Extensibility */
  _meta?: Record<string, unknown>;
};
```

**Why generic:** Instead of separate typed methods (`beforeModel`, `afterTool`, etc.), we use a single `fire()` with an open `hookPoint` string. This means:
- gemini-cli's 11 hook types are just 11 different `hookPoint` values
- ADK's plugin callbacks (14 of them) can map to hook points
- New hook points can be added by either side without interface changes
- Executors declare which hook points they fire; the host declares which it listens to

**Key design questions:**
1. **Opaque agent hooks:** When an OpenRouter agent runs its own model, `before_model`/`after_model` hooks CANNOT fire. This is a known limitation. Executors only fire what they support. The host can query `supportedHookPoints()` and warn users about gaps.
2. **Hook result semantics:** The meaning of `modifications` depends on the `hookPoint`. For `before_model` it might contain a modified request or injected response. For `after_tool` it might contain additional context. This is intentionally open — implementations define the vocabulary.
3. **Type safety:** We sacrifice some static type safety for extensibility. Implementations can layer typed wrappers on top of the generic interface for their own hook points. The interface itself stays open.
4. **Ordering:** Hook execution order is a host concern. The interface doesn't specify ordering — the host's `LifecycleInterceptor` implementation handles that internally.

---

### 3.3 Elicitation -- Generic User Interaction Protocol

**What it is:** A single, generic interface for ALL cases where an agent needs input from the user. This covers tool confirmations, model fallback prompts, clarification questions, auth requests, and any future user interaction we haven't imagined yet.

**Design philosophy:** Elicitation is NOT specific to tool confirmation. It's a general suspension-and-resume mechanism. The coworker is designing the event-level representation; this section defines the host-side channel through which elicitations are mediated.

**Why we need it:** Today gemini-cli has multiple parallel mechanisms for user interaction: `MessageBus` confirmations, consent requests via `CoreEventEmitter`, model fallback dialogs, and `ask_user` tool calls. These should all flow through one generic protocol. ADK has `requestedToolConfirmations` and `requestCredential`. AG-UI uses "frontend tools." All of these are specific incarnations of the same pattern: **agent suspends, asks user something, user responds, agent resumes.**

**Abhi's questions answered:** #1 (send messages to running agent -- elicitations are the primary mechanism), #5 (events for UX)

**Existing systems touched:**
- `MessageBus` (pub/sub for TOOL_CONFIRMATION_REQUEST/RESPONSE)
- `ToolCallConfirmationDetails` (6 confirmation types — these become elicitation `kind` values)
- `ToolConfirmationOutcome` (7 outcomes — these become response payload values)
- `CoreEventEmitter.ConsentRequest` (model fallback)
- ADK `ToolConfirmation`, `requestCredential` (auth elicitation)
- AG-UI frontend tools pattern

**Proposed shape:**

```typescript
/**
 * Generic elicitation: agent asks user something, user responds.
 * The `kind` and `requestedSchema` are open — not an enum.
 * This makes elicitation extensible to any future interaction type
 * without changing the interface.
 */
/** Known elicitation kinds + open extension.
 *  ADK: tool_confirmation (requestedToolConfirmations), auth_required (requestedAuthConfigs)
 *  gemini-cli: tool_confirmation (6 ConfirmationTypes), model_fallback (ConsentRequest)
 *  Claude SDK: tool_confirmation (canUseTool callback)
 *  OpenAI: tool_confirmation (mcp_approval_requested) */
type ElicitationKind =
  | 'tool_confirmation'   // Tool needs user approval before executing
  | 'model_fallback'      // Model unavailable, user picks alternative
  | 'auth_required'       // Tool/agent needs credentials
  | 'clarification'       // Agent needs more info from user
  | 'user_approval'       // Generic approval (non-tool)
  | (string & {});

type ElicitationDisplay =
  | 'inline'   // Show in the message stream (e.g., inline confirmation)
  | 'modal'    // Show as a standalone dialog box
  | (string & {});

interface ElicitationRequest {
  /** Unique ID for correlating request to response */
  requestId: string;
  /** What kind of elicitation this is.
   *  Known kinds cover gemini-cli confirmations, ADK ToolConfirmation
   *  and auth requests, Claude SDK canUseTool, and OpenAI mcp_approval.
   *  (See NOTES-adk-alignment.md §2 for ADK mapping) */
  kind: ElicitationKind;
  /** How to display the elicitation.
   *  (From Michael's ElicitationRequest.display) */
  display?: ElicitationDisplay;
  /** Human-readable message to display */
  message: string;
  /** Optional title for the elicitation UI */
  title?: string;
  /** JSON Schema describing what the response should look like.
   *  This makes the elicitation self-describing — the UI can
   *  dynamically render the right input controls. */
  requestedSchema?: JsonSchema;
  /** Structured context for the UI to render (open shape).
   *  For tool confirmations: tool name, args, diff preview.
   *  For model fallback: available models, error reason.
   *  For auth: provider, scopes, redirect URL.
   *  The host implementation interprets this per `kind`. */
  context?: Record<string, unknown>;
  /** Extensibility */
  _meta?: Record<string, unknown>;
}

type ElicitationAction =
  | 'accept'    // User approved (ADK: confirmed=true, Claude: behavior='allow')
  | 'decline'   // User rejected (ADK: confirmed=false, Claude: behavior='deny')
  | 'cancel'    // User dismissed without choosing
  | (string & {});

interface ElicitationResponse {
  /** Correlates to the request */
  requestId: string;
  /** User's response action.
   *  ADK: confirmed=true → 'accept', confirmed=false → 'decline'
   *  Claude SDK: behavior='allow' → 'accept', behavior='deny' → 'decline' */
  action: ElicitationAction;
  /** The user's response data, validated against requestedSchema.
   *  For tool confirmation: might contain modified args.
   *  For model fallback: might contain selected model.
   *  For auth: might contain credentials/tokens.
   *  Shape is defined by requestedSchema. */
  content?: Record<string, unknown>;
  /** Extensibility */
  _meta?: Record<string, unknown>;
}
```

**Why this is better than separate Confirmation + Elicitation interfaces:**
- Tool confirmation IS an elicitation (kind: 'tool_confirmation')
- Model fallback IS an elicitation (kind: 'model_fallback')
- Auth request IS an elicitation (kind: 'auth_required')
- Ctrl+B interrupt IS an elicitation (kind: 'interrupt')
- Any future user interaction is just a new `kind` — no interface changes needed
- `requestedSchema` makes each kind self-describing — the UI can render dynamically

**How gemini-cli's current 7 confirmation outcomes map:**
They become response `content` values, not a fixed enum. For example:
```typescript
// kind: 'tool_confirmation'
// requestedSchema describes: { outcome: string, modifiedArgs?: ... }
// Response content: { outcome: 'proceed_always', scope: 'server' }
```
The host implementation interprets `content.outcome` per its own vocabulary. The interface doesn't need to know about "proceed_always_save" vs "proceed_always_server."

**Key design questions:**
1. **Blocking vs event-based:** The executor pauses its generator, emits an `ElicitationRequest` event via the event stream, and the host calls `send(executionId, { kind: 'elicitation_response', ... })` when the user answers. The executor resumes. This means elicitation is just an event + send pattern, not a separate channel.
2. **Multiplexing:** Multiple elicitations can be outstanding (parallel tool calls each needing confirmation). `requestId` correlates them.
3. **Timeout:** If the user never responds, the executor can treat it as `action: 'cancel'` after a configurable timeout. The `_meta` field can carry timeout hints.
4. **Progressive disclosure:** Can the host ask follow-up questions? Yes — multiple elicitation rounds are just multiple request/response cycles. The `kind` distinguishes them.

---

### 3.4 ModelInterface -- Provider-Agnostic LLM Access

**What it is:** The interface for making LLM calls, abstracted away from `@google/genai` types.

**Why we need it:** Dewitt's Model interface uses `@google/genai` types directly (PartListUnion, GenerateContentResponse). For OpenRouter or other providers, we need provider-agnostic types.

**Abhi's questions answered:** Indirectly #2 (model steering depends on model interface)

**Existing systems touched:**
- `GeminiChat` (current model interaction)
- `AdkGeminiModel` (dewitt's adapter)
- `ModelConfigService` (hierarchical aliases)
- `ModelRouterService` (strategy chain)
- `ModelAvailabilityService` (health states)
- ADK `BaseLlm` / `Gemini` (abstract model class)

**Proposed shape:**

```typescript
interface ModelInterface {
  /** Generate content (non-streaming) */
  generate(request: ModelRequest): Promise<ModelResponse>;
  /** Generate content (streaming) */
  generateStream(request: ModelRequest): AsyncGenerator<ModelResponse>;
}

interface ModelRequest {
  /** System instruction */
  systemInstruction?: ContentPart[];
  /** Conversation history */
  messages: ModelMessage[];
  /** Available tools */
  tools?: ToolDescriptor[];
  /** Tool calling mode */
  toolMode?: 'auto' | 'any' | 'none';
  /** Generation config */
  config?: ModelGenerationConfig;
}

interface ModelMessage {
  role: 'user' | 'model' | 'system';
  content: ContentPart[];
}

interface ModelResponse {
  content: ContentPart[];
  toolCalls?: ToolCallRequest[];
  /** Token usage for this response */
  usage?: { inputTokens?: number; outputTokens?: number; cachedTokens?: number };
  /** Raw provider-specific response (escape hatch) */
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

**Key design questions:**
1. **Who owns the Model interface?** The executor, NOT the host. The host provides model configuration (which model, generation params), but the executor creates the actual model connection. For the local executor, this is GeminiChat. For ADK, this is BaseLlm. For OpenRouter, it's an HTTP client.
2. **Can the host inject a model?** Yes, via the HostContext. The ADK executor uses the host-provided model (AdkGeminiModel). The local executor uses GeminiChat. OpenRouter uses its own model.
3. **Provider-agnostic types:** We define `ContentPart`, `ModelMessage`, `ModelResponse` without `@google/genai` types. Adapters translate at the boundary. This is a breaking change from dewitt's interface.
4. **Model routing:** Is routing part of the model interface? No. Model routing (which model to use) is a host concern. The executor receives a resolved model name/endpoint.

---

## 4. P2 Interfaces

Important but can follow P0/P1. These extend the core interfaces for specific capabilities.

---

### 4.1 SessionContract -- Persistence and Resumption

**What it is:** How agent sessions are persisted, loaded, and resumed across process boundaries.

**Why we need it:** Abhi's question #3 asks about persisting/restarting agent sessions. Currently, gemini-cli uses `ChatRecordingService` (JSON files) and ADK uses `BaseSessionService` (in-memory or DB). We need a unified contract.

**Abhi's questions answered:** #3 (persist/restart sessions)

**Existing systems touched:**
- `ChatRecordingService` (gemini-cli session persistence)
- `ChatCompressionService` (history summarization)
- ADK `Session` / `BaseSessionService` / `InMemorySessionService` / `DatabaseSessionService`
- Coworker's `Trajectory` concept

**Proposed shape:**

```typescript
interface SessionProvider {
  /** Create a new session */
  create(agentName: string, metadata?: Record<string, unknown>): Promise<SessionHandle>;
  /** Load an existing session */
  load(sessionId: string): Promise<SessionHandle | undefined>;
  /** List sessions for an agent */
  list(agentName?: string): Promise<SessionSummary[]>;
  /** Delete a session */
  delete(sessionId: string): Promise<void>;
}

interface SessionHandle {
  id: string;
  agentName: string;
  /** Replay events to reconstruct state (trajectory concept) */
  events: AgentEvent[];
  /** Key-value state */
  state: Record<string, unknown>;
  /** Append an event to the session */
  append(event: AgentEvent): Promise<void>;
  /** Get a snapshot for serialization */
  snapshot(): SessionSnapshot;
  /** Timestamp of last activity */
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

**Key design questions:**
1. **Trajectory vs session:** The coworker's `Trajectory` is an append-only event log from which all state can be derived. This is powerful (event sourcing) but expensive for long sessions. Pragmatic approach: store events + materialized state, but support trajectory replay.
2. **Cross-executor sessions:** Can a session started with the local executor be resumed with ADK? In theory yes, if the event format is the same. In practice, executor-specific state may not transfer. The interface should support it; implementations may restrict it.
3. **Compression:** When sessions grow too large, gemini-cli compresses history. This is executor-internal. The SessionHandle doesn't expose compression, but the executor may emit a `CustomEvent` noting that compression occurred.

---

### 4.2 AgentComposition -- Multi-Agent Topologies

**What it is:** How agents compose into hierarchies, parallel groups, sequential chains, and loops.

**Why we need it:** ADK has `LoopAgent`, `ParallelAgent`, `SequentialAgent`. gemini-cli has SubagentTool (hierarchical only). We need a composition model that works across executor types.

**Abhi's questions answered:** #4 (composable agent as subagent)

**Existing systems touched:**
- `SubagentTool` / `SubagentToolWrapper` (agent-as-tool pattern)
- ADK `LoopAgent`, `ParallelAgent`, `SequentialAgent` (composition primitives)
- ADK agent transfer (`transfer_to_agent` tool, `eventActions.transferToAgent`)
- gemini-cli recursion prevention (agents can't call other agents)

**Proposed shape:**

```typescript
type CompositionPattern =
  | 'hierarchical'  // Parent calls children as tools (ADK: any agent with subAgents)
  | 'sequential'    // Children run in order (ADK: SequentialAgent)
  | 'parallel'      // Children run concurrently (ADK: ParallelAgent, branch isolation)
  | 'loop'          // Children repeat until exit (ADK: LoopAgent, escalate to exit)
  | 'transfer'      // Peer-to-peer handoff (ADK: transfer_to_agent tool)
  | (string & {});

/** How a descriptor declares its composition pattern */
interface CompositionConfig {
  /** Composition pattern.
   *  Maps to ADK: hierarchical=subAgents, sequential=SequentialAgent,
   *  parallel=ParallelAgent, loop=LoopAgent, transfer=transfer_to_agent tool.
   *  (See NOTES-adk-alignment.md §9) */
  pattern: CompositionPattern;
  /** Sub-agents in this composition */
  children: AgentDescriptor[];
  /** For loops: max iterations */
  maxIterations?: number;
  /** For transfers: which agents can be transferred to */
  transferTargets?: string[];
  /** For hierarchical: recursion depth limit */
  maxDepth?: number;
}

/** Events for composition lifecycle */
interface CompositionEvents {
  /** A sub-agent started */
  agent_started: { agentName: string; threadId: string; parentThreadId?: string };
  /** A sub-agent completed */
  agent_completed: { agentName: string; threadId: string; result: unknown };
  /** Agent-to-agent transfer */
  agent_transfer: { from: string; to: string; reason?: string };
  /** Loop iteration */
  loop_iteration: { iteration: number; maxIterations: number };
}
```

**Key design questions:**
1. **Transfers across executor types:** Can an ADK agent transfer to a local agent? This requires the host to mediate. The host receives a `transfer` event, looks up the target in the registry, creates a new executor via the factory, and starts it.
2. **Parallel agent event merging:** When parallel sub-agents produce events concurrently, how does the host merge them? By `threadId`. Each parallel branch gets a unique threadId. The host can interleave events from different threads.
3. **Recursion prevention:** gemini-cli prevents agents from calling other agents (to avoid infinite recursion). With composition, we need a depth limit instead. `maxDepth: 3` means an agent tree can be at most 3 levels deep.
4. **Context isolation:** Parallel agents in ADK have `branch` isolation (don't see peer history). How does this work when agents are in different executors? Each executor gets its own session context. The host manages cross-branch visibility.

---

### 4.3 ContentPart -- Provider-Agnostic Content Model

**What it is:** The content model used throughout the interface layer, replacing `@google/genai` Part types.

**Why we need it:** Every interface above references `ContentPart`. It must be rich enough for text, thoughts, media, code, and references, but not tied to any provider.

**Proposed shape:**

```typescript
/**
 * Provider-agnostic content model.
 * (See NOTES-cross-sdk-comparison.md §6 for superset analysis)
 *
 * `_meta` on every ContentPart (aligns with Michael's design) enables
 * framework-specific metadata without changing the type union.
 *
 * `refusal` added based on both Claude SDK (stop_reason: "refusal")
 * and OpenAI (response.refusal.delta/done) — model refusals are
 * operationally important and both major providers surface them.
 */
/** Known content part types + open extension.
 *  Maps to ADK Part types (see NOTES-adk-alignment.md §8):
 *    text → TextPart, thought → TextPart{thought:true},
 *    media → InlineDataPart, function_call → FunctionCallPart, etc. */
type ContentPartType =
  | 'text' | 'thought' | 'media' | 'reference' | 'refusal'
  | 'code' | 'code_result'
  | 'function_call' | 'function_response'
  | (string & {});

type ContentPart = (
  | { type: 'text'; text: string }
  | { type: 'thought'; thought: string; thoughtSignature?: string }
  | { type: 'media'; mimeType: string; data?: string; uri?: string }
  | { type: 'reference'; text: string; uri?: string; mimeType?: string; data?: string }
  | { type: 'refusal'; text: string }
  | { type: 'code'; language: string; code: string }
  | { type: 'code_result'; output: string; exitCode?: number }
  | { type: 'function_call'; name: string; args: Record<string, unknown>; id: string }
  | { type: 'function_response'; name: string; response: unknown; id: string }
  | { type: ContentPartType; [key: string]: unknown }  // catch-all for unknown types
) & {
  /** Per-part metadata — aligns with Michael's ContentPart._meta design */
  _meta?: Record<string, unknown>;
};
```

**Key design questions:**
1. **Should `function_call`/`function_response` be ContentParts or separate event types?** They appear in both places in different systems. In `@google/genai`, they're Parts. In our event model, they're separate events. Recommendation: keep them as separate events (`ToolRequestEvent`, `ToolResponseEvent`) but allow `function_call`/`function_response` ContentParts for serialization into model history.
2. **Media handling:** Large media (images, PDFs) shouldn't be embedded in events. The `uri` field enables lazy loading. But how do URIs work across process boundaries? For local executors, file:// URIs. For remote, https:// URIs or data: URIs.

---

### 4.4 TelemetryBridge -- Observability Across Agent Boundaries

**What it is:** How telemetry (tracing, metrics, logging) propagates across agent boundaries and executor types.

**Existing systems touched:**
- `logAgentStart`, `logAgentFinish`, `logRecoveryAttempt` (gemini-cli telemetry)
- ADK OpenTelemetry integration (`@opentelemetry/api` in base_agent.ts)
- `CoreEventEmitter` events (UserFeedback, ModelChanged, etc.)

**Proposed shape:**

```typescript
interface TraceContext {
  /** OpenTelemetry trace ID */
  traceId: string;
  /** Parent span ID */
  parentSpanId?: string;
  /** Baggage items */
  baggage?: Record<string, string>;
}

interface TelemetryBridge {
  /** Start a span for an agent execution */
  startAgentSpan(agentName: string, context?: TraceContext): TelemetrySpan;
  /** Record a tool call within a span */
  recordToolCall(span: TelemetrySpan, toolName: string, args: Record<string, unknown>): void;
  /** Record a model call */
  recordModelCall(span: TelemetrySpan, model: string, usage: UsageData): void;
  /** Record an error */
  recordError(span: TelemetrySpan, error: Error): void;
}

interface TelemetrySpan {
  /** Create a child span (for sub-agents) */
  createChild(name: string): TelemetrySpan;
  /** End the span */
  end(status?: 'ok' | 'error'): void;
  /** Get context for propagation to child executors */
  getContext(): TraceContext;
}
```

**Key design questions:**
1. **Standards:** Use OpenTelemetry natively? ADK already does. gemini-cli has custom telemetry. Recommendation: define our interface in terms of OTel concepts, but don't require OTel as a dependency at the interface level.
2. **Privacy:** Telemetry should not include user content or tool arguments by default. Only sanitized identifiers and metrics.

---

### 4.5 Interface Versioning -- Backward Compatibility

**What it is:** How we version these interfaces so that agents built against v1 continue to work when the host upgrades to v2.

**Proposed approach:**

```typescript
/** Every interface file exports a version constant */
const INTERFACE_VERSION = '1.0.0';

/** Descriptors declare which version they target */
interface AgentMetadata {
  interfaceVersion?: string; // e.g., '1.0.0'
}

/** The host checks compatibility at registration time */
function isCompatible(agentVersion: string, hostVersion: string): boolean {
  // Semver: major must match, agent minor <= host minor
}
```

**Key design questions:**
1. **Granularity:** Version the entire interface layer as one unit, or version each interface independently? One version is simpler and what we should start with.
2. **Breaking changes:** How do we handle breaking changes? A major version bump. The host can support multiple major versions via adapters.
3. **Feature detection:** Instead of version checking, should agents check capabilities? `host.supports('elicitation')`, `host.supports('streaming')`. Both approaches complement each other.

---

## 5. Dependency Graph

```
                    ┌─────────────────┐
                    │  2.5 ToolContract│
                    └────────┬────────┘
                             │ uses
     ┌─────────────┐    ┌────▼────────────┐    ┌──────────────┐
     │4.3 Content   │◄───│  2.1 AgentEvent │───►│ 4.4 Telemetry│
     │    Part      │    └────────┬────────┘    └──────────────┘
     └─────────────┘             │ consumed by
                          ┌──────▼──────┐
                          │2.3 Agent    │
                          │   Session   │
                          └──┬───────┬──┘
                             │       │
              ┌──────────────▼─┐   ┌─▼──────────────┐
              │2.2 Agent       │   │2.4 Session      │
              │   Descriptor   │   │   Factory       │
              └───────┬────────┘   └────────┬────────┘
                      │                     │ requires
                      │           ┌─────────▼─────────┐
                      │           │   HostContext       │
                      │           │ ┌─────────────────┐│
                      │           │ │3.1 PolicyEval   ││
                      │           │ │3.2 Lifecycle Int││
                      │           │ │3.3 Elicitation  ││
                      │           │ │3.4 ModelInterface││
                      │           │ │4.1 SessionProv. ││
                      │           │ └─────────────────┘│
                      │           └────────────────────┘
                      │
              ┌───────▼────────┐
              │4.2 Composition │
              └────────────────┘
```

### Implementation order:

**Phase 2a (foundations):**
1. `ContentPart` (4.3) -- needed by everything
2. `AgentEvent` (2.1) -- the wire format
3. `ToolContract` (2.5) -- tool descriptors and results
4. `AgentDescriptor` (2.2) -- static agent metadata

**Phase 2b (runtime):**
5. `AgentSession` (2.3) -- the execution interface
6. `SessionFactory` (2.4) -- pluggable creation
7. `PolicyEvaluator` (3.1) -- authorization
8. `LifecycleInterceptor` (3.2) -- lifecycle interception

**Phase 2c (interaction):**
9. `Elicitation` (3.3) -- user interaction
10. `ModelInterface` (3.4) -- LLM abstraction
11. `SessionContract` (4.1) -- persistence

**Phase 2d (composition):**
12. `AgentComposition` (4.2) -- multi-agent patterns
13. `TelemetryBridge` (4.4) -- observability
14. `Interface Versioning` (4.5) -- compatibility

---

## 6. Abhi's Questions: Traceability Matrix

| # | Question | Primary Interface | Secondary Interfaces |
|---|----------|-------------------|---------------------|
| 1 | How can I send messages to an agent that's already running? | **AgentSession.stream()** + **steer()** (2.3) | Elicitation (3.3), AgentEvent (2.1) |
| 2 | Does it steer the model correctly (function response vs new user input)? | **AgentSession.stream()** with `SessionStreamData` union (2.3) | ModelInterface (3.4) |
| 3 | How can I persist/restart an agent session? | **SessionStorage** (4.1) | AgentSession.stream() with sessionRef (2.3) |
| 4 | What do I need to provide to get a composable agent usable as a subagent? | **AgentDescriptor** (2.2) | SessionFactory (2.4), AgentComposition (4.2) |
| 5 | What events are we using for proper UX around subagents? | **AgentEvent** (2.1) | LifecycleInterceptor (3.2), Composition events (4.2) |
| 6 | How can I isolate tools for a subagent that the main agent doesn't have access to? | **ToolContract** -- `ownTools` in descriptor (2.5) | PolicyEvaluator (3.1), ToolProvider.getToolsForAgent() |

---

## 7. Questions the Team Should Be Asking

These are critical questions NOT in Abhi's list that the interface design must address.

### 7.1 How does the main chat agent itself fit this abstraction?

The main gemini-cli chat agent is ALSO an agent. Today it's special-cased (GeminiClient manages it directly). Should it become an `AgentDescriptor` + `AgentSession`?

**Recommendation:** Yes, eventually. But for Phase 2, the main chat agent can remain special-cased. It becomes the "root executor" that spawns sub-agents via the factory. Formalizing the main agent as a descriptor is Phase 3.

**Why this matters:** If the main agent isn't an agent in its own interface, we can't compose it (e.g., "run two main agents in parallel on different tasks").

### 7.2 How do agent completion events propagate?

When a sub-agent completes or errors -- how do these events propagate to the parent? And to the UI?

**Answer via the interface:**
- The executor emits `stream_end` events with a `reason` (completed, failed, aborted, etc.).
- Events carry `threadId` and `agentId` linking them to the sub-agent.
- The parent executor (or host) sees these events in the stream from `stream()`.
- The UI receives them via the standard event rendering pipeline.
- Hooks (BeforeAgent, AfterAgent) fire at the parent level.
- Pausing is implicit — elicitation/tool request events naturally pause the stream.

**Edge case:** What if a sub-agent starts another sub-agent? Events bubble up through `threadId` chains: `thread-1.thread-2`. The parent sees events tagged with the full path and `agentId`.

### 7.3 How does cancellation/abort propagate through nested agents?

When the user presses Ctrl+C:
1. The host calls `session.abort()` on the root session.
2. The root executor propagates the AbortSignal to its sub-executors.
3. Each executor cleans up and emits a `stream_end` event with `reason: 'aborted'`.
4. The abort propagates through the `signal` in `ExecutionRequest.signal`.

**Key concern:** Not all executors support AbortSignal. Remote agents may not respond to cancellation. The host should enforce a timeout: if the agent doesn't emit `stream_end` with `reason: 'aborted'` within N seconds, the host terminates the connection.

### 7.4 How does context windowing / compression work across agent boundaries?

gemini-cli compresses history when the context window fills up. When a sub-agent is running via ADK, who manages compression?

**Answer:** The executor owns its context window. The local executor uses `ChatCompressionService`. The ADK executor uses ADK's internal context management. The host can hint at compression via `SessionUpdate` events, but doesn't directly manage it.

**Interface impact:** We may need a `ContextBudget` in `ExecutionOptions`:
```typescript
interface ExecutionOptions {
  contextBudget?: {
    maxTokens: number;
    compressionStrategy?: 'summarize' | 'truncate' | 'sliding_window';
  };
}
```

### 7.5 How do agent-to-agent transfers work?

ADK's `transfer_to_agent` lets an agent hand off to a peer agent. How does this cross executor boundaries?

**Answer via the interface:**
1. Agent A calls `transfer_to_agent` as a tool call (ToolRequest event with `name: 'transfer_to_agent'`).
2. The host intercepts this tool request (since host controls tool execution).
3. The host looks up the target agent's descriptor in the registry.
4. The host creates a new executor for the target agent via the factory.
5. The host passes relevant context (conversation history, state) to the target agent.
6. Agent A receives a `stream_end` event with `reason: 'completed'`.

**Interface impact:** Transfer is a tool call, not a separate event type. The host mediates all handoffs — it is the switchboard. This matches ADK's `transfer_to_agent` tool pattern.

### 7.6 How does the sandbox/security boundary work for agents with their own tools?

When a sub-agent declares `ownTools`, those tools run in the agent's context. But the host needs to enforce safety.

**Options:**
- **Option A:** Host wraps all ownTools with policy before provisioning them to the executor. Agent never touches raw tools.
- **Option B:** Agent executes its own tools, but the host audits via events (after-the-fact).
- **Option C:** Agent executes in a sandbox (process isolation, restricted filesystem).

**Recommendation:** Option A for Phase 2. Option C for Phase 3 (true sandboxing).

**Interface impact:** `ToolProvider.getToolsForAgent(agentName)` returns a merged set of host tools + wrapped ownTools, all policy-checked.

### 7.7 What's the testing story? How do you mock an agent for unit tests?

Developers need to:
1. Test a sub-agent in isolation (without the host).
2. Test the host with a mock agent.
3. Test an executor adapter without a real LLM.

**Interface impact:** All interfaces should be plain TypeScript interfaces (not abstract classes) so they can be easily mocked. We should provide:

```typescript
/** Test utility: mock session that replays a fixed event sequence */
class MockAgentSession implements AgentSession {
  constructor(private events: AgentEvent[]) {}
  stream(): AgentResponse {
    const events = this.events;
    return {
      stream: (async function*() { for (const e of events) yield e; })(),
      controller: { abort: () => {} },
    };
  }
  update() {}
  steer() {}
  abort() {}
}

/** Test utility: mock host context with no-op implementations */
function createMockHostContext(overrides?: Partial<HostContext>): HostContext;
```

### 7.8 How does the interface handle version skew between agent and host?

When a user installs a new version of gemini-cli but has agents built against the old interface:
- Agents that target a compatible interface version continue to work.
- Agents that target an incompatible version are flagged in the registry.
- The host logs a warning and may run the agent in compatibility mode.

**See section 4.5 for the versioning proposal.**

### 7.9 How do we handle the "opaque agent" problem?

An opaque agent (e.g., a remote OpenRouter agent running its own tools) doesn't emit tool events, model events, or stream_end events. The host only sees the final result.

**Interface impact:** The `AgentCapabilities` in the descriptor declares what the agent supports. The host adjusts:
- No `supportsHostToolExecution` => host can't enforce policy on tools
- No `supportsStreaming` => host waits for final result only
- No `supportsStreamEndEvents` => hooks can't fire for stream end

The host MUST warn users when running opaque agents: "This agent runs tools outside policy enforcement."

### 7.10 How does configuration (model, tools, behavior) flow to agents?

Today, model config uses a hierarchical alias system with overrides. Agent-specific model configs are registered as `agentName-config` aliases. How does this cross the interface boundary?

**Answer:** The `ExecutionOptions` in the run request carries resolved configuration:
```typescript
interface ExecutionOptions {
  model?: string;                    // Resolved model name
  generationConfig?: ModelGenerationConfig;  // Resolved params
  tools?: ToolDescriptor[];          // Resolved tool list
}
```

The host resolves aliases, applies overrides, and passes the result. The executor doesn't need to know about the config hierarchy.

---

## 8. Migration Path

### Phase 2a: Define interfaces, implement ContentPart + AgentEvent

- [ ] Define and publish `ContentPart`, `AgentEvent`, `ToolDescriptor`, `AgentDescriptor` types
- [ ] Create adapters: gemini-cli's existing types <-> new interface types
- [ ] No behavioral changes yet

### Phase 2b: Implement AgentSession + Factory

- [ ] Define `AgentSession`, `SessionFactory`, `HostContext`
- [ ] Wrap `LocalAgentSession` as the 'local' `AgentSession` implementation
- [ ] Wrap ADK `Runner` as the 'adk' `AgentSession` implementation
- [ ] Replace `SubagentToolWrapper.createInvocation()` with factory lookup
- [ ] Add `executor: string` field to `AgentDefinition`

### Phase 2c: Implement P1 interfaces

- [ ] Define and implement `PolicyEvaluator` (thin wrapper over existing PolicyEngine)
- [ ] Define and implement `LifecycleInterceptor` (thin wrapper over existing HookSystem)
- [ ] Define and implement `ElicitationChannel` (wrapper over MessageBus)
- [ ] Define `ModelInterface` (used by executor adapters, not directly by host)

### Phase 2d: Session, composition, telemetry

- [ ] Define and implement `SessionContract`
- [ ] Define `AgentComposition` patterns
- [ ] Define `TelemetryBridge`
- [ ] Implement interface versioning

### Phase 3: Full migration

- [ ] Main chat agent as AgentDescriptor + AgentSession
- [ ] OpenRouter as an executor type
- [ ] True agent sandboxing
- [ ] AG-UI compatibility layer

---

## Appendix A: Glossary

| Term | Definition |
|------|-----------|
| **Descriptor** | Static metadata about an agent (identity, schemas, capabilities). Serializable. |
| **AgentSession** | Stateful runtime handle for an agent execution. Three channels: send(), update(), abort(). |
| **Host** | gemini-cli itself -- owns policy, hooks, confirmation, UI. |
| **HostContext** | Bag of host services passed to executor factories. |
| **Trajectory** | Append-only sequence of events that fully describes a session. |
| **Elicitation** | Any request from agent to user for input (confirmation, question, auth). |
| **ownTools** | Tools an agent declares and brings with it, not inherited from the host. |
| **threadId** | Identifier linking events to a specific sub-agent execution. |
| **ContentPart** | A typed chunk of content (text, thought, media, reference, code). |

## Appendix B: Files in gemini-cli That Will Change

| File | Change | Priority |
|------|--------|----------|
| `core/src/agents/types.ts` | Add `executor` field to `BaseAgentDefinition`, add `AgentCapabilities` | P0 |
| `core/src/agents/subagent-tool-wrapper.ts` | Replace `createInvocation()` if/else with factory lookup | P0 |
| `core/src/agents/registry.ts` | Consume `AgentDescriptor`, register executor types | P0 |
| `core/src/agents/local-executor.ts` | Implement `AgentSession` interface | P0 |
| `core/src/agents/local-invocation.ts` | Adapt to use `AgentSession` | P0 |
| `core/src/agents/remote-invocation.ts` | Adapt to use `AgentSession` | P1 |
| `core/src/agents/browser/browserAgentInvocation.ts` | Adapt to use `AgentSession` | P1 |
| `core/src/tools/tools.ts` | Align `ToolResult` with `ToolResultData` interface | P0 |
| `core/src/policy/` | Implement `PolicyEvaluator` wrapper | P1 |
| `core/src/hooks/` | Implement `LifecycleInterceptor` wrapper | P1 |
| `core/src/confirmation-bus/message-bus.ts` | Implement `ElicitationChannel` wrapper | P1 |
| `core/src/core/geminiChat.ts` | Implement `ModelInterface` adapter | P1 |
| `core/src/services/chatRecordingService.ts` | Implement `SessionProvider` | P2 |
