# Cross-SDK Comparison: Events, Agents, and Interface Superset

## 1. AgentEvents: Our Outline vs Michael's

Our outline and Michael's `Gemini CLI Agents.txt` are **nearly identical** in
event taxonomy. The only difference is we added a `stream_end` event type:

| #   | Michael's Events       | Our Outline           | Delta                                                                           |
| --- | ---------------------- | --------------------- | ------------------------------------------------------------------------------- |
| 1   | `initialize`           | `InitializeEvent`     | Same                                                                            |
| 2   | `session_update`       | `SessionUpdateEvent`  | Same                                                                            |
| 3   | `message`              | `MessageEvent`        | Same — streaming handled by AsyncGenerator                                      |
| 4   | `tool_request`         | `ToolRequestEvent`    | Same                                                                            |
| 5   | `tool_update`          | `ToolUpdateEvent`     | Same                                                                            |
| 6   | `tool_response`        | `ToolResponseEvent`   | Same                                                                            |
| 7   | `elicitation_request`  | `ElicitationRequest`  | Same                                                                            |
| 8   | `elicitation_response` | `ElicitationResponse` | Same                                                                            |
| 9   | `usage`                | `UsageEvent`          | Same                                                                            |
| 10  | `error`                | `ErrorEvent`          | Same                                                                            |
| 11  | `custom`               | `CustomEvent`         | Same                                                                            |
| 12  | —                      | **StreamEnd**         | **Added**: completed, failed, aborted, max_turns, max_budget, max_time, refusal |

### Minor structural differences:

| Aspect                 | Michael                                             | Our Outline                                                               |
| ---------------------- | --------------------------------------------------- | ------------------------------------------------------------------------- |
| **Base type**          | `AgentEventCommon` with `type: string` (fully open) | `AgentEventBase` with `type: AgentEventType` (`'known' \| (string & {})`) |
| **Agent ID**           | —                                                   | `agentId` on event base (which agent emitted this event)                  |
| **Event map**          | Generic `interface AgentEvents` + mapped type       | Same — adopted Michael's pattern for declaration merging extensibility    |
| **ContentPart.\_meta** | Required (`_meta: Record<string, unknown>`)         | Optional (`_meta?: Record<string, unknown>`)                              |
| **ErrorData.status**   | Google RPC codes (`'RESOURCE_EXHAUSTED' \| '...'`)  | Open string (per our generic philosophy)                                  |
| **Message.role**       | `'user' \| 'agent' \| 'developer'`                  | Same                                                                      |
| **Stream end**         | Only `initialize`                                   | `stream_end` with `reason` field + open `data` bag                        |
| **Handoff**            | Not covered                                         | Tool call (`transfer_to_agent`) — no dedicated event                      |
| **Pausing**            | Implicit (elicitation/tool events)                  | Same — no explicit pause/resume events                                    |

### Design decisions adopted from Michael

1. **`interface AgentEvents` + mapped type** — Michael's pattern enables
   declaration merging, letting any module add new event types without modifying
   the base definition. Strictly better than an explicit union type.
2. **`_meta` on ContentPart** — More extensible. We adopted it (as optional).
3. **Implicit pausing** — No separate pause/resume events. When the agent emits
   an `elicitation_request` or `tool_request`, the stream naturally pauses. The
   host calls `stream()` to resume.

---

## 2. Claude Agent SDK — Key Interfaces

Source: `@anthropic-ai/claude-agent-sdk`

### Agent Execution Model

```typescript
// Entry point — not an interface, a function
function query({
  prompt: string | AsyncIterable<SDKUserMessage>,
  options?: Options
}): Query  // extends AsyncGenerator<SDKMessage, void>
```

### Message Types (Event Stream)

```typescript
type SDKMessage =
  | SystemMessage // subtype: "init" | "compact_boundary"
  | AssistantMessage // Claude's response with tool calls
  | UserMessage // Tool results fed back
  | StreamEvent // Raw API stream events (opt-in)
  | ResultMessage // Final: success | error_max_turns | error_max_budget_usd | error_during_execution
  | CompactBoundaryMessage; // Context compaction marker
```

### Tool Approval (HITL)

