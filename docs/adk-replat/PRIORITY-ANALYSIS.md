# Interface Priority Analysis & Open Questions

## The Big Picture

We're defining **framework-agnostic interfaces** that allow gemini-cli to:

1. Keep its existing execution loop working unchanged (Legacy path)
2. Swap in ADK as an alternative runtime via config flag
3. Eventually support OpenRouter or other agent backends
4. Maintain all existing CLI behavior: hooks, policies, confirmations, UI events

## Proposed Interface Layers (Priority Order)

---

### P0 (Critical Path - Must Define First)

#### 1. AgentEvent / Event Stream Contract

**Why first:** Everything else consumes or produces these events. The UI renders
them. The hooks intercept them. The adapters translate to/from them.

**Key decision:** Merge Dewitt's simpler model with Coworker's richer model?

**Recommendation:** Coworker's approach is more complete. Key additions:

- `threadId` for sub-agent tracking (AG-UI has `parentRunId`)
- `tool_update` for progress on long-running tools
- `elicitation_request/response` as first-class (not just tool_confirmation)
- `usage` event for token tracking
- `_meta` escape hatch (matches AG-UI's extensibility philosophy)
- `initialize` event (matches AG-UI's RunStarted)

**Open questions:**

- Do we need AG-UI's start/content/end triple pattern for streaming? Or is
  yielding partial events sufficient?
- How do ContentPart types map to existing gemini-cli Part types?
- Should events carry a `source` field? (useful for hook attribution)

#### 2. Agent Interface

**Why second:** This is the primary abstraction that LocalAgentExecutor, ADK
adapters, and future OpenRouter adapters all implement.

**Key decision:** Dewitt's `runAsync/runEphemeral` vs Coworker's
`send(Trajectory|string)`

**Recommendation:** Hybrid approach:

- Dewitt's `runAsync/runEphemeral` split is ADK-aligned and cleaner for the
  factory pattern
- BUT add Coworker's elicitation support via AgentSend union type
- The Trajectory concept is powerful but may be too opinionated for Phase 2

```
Agent<TInput, TOutput>
  name: string
  description: string
  runAsync(input, options) → AsyncGenerator<AgentEvent, TOutput>
  runEphemeral(input, options) → AsyncGenerator<AgentEvent, TOutput>
```

**Open questions:**

- Should Agent also support `send()` for mid-stream interactions (elicitations)?
- How does AbortSignal propagate through the adapter boundary?
- Do we need a `capabilities` field (supports elicitation? supports HITL? etc.)?

#### 3. Tool Execution Contract

**Why third:** Tools are the primary action mechanism. Both the policy engine
and hooks system wrap tool execution.

**What needs abstracting:**

- Tool declaration (name, schema) — already somewhat generic via JSON Schema
- Tool execution (args → result)
- Tool confirmation flow (ASK_USER → user decision → proceed/deny)
- Tool result shape (llmContent + displayContent + error + tailCalls)

**Key decision:** Keep DeclarativeTool pattern or flatten to a simpler
interface?

**Recommendation:** Define a minimal `ToolExecutor` interface:

```
ToolExecutor {
  name: string
  description: string
  schema: JSONSchema
  execute(args, context): Promise<ToolResult>
  requiresConfirmation?(args, context): Promise<boolean>
}
```

DeclarativeTool remains the concrete implementation. ADK's BaseTool adapts to
this.

**Open questions:**

- How do MCP tools fit? They already have their own protocol.
- Tool annotations (destructive hints) — should these be in the interface?
- Long-running tools need progress reporting — how does this interact with
  tool_update events?

---

### P1 (Important - Define After P0)

#### 4. Policy / Permission Interface

**Why important:** Every tool call goes through policy. External agents need
policy enforcement too.

**Current state:** gemini-cli has a sophisticated TOML-based policy engine with
tiered priorities. ADK-TS has a simpler SecurityPlugin with PolicyOutcome
(DENY/CONFIRM/ALLOW).

**What needs abstracting:**

```
PolicyEngine {
  evaluate(toolName, args, context): PolicyDecision  // ALLOW | DENY | ASK_USER
  getExcludedTools(): string[]  // Tools statically denied
}
```

**Key decision:** Do external agents (OpenRouter, etc.) get the same policy
enforcement?

**Open questions:**

- If an ADK agent calls a tool internally, does gemini-cli's policy apply?
- With `pauseOnToolCalls: true` in ADK, the CLI controls execution — but what
  about headless mode?
- How do agent-level policies work? (allow/deny entire agents, not just tools)
- Should policy be a middleware (AG-UI pattern) or a callback (ADK plugin
  pattern)?

#### 5. Hooks Interface

**Why important:** Hooks are a major gemini-cli feature. They need to work
regardless of which agent backend runs.

**Current state:** 11 hook types firing at specific lifecycle points.

**What needs abstracting:**

- Hook lifecycle must be backend-agnostic
- BeforeModel/AfterModel hooks need to work even when ADK controls the model
- BeforeTool/AfterTool hooks need to intercept regardless of who executes the
  tool

**Key challenge:** When ADK runs the model internally, gemini-cli hooks can't
easily intercept. **Dewitt's solution:** ADK uses gemini-cli's model via
AdkGeminiModel adapter — hooks fire inside GeminiChat.

**Open questions:**

- If OpenRouter runs the model, how do BeforeModel/AfterModel hooks work?
- Do we need a "model steering" abstraction (injecting context mid-stream)?
- Can hooks be expressed as AG-UI middleware? (intercept event stream)

#### 6. Model / LLM Interface

**Why important:** Model abstraction enables swapping LLM providers.

**Dewitt's approach:** Exposes Model interface, ADK uses it via AdkGeminiModel
adapter. **Coworker's approach:** Model is internal to Agent (no separate Model
interface).

**Recommendation:** Keep Dewitt's separate Model interface BUT make it
provider-agnostic:

- Remove `@google/genai` types from the interface signature
- Define generic Message/Content types
- Model interface is an implementation detail, not part of the Agent contract

**Open questions:**

- Can we define a truly provider-agnostic Model interface?
- Or is the Model always tied to the agent backend? (ADK uses Gemini, OpenRouter
  uses whatever)
- Model routing (choosing which model) — is this a concern of the Model
  interface or a separate service?

---

### P2 (Important but Can Follow)

#### 7. Session / State Interface

**Current state:** gemini-cli uses ChatRecordingService (JSON files). ADK uses
Session with BaseSessionService.

**What needs abstracting:**

- Session creation/retrieval
- State persistence across turns
- History/trajectory management

**Open questions:**

- Does the trajectory (coworker's concept) replace gemini-cli's chat recording?
- Should session state be shared between gemini-cli and the agent backend?

#### 8. Elicitation / User Interaction Interface

**What it covers:** Model fallback dialogs, tool confirmations, Ctrl+B
interrupts, user questions

**Current state:** gemini-cli uses ConfirmationBus + MessageBus. AG-UI uses
frontend tools.

**Open questions:**

- Is elicitation just a special case of tool calls (AG-UI approach)?
- Or is it a first-class event type (coworker's approach)?
- How does Ctrl+B (cancel/interrupt) propagate through the agent boundary?

#### 9. Configuration / Capability Discovery

**What it covers:** Feature flags, experiment settings, agent capabilities

**Open questions:**

- How does an external agent declare its capabilities?
- Does OpenRouter support HITL? Elicitation? Tool confirmation? Each agent may
  differ.
- Need a `capabilities` negotiation at connection time?

---

### P3 (Future / Can Defer)

#### 10. A2UI / Rich UI Interface

- Declarative UI generation from agents
- Not critical for Phase 2 but important for differentiation

#### 11. Memory / Artifact Interface

- ADK has memory/artifact services
- gemini-cli has ChatRecordingService + memory tools
- Can standardize later

#### 12. Telemetry / Observability Interface

- Both systems have telemetry
- Can standardize later

---

## Critical Open Questions (Need Team Discussion)

### 1. OpenRouter Integration Model

**Question:** When OpenRouter (or any external agent) is used, what does the
integration look like?

**Option A: Full Agent Interface** — OpenRouter implements the Agent interface
directly

- Pro: Clean, uniform
- Con: OpenRouter doesn't support HITL, hooks, policies natively

**Option B: ACP Shim** — Agent Communication Protocol between CLI and external
agents

- Pro: Standards-based
- Con: Additional protocol layer, may be premature

**Option C: Model-only Integration** — OpenRouter is just an alternative Model,
not Agent

- Pro: Simpler, leverages existing agent loop
- Con: Doesn't support OpenRouter-specific features

**Recommendation:** Start with Option C (model-only). OpenRouter provides an LLM
endpoint. Gemini-cli's own agent loop handles tools, policies, hooks. This means
defining a provider-agnostic Model interface is the key enabler.

### 2. Tool Execution: Client-side vs Agent-side

**Question:** Who executes tools — the CLI or the agent backend?

**Option A: Always client-side** (CLI executes, agent suspends)

- ADK: `pauseOnToolCalls: true`
- Pro: CLI maintains control, policies enforced, hooks fire
- Con: Higher latency, more round-trips

**Option B: Agent-side execution** (agent runs tools internally)

- Pro: Faster, simpler
- Con: Bypasses CLI policies, hooks, confirmations

**Option C: Configurable** — CLI decides per-tool or per-agent

- Pro: Flexible
- Con: Complex

**Recommendation:** Option A for safety-critical CLI use case. Option B only for
trusted/sandboxed sub-agents.

### 3. Model Steering (Hooks that inject context mid-stream)

**Question:** How do user-local hooks (like injecting project context) work with
external agents?

**Answer:** They can only work if:

- The CLI controls the model (via Model interface adapter) — then BeforeModel
  hook injects context
- OR the agent supports a "system instruction update" mechanism

For OpenRouter: model steering works because CLI controls the model call. For
ADK: model steering works because AdkGeminiModel wraps GeminiChat. For fully
opaque agents: model steering **cannot work** — this is a known limitation.

### 4. Elicitation Flow

**Question:** When the agent needs user input (model fallback, clarification),
how does it work?

**For CLI-controlled agents:** Agent yields an elicitation_request event → CLI
renders prompt → user responds → CLI sends response back via session.stream({
kind: 'elicitation_response', ... }) to resume

**For external agents:** Agent uses A2A protocol or similar to send elicitation
→ CLI bridges the request to user → response sent back via protocol

**Key insight:** Elicitation is fundamentally about the agent SUSPENDING and
waiting for user input. ADK already supports this via `pauseOnToolCalls`. Can we
generalize to `pauseOnElicitation`?

### 5. Sub-agent Identity and Policies

**Question:** When a sub-agent spawns, does it inherit parent policies? Get its
own?

**Current gemini-cli behavior:** Sub-agents registered as tools, go through same
policy engine. **ADK behavior:** Sub-agents are child nodes in agent tree, get
parent's plugins.

**Recommendation:** Sub-agents inherit parent policy context. Additional
restrictions can be layered (e.g., sub-agent X cannot use shell tool). This is
already how gemini-cli works.
