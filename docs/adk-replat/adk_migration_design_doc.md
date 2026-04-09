# Architectural Design: Gemini CLI to ADK Migration

| Authors: [Adam Weidman](mailto:adamfweidman@google.com)  Contributors:  Reviewers: *See section [Status of this document](#status-of-this-document).* | Status: Draft  Last revised: Apr 7, 2026 Visibility: Confidential |
| :--- | :--- |

---

# Goal

To migrate the Gemini CLI backend execution engine from its legacy fragmented loop structure to the Agent Development Kit (ADK). This migration will unify how agents and subagents are orchestrated, simplify state persistence, and expose a standard `AgentSession` interface for the CLI, future SDK surfaces, and subagent execution.

---

# Context

Over time, Gemini CLI has accumulated complex runtime behaviors: multi-tier tool scheduling, policy-driven approvals, payload masking, dynamic routing, and fine-grained telemetry. Integrating these with ADK requires a clean boundary that preserves Gemini CLI semantics without forking ADK core behavior.

The key migration boundary is:

- ADK runtime semantics -> Gemini CLI `AgentProtocol` / `AgentSession`
- ADK `Event` stream -> Gemini CLI `AgentEvent` stream

That boundary, not the model wrapper alone, is the architectural center of this design.

---

# Current State and Proposed Mappings

The following analysis maps existing Gemini CLI components onto ADK capabilities, citing both repositories (`gemini-cli` and `adk-js`).

## Core Runtime Architecture

The migration uses one shared ADK-backed runtime core. Every orchestrated agent, including subagents, is exposed through the same external session contract:

- **Top-level CLI agent** -> `AgentSession`
- **Future SDK entry point** -> `AgentSession`
- **Subagent execution** -> `AgentSession`

The runtime owns:

- ADK runner/session lifecycle
- tool execution
- policy integration
- routing, availability, compaction, and masking hooks
- persistence integration

The adapters own:

- `streamId` timing guarantees
- replay / reattach behavior
- translation from ADK `Event` to Gemini CLI `AgentEvent`
- top-level versus subagent event projection
- projection of a child `AgentSession` into parent-facing tool or thread events when a subagent is embedded inside another agent

The minimum shape is:

```typescript
interface PipelineServices {
  run(
    request: LlmRequest,
    baseModel: BaseLlm,
    stream: boolean,
  ): AsyncGenerator<LlmResponse, void>;
  connect(
    request: LlmRequest,
    baseModel: BaseLlm,
  ): Promise<BaseLlmConnection>;
}

class GcliAgentModel extends BaseLlm {
  constructor(
    private baseModel: BaseLlm,
    private pipeline: PipelineServices,
  ) {
    super({model: 'gcli-consolidated'});
  }

  async *generateContentAsync(
    request: LlmRequest,
    stream = false,
  ): AsyncGenerator<LlmResponse, void> {
    yield* this.pipeline.run(request, this.baseModel, stream);
  }

  async connect(request: LlmRequest): Promise<BaseLlmConnection> {
    return this.pipeline.connect(request, this.baseModel);
  }
}
```

Design rule:

- request mutation stays in the pipeline
- all orchestrated agents expose the same `AgentSession` contract
- session lifecycle, replay, approvals, and subagent projection stay in the runtime/adapters

`AdkAgentService` is the composition root for this architecture. It creates and resumes both top-level and subagent `AgentSession`s, builds scoped registries and message-bus instances, wires policy and approval bridges, and embeds child sessions through projection adapters rather than through a separate subagent runtime. See Appendix A for the intended initialization shape.

Composition rule:

- stateful tools are cloned or reinstantiated per session when needed; stateless tools may be shared
- MCP discovery is shared at the manager layer but registered into session-local tool, prompt, and resource registries
- `AgentLoopContext` is decomposed into pipeline config, tool/subagent config, session services, callback bridges, and UI projection rather than passed through as a single runtime object
- file persistence remains Gemini CLI-owned through `GcliFileSessionService extends BaseSessionService`

Persistence rule:

- persisted history is an append-only event log plus derived app/user/session state
- the session service provides atomic append, crash-safe recovery, and single-writer enforcement
- rewind truncates the event log, recomputes derived state, and invalidates confirmation/resumption state past the rewind point

## 3.1 Authentication Flexibility

The CLI resolves distinct authentication flows (OAuth, ADC, Compute metadata) using standard Google libraries.

*   **Current State:** Resolved in `packages/core/src/code_assist/oauth2.ts` based on `AuthType`.
    *   OAuth (`LOGIN_WITH_GOOGLE`)
    *   Compute Metadata Server (`COMPUTE_ADC`)
*   **Constraint:** Standard `Gemini` construction in `adk-js/core/src/models/google_llm.ts` still selects backend from constructor-level `apiKey` or Vertex config. It does **not** natively accept Gemini CLI's `AuthClient`-driven auth shape.
*   **Proposed ADK Mapping:** Phase 1 keeps auth in `GcliAgentModel`. The pipeline resolves refreshed credentials and injects them through `request.config.httpOptions.headers` for unary requests and `request.liveConnectConfig.httpOptions.headers` for live connections.
*   **Design position:** This is a **bridge**, not native ADK auth parity. Long-term cleanup is either:
    *   a `CodeAssistLlm extends BaseLlm`, or
    *   an upstream ADK auth-provider abstraction.

```typescript
request.config ??= {};
request.config.httpOptions ??= {};
request.config.httpOptions.headers = {
  ...request.config.httpOptions.headers,
  Authorization: `Bearer ${await auth.getAccessToken()}`,
};
```

## 3.2 Model Steering and Mid-Stream Injection

User interjections (hints) course-correct the loop mid-turn.

*   **Current State:** Steering today is tied to the legacy loop and injection services.
*   **Proposed ADK Mapping (Next-Step Steering):** Supported in Phase 1. `beforeModelCallback` can read queued hints and mutate the next outbound request.
*   **Proposed ADK Mapping (True Real-Time Interrupt):** Still blocked. TypeScript ADK live runtime is not complete yet, and input-stream semantics are not a stable dependency.
*   **Phase 1 behavior:** user interjections are queued and prepended to the next model request at tool or turn boundaries. True in-place turn interruption remains out of scope.

## 3.3 State Management and Token Compaction

The CLI truncates large tool responses and summarizes older history to protect token budgets.

*   **Current State:** `ChatCompressionService` in `packages/core/src/context/chatCompressionService.ts` implements reverse token budgeting and a two-phase verification loop.
*   **Proposed ADK Mapping:** Compaction remains a Gemini CLI-owned history processor invoked by the request pipeline.
*   **Design position:** Phase 1 does **not** force this onto ADK `BaseContextCompactor`. Gemini CLI compression is currently an outbound-history projection with truncation plus summary/verification sub-calls, while ADK's native compactor path is event-log-centric and mutates session history.
*   **Design choice:** In Phase 1, compaction mutates **outgoing request history only**. The persisted session event log remains canonical.
*   **Utility calls:** Compaction sub-calls use the same routing, auth, and availability pipeline as primary model calls.

## 3.4 Model Configuration and Hierarchical Overrides

Dynamic aliasing (for example, temperature scoped to specific sub-commands).

*   **Current State:** Managed by `ModelConfigService`.
*   **Proposed ADK Mapping:** Resolution stays **request-scoped**, not session-init-scoped.
*   **Design choice:** The session stores requested model and override state. The runtime resolves the concrete model and temperature on each request, including retries, subagents, and utility calls.

## 3.5 Universal Policy Enforcement (TOML Rules)

Tiered workspace restrictions (for example, read-only tools in untrusted folders).

*   **Current State:** Intercepted at tool scheduling time in legacy scheduler loops.
*   **Proposed ADK Mapping (Container):** Standardize on ADK `SecurityPlugin`.
*   **Proposed ADK Mapping (Decision Brain):** Implement `GcliPolicyEngineAdapter implements BasePolicyEngine`.
*   **Richer context:** The adapter is fed session/mode/subagent/MCP metadata from the runtime so current Gemini CLI policy semantics are preserved as closely as possible.
*   **Phase 1 suspension flow:** current tool approvals use existing Gemini CLI callbacks. This is intentionally **non-native** and **non-resumable across process death**.
*   **Long-term target:** move the same policy decisions onto native ADK confirmation/resumption semantics once the broader live/elicitation surface is ready.

```typescript
interface GcliPolicyBridge {
  evaluate(context: ToolCallPolicyContext): Promise<PolicyCheckResult>;
}

export class GcliPolicyEngineAdapter implements BasePolicyEngine {
  constructor(private readonly policyBridge: GcliPolicyBridge) {}

  async evaluate(context: ToolCallPolicyContext): Promise<PolicyCheckResult> {
    return this.policyBridge.evaluate(context);
  }
}
```

## 3.6 Telemetry and Observability (Clearcut Tracking)

Hardware metrics, token counts, and step durations.

*   **Current State:** `ClearcutLogger` reads system metrics and relies on deep scheduler hooks for latency accounting.
*   **Proposed ADK Mapping:** Use a combination of:
    *   passive event-stream observation, and
    *   explicit runtime instrumentation where passive ADK events are insufficient.
*   **Correlation rule:** tool timing is keyed by `functionCall.id`, **not** by `event.id`.
*   **Design position:** Passive stream interception alone is not assumed to provide full parity.

## 3.7 Dynamic Model Routing and Configurability

Banning a model mid-turn, auto-routing via classifiers, and falling back dynamically without reinitializing the session.

*   **Current State:** Managed by `ModelRouterService` and a chain of `RoutingStrategy` implementations which require the full `RoutingContext` (`history`, `request`, `AbortSignal`).
*   **Proposed ADK Mapping:** Mostly implementable now, but not “100% possible today” without bridge logic.
*   **Design choice:** The runtime constructs a proper `RoutingContext` from:
    *   canonical session history
    *   the pending user request
    *   requested model
    *   abort signal
*   **Execution point:** routing remains request-scoped and runs before final dispatch.
*   **Model banning:** treated as routing/fallback selection, not as a synthetic terminal model error.

## 3.8 Fallbacks and Availability Management

Ensuring availability by retrying or switching models when rate limits (429s) or terminal faults occur.

*   **Current State:** Managed by `ModelAvailabilityService` and `ModelPool`.
*   **Proposed ADK Mapping (Preflight):** availability and fallback selection run before dispatch and before routing commits to a concrete model.
*   **Proposed ADK Mapping (Post-failure):** handled separately by the runtime. Availability state mutation and retry decisions are not treated as pure request preprocessing.
*   **Global Application:** utility calls use the same availability/fallback services as primary model calls.
*   **Retry safety rule:** automatic full-turn replay is allowed only before any side-effecting tool has executed. After side effects, the runtime surfaces the failure and requires explicit user action.
*   **Phase 1 transition path:** approvals and fallback prompts continue to use existing Gemini CLI callbacks. The doc treats this as an internal bridge, not as an existing standard ADK elicitation API.

## 3.9 State-Driven Mode Switching (Plan Mode)

Dynamically shifting system prompts and active tools when users switch interaction tiers (for example, Chat Mode to Plan Mode).

*   **Current State:** Toggled via `/plan`, which changes `ApprovalMode` and related legacy scheduler behavior.
*   **Proposed ADK Mapping (Dynamic Prompt):** Use `InstructionProvider` in `LlmAgentConfig.instruction`.
*   **Proposed ADK Mapping (Dynamic Tooling):** Use a custom `BaseToolset` whose filter is derived from session mode.
*   **Single source of truth:** mode is session/runtime state derived from current approval mode; prompt, toolset, policy, routing, and UI all consume the same state.

```typescript
export class GcliModeAwareToolset extends BaseToolset {
  constructor(
    private readonly chatTools: BaseTool[],
    private readonly planTools: BaseTool[],
  ) {
    super(() => true);
  }

  async getTools(context?: ReadonlyContext): Promise<BaseTool[]> {
    const isPlan = context?.state.get('plan_mode') === true;
    return isPlan ? this.planTools : this.chatTools;
  }

  async close(): Promise<void> {}
}
```

## 3.10 Tool Output Masking

Managing context window efficiency by offloading bulky tool outputs (for example, shell logs and large file reads) to files.

*   **Current State:** `ToolOutputMaskingService` in `packages/core/src/context/toolOutputMaskingService.ts`.
*   **Proposed ADK Mapping:** masking runs on **outgoing request history only**, after compaction.
*   **Design choice:** persisted session history remains the canonical event log. Masking artifacts are session-scoped files referenced from the outbound request projection.

---

# 5. Known Gaps in ADK (Gating Blockers)

This section highlights existing gaps in standard ADK that prevent a seamless cutover without bridge logic or upstream changes.

## 5.1 Real-Time User Message Injections (Aborted Turns)

While next-step steering is possible today using `beforeModelCallback`, true real-time interruption requires:

- stable input-stream support, and
- a complete TypeScript live runtime

Until then, the supported behavior is queued next-step steering at model boundaries, not mid-stream interruption.

## 5.2 Conversation Rewind and State Reversal

Translating manual trajectory drops to ADK runtime state is cumbersome. While Python ADK supports rollback, TypeScript ADK does not yet support it natively.

*   **Resolution Strategy:** Gemini CLI implements rewind in `GcliFileSessionService`, but **not** as a shallow JSON edit. Rewind truncates the event log, recomputes derived state, and invalidates any confirmation/resumption state past the rewind point.

## 5.3 Phase 1 Non-Goals

To keep the migration surface bounded, Phase 1 intentionally excludes:

- non-interactive surfacing of `elicitation_request` / `elicitation_response`
- true live/bidi interruption semantics
- native ADK confirmation/resumption parity for approvals and fallback prompts

---

# Long-Term Vision: Unification of Agents and Subagents

The long-term vision is that subagents and the primary agent share:

- the same runtime core
- the same tool definitions
- the same policy constraints
- the same configuration schemas
- the same orchestration contract: `AgentSession`

What may differ is the **embedding adapter**:

- standalone/top-level agent -> consumed directly as `AgentSession`
- subagent embedded by a parent agent -> projected from its `AgentSession` into parent-facing tool or child-thread events

For SDK-first unification, Gemini CLI orchestration targets `AgentSession`, not a specific ADK tool abstraction. When a subagent must be exposed to a parent model as a tool, Gemini CLI wraps that child `AgentSession` with a `FunctionTool` or custom `BaseTool` projection. `AgentTool` remains the native ADK nested-agent option if we later want full ADK-native nested-agent semantics.

---

# Migration Sequence and Unification Checklist

The migration remains non-sequential, but each phase has an explicit success condition:

- [ ] **Non-interactive session parity** `#22699`
  output/error parity, basic replay correctness, feature-flagged rollout
- [ ] **Interactive session parity** `#22701`
  projected event parity, approval bridge wiring, no live-interrupt claim
- [ ] **Subagent adapter parity** `#22700`
  tool isolation, activity projection, policy/routing parity for child runs
- [ ] **ADK session conformance** `#22974`
  `AgentSession` timing/replay guarantees preserved by the adapter
- [ ] **Skills parity** `#22966`
  skills work through the shared runtime without special legacy paths
- [ ] **Policy and confirmation parity** `#22964`
  phase-1 callback bridge stable; native confirmation migration scoped separately
- [ ] **Compaction quality parity** `#22979`
  comparable summarization and truncation quality to current behavior

---

# Appendix A: Initialization Sketch

The main agent and subagents share the same composition root. The difference is whether the resulting `AgentSession` is consumed directly or projected into a parent session.

```typescript
shared = {
  baseModel,
  modelConfigService,
  availabilityService,
  router,
  authService,
  policyEngine,
  mcpClientManager,
  skillCatalog,
  baseToolCatalog,
  sessionService,
}

agentService = new AdkAgentService(shared)

function createSession(definition, parentSessionId?) {
  sessionRecord = sessionService.create({ definition, parentSessionId })
  registries = buildScopedRegistries(definition, parentSessionId)
  pipeline = createPipeline({
    sessionId: sessionRecord.id,
    agentId: definition.name,
    parentSessionId,
  })

  model = new GcliAgentModel(baseModel, pipeline)
  runtime = createAdkRuntime({
    definition,
    model,
    sessionRecord,
    registries,
    policyEngine,
  })

  return new AgentSession(new AdkAgentProtocolAdapter(runtime))
}

function createSubagentTool(definition) {
  return new FunctionTool(async (input, toolContext) => {
    child = createSession(definition, toolContext.sessionId)
    stream = await child.send(userMessage(input))

    for await (event of child.stream(stream)) {
      projectChildEventToParent(toolContext, event)
    }

    return collectFinalText()
  })
}
```

Child session projection shape:

```typescript
emit(tool_request({ requestId, name: definition.name, args: input }))

for await (event of childSession.stream({ streamId })) {
  if (event.type === 'message' || event.type === 'tool_update') {
    emit(
      tool_update({
        requestId,
        content: projectDisplayContent(event),
      }),
    )
    continue
  }

  if (event.type === 'error') {
    emit(
      tool_response({
        requestId,
        name: definition.name,
        isError: true,
        content: projectErrorContent(event),
      }),
    )
    return
  }

  if (event.type === 'agent_end') {
    emit(
      tool_response({
        requestId,
        name: definition.name,
        content: collectFinalChildResult(),
      }),
    )
    return
  }
}
```

Only the final `tool_response` is returned to the parent model. `tool_update` remains a progress/UI projection surface.

Service lifetime split:

- shared across sessions: model config, availability, routing, auth, policy engine, MCP manager, skill catalog
- scoped per agent/session: `AgentSession`, pipeline instance, tool/prompt/resource registries, derived message bus
- scoped per invocation: shell process, MCP request, confirmation continuation, tool progress updates

---

# Status of this document approvals table {#status-of-this-document}

| #begin-approvals-addon-section See [go/g3a-approvals](http://goto.google.com/g3a-approvals) for instructions on adding reviewers. |
| :---: |
.