```typescript
canUseTool: async (toolName: string, input: Record<string, any>) =>
  Promise<
    | { behavior: 'allow'; updatedInput: Record<string, any> }
    | { behavior: 'deny'; message: string }
  >;
```

### Subagent Definition

```typescript
interface AgentDefinition {
  description: string; // When to invoke
  prompt: string; // System prompt
  tools?: string[]; // Available tools (defaults to all)
  model?: 'sonnet' | 'opus' | 'haiku' | 'inherit';
}
```

### Session Management

```typescript
interface Options {
  continue?: boolean;         // Resume most recent session
  resume?: string;            // Resume by session ID
  forkSession?: boolean;      // Branch from resume point
  persistSession?: boolean;   // Default: true
  maxTurns?: number;
  maxBudgetUsd?: number;      // Spend limit
  permissionMode?: 'default' | 'acceptEdits' | 'plan' | 'dontAsk' | 'bypassPermissions';
  structuredOutput?: { type: "json_schema", ... };
}
```

### Result (Termination)

```typescript
interface SDKResultMessage {
  type: 'result';
  subtype:
    | 'success'
    | 'error_max_turns'
    | 'error_max_budget_usd'
    | 'error_during_execution'
    | 'error_max_structured_output_retries';
  result?: string;
  total_cost_usd: number;
  usage: { input_tokens: number; output_tokens: number };
  num_turns: number;
  session_id: string;
  stop_reason: string | null; // "end_turn", "max_tokens", "refusal"
}
```

### V2 Preview (Simpler API)

```typescript
await using session = unstable_v2_createSession({ model: "..." });
await session.send("Hello!");
for await (const msg of session.stream()) { ... }
await session.send("Follow-up");
for await (const msg of session.stream()) { ... }
```

---

## 3. OpenAI Codex SDK / Responses API — Key Interfaces

### Codex SDK (TypeScript)

```typescript
// Client
const codex = new Codex({ env?, config? });
const thread = codex.startThread({ workingDirectory?, skipGitRepoCheck? });
const thread = codex.resumeThread(threadId);

// Execution
const turn = await thread.run(prompt: string | InputEntry[], options?);
const { events } = await thread.runStreamed(prompt);

// Streaming
for await (const event of events) {
  switch (event.type) {
    case "item.completed": // event.item
    case "turn.completed": // event.usage
  }
}
```

### Responses API Streaming Events (53 types)

Organized hierarchically:

**Response Lifecycle (7):**

- `response.queued`, `response.created`, `response.in_progress`
- `response.completed`, `response.incomplete`, `response.failed`
- `error`

**Content Streaming (8):**

- `response.output_item.added`, `response.output_item.done`
- `response.content_part.added`, `response.content_part.done`
- `response.output_text.delta`, `response.output_text.done`
- `response.refusal.delta`, `response.refusal.done`

**Reasoning (6):**

- `response.reasoning_text.delta`, `response.reasoning_text.done`
- `response.reasoning_summary_part.added`,
  `response.reasoning_summary_part.done`
- `response.reasoning_summary_text.delta`,
  `response.reasoning_summary_text.done`

**Function Calls (2):**

- `response.function_call_arguments.delta`,
  `response.function_call_arguments.done`

**MCP (8):**

- `response.mcp_call_arguments.delta`, `response.mcp_call_arguments.done`
- `response.mcp_call.in_progress`, `response.mcp_call.completed`,
  `response.mcp_call.failed`
- `response.mcp_list_tools.in_progress`, `response.mcp_list_tools.completed`,
  `response.mcp_list_tools.failed`

**Built-in Tools (15):**

- File search: `in_progress`, `searching`, `completed`
- Web search: `in_progress`, `searching`, `completed`
- Code interpreter: `in_progress`, `interpreting`, `code.delta`, `code.done`,
  `completed`
- Image gen: `in_progress`, `generating`, `partial_image`, `completed`

**Audio (4):**

- `response.audio.delta`, `response.audio.done`
- `response.audio.transcript.delta`, `response.audio.transcript.done`

**Annotations (1):**

- `response.output_text.annotation.added`

### OpenAI Agents SDK (higher-level)

```python
# Python-first, but patterns apply
class RunItemStreamEvent:
    name: Literal[
        "message_output_created",
        "handoff_requested",
        "handoff_occurred",
        "tool_called",
        "tool_output",
        "tool_search_called",
        "tool_search_output_created",
        "reasoning_item_created",
        "mcp_approval_requested",
        "mcp_approval_response",
        "mcp_list_tools",
    ]

class AgentUpdatedStreamEvent:
    # Fires when current agent changes (handoff)
    new_agent: Agent
```

---

## 4. Superset Analysis — What Changes Our Interfaces?

### Concepts Present in ALL Systems

| Concept               | gemini-cli | ADK-TS | Claude SDK    | Codex/OpenAI   | Our Interfaces          |
| --------------------- | ---------- | ------ | ------------- | -------------- | ----------------------- |
| Text streaming        | ✅         | ✅     | ✅            | ✅             | ✅ MessageEvent         |
| Tool request/response | ✅         | ✅     | ✅            | ✅             | ✅ ToolRequest/Response |
| Thinking/reasoning    | ✅         | ✅     | ✅ (thinking) | ✅ (reasoning) | ✅ ContentPart.thought  |
| Error events          | ✅         | ✅     | ✅            | ✅             | ✅ ErrorEvent           |
| Token usage           | ✅         | ✅     | ✅            | ✅             | ✅ UsageEvent           |
| Tool progress         | ✅         | ✅     | —             | ✅             | ✅ ToolUpdateEvent      |
| Session resume        | ✅         | ✅     | ✅            | ✅             | ✅ sessionRef           |
| Subagents             | ✅         | ✅     | ✅            | —              | ✅ threadId             |
| Abort/cancel          | ✅         | ✅     | ✅            | ✅             | ✅ abort()              |
| Metadata escape hatch | —          | ✅     | —             | —              | ✅ \_meta               |

### NEW Concepts From Claude/Codex That We Should Incorporate

#### 4.1 Structured Stream End Reasons (HIGH PRIORITY)

**What:** Claude SDK has typed termination:
`success | error_max_turns | error_max_budget_usd | error_during_execution`.
OpenAI has `completed | incomplete | failed`.

**Why it matters:** We need a `stream_end` event that captures why the stream
ended — the one signal not covered by other event types.

**Final design — `stream_end` with `reason` + open `data` bag:**

```typescript
type StreamEndReason =
  | 'completed'
  | 'failed'
  | 'aborted'
  | 'max_turns'
  | 'max_budget'
  | 'max_time'
  | 'refusal'
  | (string & {});

interface StreamEnd {
  reason: StreamEndReason;
  data?: Record<string, unknown>; // { result?, cost?, usage?, numTurns?, error?, ... }
}
```

**Design rationale:**

- Start is covered by `initialize`. Pausing is implicit (elicitation/tool
  request events). Handoff is a tool call (`transfer_to_agent`).
- End-of-stream details go in `data` as an open bag, not fixed fields.

#### 4.2 Budget Constraints (MEDIUM PRIORITY)

**What:** Claude SDK has `maxBudgetUsd`. Neither gemini-cli nor ADK has this
today.

**Why it matters:** Cost control is critical for production deployments.

**Proposed change to AgentConstraints:**

```typescript
interface AgentConstraints {
  maxTurns?: number;
  maxTimeMinutes?: number;
  maxLlmCalls?: number;
  maxBudgetUsd?: number; // NEW: from Claude SDK
}
```

#### 4.3 Session Forking (MEDIUM PRIORITY)

**What:** Claude SDK supports `forkSession: boolean` — branch from a resume
point to explore alternatives.

**Why it matters:** Enables "what if" exploration without destroying history.
Useful for plan mode.

**Proposed change to ExecutionRequest:**

```typescript
interface ExecutionRequest {
  // ... existing fields ...
  sessionRef?: string | SessionSnapshot;
  forkSession?: boolean; // NEW: branch from sessionRef instead of continuing
}
```

#### 4.4 Permission Modes on Execution (MEDIUM PRIORITY)

**What:** Claude has 5 permission modes:
`default | acceptEdits | plan | dontAsk | bypassPermissions`. gemini-cli has 4
approval modes: `default | autoEdit | yolo | plan`.

**Why it matters:** Both systems have this concept. It should be in
ExecutionOptions, not hard-coded.

**Proposed change to ExecutionOptions:**

```typescript
interface ExecutionOptions {
  // ... existing fields ...
  permissionMode?: string; // Open string. Conventions: 'default' | 'auto_edit' | 'autonomous' | 'plan' | string
}
```

#### 4.5 Agent Handoff (MEDIUM PRIORITY)

**What:** OpenAI Agents SDK has explicit `handoff_requested` /
`handoff_occurred` events plus `AgentUpdatedStreamEvent`. ADK has
`transfer_to_agent` tool + `eventActions.transferToAgent`. Claude SDK has
subagent invocation via Agent tool.

**Why it matters:** When agent A delegates to agent B, the host/UI needs to
know.

**Design decision: Handoff is a tool call, not a separate event type.**

The agent calls `transfer_to_agent` as a tool (ToolRequest event). The host
intercepts this tool call (since host controls tool execution), looks up the
target agent, creates a new executor via the factory, and mediates the handoff.
The originating agent's stream ends with `stream_end` reason `'completed'`.

```typescript
// 1. Agent emits tool request:
{ type: 'tool_request', name: 'transfer_to_agent', args: { target: 'coder', reason: '...' } }

// 2. Host mediates handoff, originating agent completes:
{ type: 'stream_end', reason: 'completed', agentId: 'planner', data: { handoffTarget: 'coder' } }
```

This avoids duplicating routing logic between stream_end events and tool calls.
Matches ADK's `transfer_to_agent` tool pattern.

#### 4.6 Refusal as Distinct Signal (LOW PRIORITY)

**What:** OpenAI has explicit `response.refusal.delta/done` events. Claude has
`stop_reason: "refusal"`.

**Why it matters:** Model refusals are operationally important (safety, policy).

**Proposed:** No new event type. Handle via `MessageEvent` with a `refusal`
content part type, or via `ErrorEvent` with specific error code. ContentPart can
be extended:

```typescript
| { type: 'refusal'; text: string }
```

#### 4.7 Content Annotations (LOW PRIORITY)

**What:** OpenAI has `response.output_text.annotation.added` for citations, file
paths.

**Why it matters:** Citations and source attribution are increasingly important.

**Proposed:** Michael's `reference` ContentPart already covers this. No change
needed — `reference` with `uri` and `text` handles citations.

#### 4.8 Context Compaction Events (LOW PRIORITY)

**What:** Claude SDK has `CompactBoundaryMessage` marking when context was
compressed.

**Why it matters:** For long sessions, knowing when context was compressed helps
with debugging and UI.

**Proposed:** `CustomEvent` with `kind: 'compact_boundary'`. No new event type
needed.

#### 4.9 Structured Output Schema (ALREADY COVERED)

**What:** Both Claude (`structuredOutput`) and OpenAI support JSON Schema output
constraints.

**Status:** Already covered by `AgentDescriptor.outputSchema: JsonSchema`. No
change needed.

### Concepts We DON'T Need to Adopt

| Concept                                                                   | Why Skip                                                                                                               |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| OpenAI's 53 granular streaming events                                     | Too coupled to Responses API internals. Our `ToolUpdateEvent` + `MessageEvent` via AsyncGenerator abstracts over this. |
| OpenAI's per-tool-type events (file_search, web_search, code_interpreter) | Tool-specific progress belongs in `ToolUpdateEvent.data`, not in the event taxonomy.                                   |
| Audio/Image streaming events                                              | Handle via `ToolUpdateEvent` with media ContentParts. When needed, add as ContentPart types, not event types.          |
| Claude's raw `StreamEvent` wrapper                                        | Implementation detail of the Claude API client. Our adapters consume these internally.                                 |
| MCP-specific events (mcp_call, mcp_list_tools)                            | MCP tools are just tools. Use generic `ToolRequestEvent/ToolResponseEvent`. MCP approval is an `ElicitationRequest`.   |

---

## 5. Updated Event Type Comparison (Full Superset)

| #   | Event Type           | Michael | Our Outline | Claude SDK                    | OpenAI                            | Verdict                                        |
| --- | -------------------- | ------- | ----------- | ----------------------------- | --------------------------------- | ---------------------------------------------- |
| 1   | Initialize           | ✅      | ✅          | SystemMessage(init)           | —                                 | **Keep**                                       |
| 2   | Session Update       | ✅      | ✅          | —                             | —                                 | **Keep**                                       |
| 3   | Message              | ✅      | ✅          | AssistantMessage              | output_text.delta/done            | **Keep**                                       |
| 4   | Tool Request         | ✅      | ✅          | AssistantMessage.tool_use     | function_call_arguments           | **Keep**                                       |
| 5   | Tool Update          | ✅      | ✅          | —                             | per-tool progress events          | **Keep**                                       |
| 6   | Tool Response        | ✅      | ✅          | UserMessage                   | —                                 | **Keep**                                       |
| 7   | Elicitation Request  | ✅      | ✅          | canUseTool callback           | mcp_approval_requested            | **Keep**                                       |
| 8   | Elicitation Response | ✅      | ✅          | canUseTool return             | mcp_approval_response             | **Keep**                                       |
| 9   | Usage                | ✅      | ✅          | ResultMessage.usage           | response.completed                | **Keep**                                       |
| 10  | Error                | ✅      | ✅          | ResultMessage(error\_\*)      | response.failed                   | **Keep**                                       |
| 11  | Custom               | ✅      | ✅          | —                             | —                                 | **Keep**                                       |
| 12  | StreamEnd            | —       | ✅          | ResultMessage + SystemMessage | response.created/completed/failed | **Keep — `stream_end` with `reason` + `data`** |

**Result: Our 12 event types are the right abstraction level.** Claude and
OpenAI validate every category. The granularity differences (OpenAI's 53 vs
our 12) are implementation details that adapters handle internally. `stream_end`
uses a single `reason` field with an open `data` bag. Handoff is a tool call.
Pausing is implicit.

---

## 6. Updated ContentPart Types (Superset)

```typescript
type ContentPart = (
  | { type: 'text'; text: string }
  | { type: 'thought'; thought: string; thoughtSignature?: string }
  | { type: 'media'; data?: string; uri?: string; mimeType?: string }
  | {
      type: 'reference';
      text: string;
      data?: string;
      uri?: string;
      mimeType?: string;
    }
  | { type: 'refusal'; text: string } // NEW: from OpenAI
) &
  // Future: type: string for unknown types from new SDKs
  { _meta?: Record<string, unknown> };
```

Adding `refusal` as a ContentPart type (rather than a new event) keeps the event
taxonomy stable while supporting model refusals from both Claude and OpenAI.

---

## 7. Key Architectural Patterns Across SDKs

### Pattern: Execution Entry Points

| SDK         | Entry Point                                                               | Multi-turn Pattern                              |
| ----------- | ------------------------------------------------------------------------- | ----------------------------------------------- |
| Michael     | `agent.send(trajectory, data)` / `session.send()` + `session.update()`    | Same method / three-method session              |
| Our Outline | `session.stream(data)` + `session.update(config)` + `session.steer(data)` | Four-method session (stream/update/steer/abort) |
| Claude SDK  | `query({ prompt, options })`                                              | New `query()` call with `resume: sessionId`     |
| Claude V2   | `session.send()` + `session.stream()`                                     | Separate send/stream                            |
| Codex SDK   | `thread.run(prompt)` / `thread.runStreamed(prompt)`                       | Same thread object                              |

**Observation:** Claude V2 and Codex both use a stateful session/thread object
with send+stream. Michael uses a single `send()` method. Our `stream()` method
is the unified version — the first call starts, subsequent calls continue (like
ADK's `runAsync()`).

### Pattern: Tool Approval

| SDK         | Pattern                                                  | Sync/Async               |
| ----------- | -------------------------------------------------------- | ------------------------ |
| gemini-cli  | PolicyEngine + ConfirmationBus                           | Async (message bus)      |
| ADK-TS      | SecurityPlugin.policyCheck()                             | Async (plugin callback)  |
| Claude SDK  | `canUseTool()` callback                                  | Async (callback)         |
| OpenAI      | `mcp_approval_requested` event                           | Event-based              |
| Our Outline | `ElicitationRequest` event + `PolicyEvaluator` interface | Both (event + interface) |

**Observation:** Our approach covers both patterns — the `ElicitationRequest`
event for event-based approval (like OpenAI), and the `PolicyEvaluator`
interface for synchronous policy checks (like gemini-cli/ADK/Claude). This is
the right superset.

### Pattern: Subagent Definition

| SDK           | Pattern                          | Key Fields                                                                                 |
| ------------- | -------------------------------- | ------------------------------------------------------------------------------------------ |
| gemini-cli    | `AgentDefinition` (local/remote) | name, description, kind, tools, model                                                      |
| ADK-TS        | `BaseAgentConfig`                | name, description, subAgents, tools                                                        |
| Claude SDK    | `AgentDefinition`                | description, prompt, tools, model                                                          |
| OpenAI Agents | `Agent` class                    | name, instructions, tools, handoffs, model                                                 |
| Our Outline   | `AgentDescriptor`                | name, description, executor, inputSchema, capabilities, ownTools, requiredTools, subAgents |

**Observation:** Our `AgentDescriptor` is the most complete. Claude's `prompt`
field and OpenAI's `instructions` are executor-level concerns (system prompt),
not descriptor-level. The descriptor declares identity; the executor uses the
prompt. This separation is correct.

One gap: **handoffs**. OpenAI Agents has an explicit `handoffs` field listing
which agents can be delegated to. Our `subAgents` field serves the same purpose
but the naming implies hierarchy rather than peer delegation. Consider whether
`subAgents` should be renamed to `delegateAgents` or kept as-is with
documentation clarifying it covers both hierarchical and peer delegation.

---

## 8. Concrete Changes to outline.md

Based on this analysis, the following changes should be made:

### Applied (validated by multiple SDKs):

1. ✅ **`type: AgentEventType`** with known values + `(string & {})`
   (autocomplete + extensibility)
2. ✅ **`interface AgentEvents` + mapped type** (adopted from Michael for
   declaration merging)
3. ✅ **`agentId` on event base** (which agent emitted this event)
4. ✅ **`_meta` on ContentPart** (aligned with Michael)
5. ✅ **`stream_end` event** — signals why the stream ended, with `reason`
   field + open `data` bag
6. ✅ **Handoff as tool call** — `transfer_to_agent` tool, not a separate event
7. ✅ **`maxBudgetUsd` in AgentConstraints** (Claude SDK, increasingly standard)
8. ✅ **`refusal` ContentPart type** (both Claude and OpenAI surface refusals)
9. ✅ **`forkSession` in ExecutionRequest** (Claude SDK, valuable for
   exploration)
10. ✅ **`permissionMode` in ExecutionOptions** (both gemini-cli and Claude SDK)
11. ✅ **`cost` field on Usage** (Claude SDK tracks total_cost_usd)

### Correctly abstracted (no change needed):

- Event taxonomy (12 types) — validated as right abstraction level
- `AgentDescriptor` shape — most complete across all SDKs
- `AgentSession.stream/update/steer/abort` — covers all SDK patterns
- ToolUpdate — correctly abstracts over OpenAI's 15+ tool-specific progress
  events
- `ElicitationRequest/Response` — covers both callback and event patterns
- `ContentPart` types — text/thought/media/reference/refusal

---

## Sources

- [Claude Agent SDK TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript)
- [Claude Agent SDK Streaming](https://platform.claude.com/docs/en/agent-sdk/streaming-output)
- [Claude Agent SDK Sessions](https://platform.claude.com/docs/en/agent-sdk/sessions)
- [Claude Agent SDK Subagents](https://platform.claude.com/docs/en/agent-sdk/subagents)
- [OpenAI Codex SDK TypeScript](https://github.com/openai/codex/tree/main/sdk/typescript)
- [OpenAI Codex SDK Docs](https://developers.openai.com/codex/sdk/)
- [OpenAI Responses API Streaming Events](https://developers.openai.com/api/reference/resources/responses/streaming-events/)
- [OpenAI Agents SDK Streaming](https://openai.github.io/openai-agents-python/streaming/)
- [Responses API Streaming Guide (Community)](https://community.openai.com/t/responses-api-streaming-the-simple-guide-to-events/1363122)
