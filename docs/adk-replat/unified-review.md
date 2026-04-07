# Unified ADK CLI Design Review

Date: 2026-04-06

> **Rollout:** All ADK migration work is feature-gated behind `experimental.adk` flags. No behavioral changes ship without an explicit opt-in. This applies to both non-interactive and interactive flows.

Inputs merged:
- `claude-adk-cli-design-review.md` (adversarial code-level review)
- `codex-adk-cli-design-review.md`
- Follow-up review discussion on subagent architecture, session semantics, and `BaseContextCompactor`

Scope reviewed:
- `gemini-cli/docs/adk-replat/adk_migration_design_doc.md`
- `gemini-cli` `AgentProtocol` / `AgentSession` / interactive migration work
- `adk-js` runner / session / tool / security / model architecture
- PR context for interactive migration, including `google-gemini/gemini-cli#24297`

## Executive Summary

The design is directionally sound and the migration goal is correct. However, the document is not yet principal-review ready due to:

1. **Four non-compilable code samples** (C1-C4) that will immediately erode reviewer confidence
2. **An under-specified translation boundary** — the ADK→AgentProtocol mapping is the real architecture, but the doc treats it as an afterthought
3. **Overclaimed parity** in routing, telemetry, and approvals
4. **Missing phased plan** with clear milestones and non-goals

The central architectural insight is right: the migration boundary is:

- `adk-js Event -> Gemini CLI AgentEvent`
- `adk-js session/runtime semantics -> AgentProtocol / AgentSession semantics`

That boundary carries stream lifecycle, replay/resume, event projection, approval correlation, and persistence correctness. Until the translation architecture is explicit, parity claims remain unsupported.

## Compilation Blockers (Must Fix First)

These are binary errors — the code samples in the design doc will not compile against current ADK types.

### C1. `LlmRequest` has no `headers` field

`adk-js/core/src/models/llm_request.ts` defines: `model?`, `contents`, `config?`, `liveConnectConfig`, `toolsDict`. The design doc's `request.headers = {...}` will silently fail or not compile. **Fix:** use `llmRequest.config.httpOptions.headers` or pass headers at `Gemini` constructor time.

### C2. `BaseLlm.connect()` is abstract and unimplemented

`adk-js/core/src/models/base_llm.ts:67-78` has TWO abstract methods: `generateContentAsync` and `connect()`. `GcliAgentModel` must implement both. **Fix:** add `connect()` — stub with `throw new Error('not supported')` if live connections are out of scope.

### C3. `BaseToolset` constructor signature is wrong

`adk-js/core/src/tools/base_toolset.ts:46-49`: `constructor(readonly toolFilter: ToolPredicate | string[], readonly prefix?: string)`. The design doc's `super([])` passes an empty array as `toolFilter`, which makes `isToolSelected` return false for all tools — a silent bug. Also `close()` is abstract and must be implemented. **Fix:** match the actual signature.

### C4. `FunctionalTool` does not exist

The design doc references `FunctionalTool` for subagent wrapping. This class does not exist in adk-js. The correct classes are `FunctionTool` (wraps a plain function) and `AgentTool` (wraps an agent with isolated runner). See subagent architecture section below for the recommended approach.

---

## High-Risk Findings

### 1. The actual migration boundary is under-specified

Current `AgentProtocol` requires `send()` timing guarantees, replay/reattach semantics, `streamId`, and optional `threadId` for subagent threads in `gemini-cli/packages/core/src/agent/types.ts` and `gemini-cli/packages/core/src/agent/agent-session.ts`.

ADK emits a different event model in `adk-js/core/src/events/event.ts`.

The doc needs a first-class architecture section for:
- `AdkSessionRuntime`
- `AdkEventTranslator`
- event buffering / replay
- `threadId` mapping
- `tool_update` mapping
- `agent_start` / `agent_end` ownership

Without that, the rest of the design sits on an unstated core contract.

### 2. The consolidated decorator needs two concerns extracted

The `GcliAgentModel.generateContentAsync` pipeline is a reasonable orchestrator pattern — each concern is a separate injected service call, not a monolithic class. However, two concerns don't belong in the model layer:

- **Quota/availability prompting** — involves interactive UI suspension, not request mutation. Should use `beforeModelCallback` on `LlmAgent`.
- **Policy/approval control flow** — involves blocking for user input. Should use `beforeToolCallback` or the `ApprovalBridge` (see architecture section).

The remaining concerns (auth header injection, routing/model rewrite, compaction, masking) are legitimate request-preprocessing and can stay in the model pipeline.

### 3. The design frequently conflates “possible with custom logic” with “supported by current ADK architecture”

This is one of the main wording risks.

Several statements currently read like native ADK parity when the real meaning is:
- possible with substantial Gemini CLI-owned bridge logic
- possible by bypassing native ADK facilities
- possible only for phase 1 with intentionally degraded semantics

That distinction needs to be explicit everywhere the doc uses strong language like “validated” or “100% possible today.”

### 4. Auth architecture is deeper than header injection — Coast Assist requires a custom transport

The auth section has two distinct problems:

**Problem A: API surface mismatch (C1).** `LlmRequest` has no `headers` field. Per-request headers are possible via `llmRequest.config.httpOptions.headers`, and `Gemini` constructor accepts a `headers` param (`google_llm.ts:57,79`). This is fixable.

**Problem B: Coast Assist / `LOGIN_WITH_GOOGLE` uses a different backend entirely.** The current `CodeAssistServer` (`packages/core/src/code_assist/server.ts:407`) does NOT call the standard Gemini API. It uses `google-auth-library`'s `AuthClient.request()` to talk to a Code Assist backend endpoint. The OAuth flow (`packages/core/src/code_assist/oauth2.ts`) handles browser launch (L305), local callback server (L492-615), token exchange (L546-550), credential caching (L739-750), and automatic token refresh via `OAuth2Client`.

This means `GcliAgentModel` cannot wrap a standard `Gemini` BaseLlm and just inject headers. For Coast Assist auth, `GcliAgentModel` must **extend `BaseLlm` directly** and implement its own HTTP transport using `AuthClient.request()`, translating between `LlmRequest`/`LlmResponse` and the Code Assist protocol.

What works:
- The OAuth dance itself (browser launch, token caching, refresh) runs before the agent session starts — no blocking inside `generateContentAsync`
- `OAuth2Client.getAccessToken()` handles mid-session token refresh transparently
- Per-request header injection works for API-key-based auth via `httpOptions.headers`

What the design doc must change:
- Stop assuming `Gemini` as the inner model — `GcliAgentModel extends BaseLlm` directly
- Define two transport paths: standard Gemini API (API key) and Code Assist backend (OAuth)
- The dummy-key workaround is irrelevant for Coast Assist — you never call `GoogleGenAI.models.generateContent`

### 5. Approval / elicitation bridging is acceptable only as a temporary non-native bridge

The design’s callback-based approval approach is pragmatic for phase 1, but it bypasses native ADK confirmation semantics.

`adk-js/core/src/plugins/security_plugin.ts` and `adk-js/core/src/agents/processors/request_confirmation_llm_request_processor.ts` show that ADK’s model is:
- `ALLOW | DENY | CONFIRM`
- persisted confirmation state
- later resumption from history

Blocking in callbacks may be acceptable for the first rollout, but the doc must say clearly:
- local-only bridge
- not resumable across process death
- not long-term SDK behavior
- intentionally non-native pending future elicitation/bidi work

### 6. Rewind is deeper than file truncation

The doc treats rewind as storage truncation. The storage part is straightforward — `GcliFileSessionService` wraps the existing `ChatRecordingService` and implements 4 abstract methods (`createSession`, `getSession`, `listSessions`, `deleteSession`). DB-level concerns (locking, stale-writer detection, `PESSIMISTIC_WRITE`) do not apply to a single-user CLI.

However, rewind itself is not just storage:
- `adk-js/core/src/agents/processors/request_confirmation_llm_request_processor.ts` scans event history to reconstruct pending confirmations and resume tool execution
- `adk-js/core/src/runner/runner.ts:447` has a TODO acknowledging the event log is used as a transaction log
- Truncating events without rolling back derived state (pending confirmations, app/user state prefixes) will break resumption

The doc should define rewind as: event-log truncation + session state recomputation + confirmation/auth state rollback.

Note: `BaseSessionService.appendEvent` handles state merging with `app:`, `user:`, `temp:` prefixed keys automatically — this is inherited for free.

### 7. Routing, telemetry, and plan mode are all overclaimed

Routing:
- current routing requires a richer `RoutingContext`
- `contents.slice(0, -1)` / `contents.pop()` is not a sufficient or type-accurate mapping
- model banning via simulated error is not the same as model routing

Telemetry:
- **The stream-interceptor approach in section 3.6 is wrong.** The correct mechanism is ADK's `BasePlugin` system.
- `event.id` is not a safe per-tool correlation key — use `functionCall.id` via `beforeToolCallback`/`afterToolCallback`
- ADK can batch multiple function calls or responses in one event — stream interception cannot distinguish them, but plugin hooks fire per-tool with distinct `functionCallId`
- **Correction:** Token usage IS available on ADK events. `llm_agent.ts:831-834` spreads `LlmResponse` (including `usageMetadata`) into the event via `createEvent({...modelResponseEvent, ...llmResponse})`. Additionally, `afterModelCallback` receives the raw `LlmResponse` with `usageMetadata` directly — providing a second capture point.
- HTTP-level metrics (status code, request duration) are NOT on ADK events — must be captured in the `GcliAgentModel` wrapper
- The sample APIs in the design do not match the current `ClearcutLogger` taxonomy (~195 distinct metadata keys)

**Recommended telemetry architecture:**

| Metric Category | Capture Mechanism | ADK Hook |
|---|---|---|
| Token counts (input, output, cached, thinking) | `afterModelCallback` → `LlmResponse.usageMetadata` | `BasePlugin.afterModelCallback` |
| Per-tool timing | Timer keyed on `functionCallId` | `BasePlugin.beforeToolCallback` / `afterToolCallback` |
| Agent lifecycle | Start/end tracking | `BasePlugin.beforeAgentCallback` / `afterAgentCallback` |
| Model errors | Error classification | `BasePlugin.onModelErrorCallback` |
| HTTP status, API duration | Captured in model wrapper | `GcliAgentModel.generateContentAsync` |
| Routing decisions, latency | Captured in model or beforeModelCallback | `beforeModelCallback` / model wrapper |
| Context token breakdowns (system, tools, history) | Computed in request pipeline | Model wrapper |
| Tool approval decisions | Injected from approval layer | `ApprovalBridge` |
| Session config, compression, rewind, IDE, extensions, billing, slash commands, hooks, plan execution, onboarding | **Unchanged** — stays in current call sites | Existing gemini-cli code |

~30% of Clearcut metrics map to ADK plugin hooks. ~70% remain in their current call sites unchanged.

Plan mode:
- current behavior is broader than prompt + tool filtering
- policy, approval mode, routing, and config refresh are all part of the behavior

### 8. Retry safety around side effects (note)

The “full turn reset” proposal could duplicate side effects (file writes, shell commands, MCP mutations) if the turn already executed side-effecting tools before the stream failure. This is an ADK-wide concern, not specific to this migration. A brief note acknowledging this limitation is sufficient — a full retry safety taxonomy is out of scope for this design.

### 9. Design ignores ADK's native `BaseContextCompactor`

ADK already has a compaction extension point: `BaseContextCompactor` (`adk-js/core/src/context/base_context_compactor.ts`) with `shouldCompact(invocationContext)` + `compact(invocationContext)`. It's wired into the request processor pipeline via `ContextCompactorRequestProcessor` at `llm_agent.ts:407-420`.

The design doc proposes running compaction inside `GcliAgentModel.generateContentAsync` instead. This works but bypasses the native slot. Recommendation: implement `BaseContextCompactor`, delegate to the existing `ChatCompressionService` internally. ADK provides the trigger point; your service provides the logic. Note that `BaseContextCompactor` returns void — failure states (COMPRESSED, NOOP, CONTENT_TRUNCATED, etc.) must be communicated via session state or custom events.

### 10. Existing `isStructuredError` type-guard bug

`gemini-cli/packages/core/src/agent/event-translator.ts:431-438`: `isStructuredError()` checks only `typeof error === 'object' && 'message' in error && typeof error.message === 'string'`. Since every `Error` instance has `message: string`, plain `Error` objects pass this guard. In `mapError` (lines 390-429), the structured branch runs before `instanceof Error`, so plain errors get incorrect HTTP→gRPC status mapping. This should be fixed before the translator becomes the long-term session boundary. **Fix:** add `'status' in error` to the guard, or check `instanceof Error` first.

### 11. The review should distinguish architecture defects from rollout-status evidence

The interactive PR findings matter:
- stacked-branch dependency
- hook-order risk in `#24297`
- `_meta.legacyState` leakage into protocol events

But they are secondary to the core design defect, which is the missing runtime/translation architecture.

These findings should stay in the review, but as credibility and rollout-risk evidence rather than the centerpiece.

## Recommended Architecture

This is the cleanest merged recommendation from both reviews plus follow-up discussion.

### Core principle

Use one shared ADK-based execution/runtime core, then put different adapters on top of it.

Do not make `AgentSession` the innermost engine.

### Recommended split

1. `AdkRuntimeCore`
- owns the ADK runner loop
- owns tool execution, policy integration, routing integration, masking, compaction hooks, and persistence hooks
- emits runtime-level activity/events

2. `TopLevelSessionAdapter`
- exposes the runtime as `AgentProtocol` / `AgentSession`
- owns replay, reattach, `streamId`, `threadId`, `agent_start` / `agent_end`, and top-level event projection

3. `SubagentTools` (custom `BaseTool` implementations)
- subagents invoke the same shared runtime core as the main agent
- the only difference is the type mapping at the boundary (projecting child activity into parent-facing `tool_update` / `tool_response` or `threadId`-scoped events)
- `AgentTool` is explicitly rejected — it creates a fully isolated runner/session, which conflicts with the shared-core goal
- custom `BaseTool` wrappers allow subagents to share policy, routing, tool definitions, and config with the parent while keeping the door open for future resumability and richer state sharing

4. `ApprovalBridge`
- phase-1 callback bridge for approvals / elicitation using existing callbacks
- clearly documented as temporary and non-native
- eventual migration to full elicitation bidi format

5. `GcliFileSessionService`
- file-backed persistence wrapping existing `ChatRecordingService`
- implements 4 abstract methods from `BaseSessionService`
- inherits state-merging (app/user/temp prefixes) for free
- single-writer model — concurrent runs per session are forbidden

### Subagent architecture decision

`AgentTool` is not the right abstraction for this migration. It creates an isolated runner with its own `InMemorySessionService`, meaning:
- state is NOT shared with the parent
- events are NOT projected into the parent stream
- policy, routing, and config are NOT inherited

The core requirement is that subagents use the same core loop functionality as the main agent — the only difference is how results are mapped back to the parent. Custom `BaseTool` implementations that invoke the shared `AdkRuntimeCore` achieve this. This also positions subagents for future complexity (resumability, richer state sharing, MCP-scoped tool sets) without fighting AgentTool's isolation model.

### Session conclusion

Main agent and subagents can share the same underlying runtime core.

But they should not necessarily share the exact same public adapter.

The right formulation is:
- same core runtime
- different event/session projections depending on embedding context

## Section-by-Section Unified Review

### 3.1 Authentication Flexibility

Assessment: implementable, but the design doc’s approach is wrong for Coast Assist.

Keep:
- ADK `Gemini` does not natively accept the CLI’s auth shape

Change:
- `GcliAgentModel` must extend `BaseLlm` directly, not wrap `Gemini` — Coast Assist uses `AuthClient.request()` against a non-standard backend, not `GoogleGenAI`
- fix `request.headers` to `llmRequest.config.httpOptions.headers` (C1)
- define two transport paths: API-key (standard Gemini) and OAuth (Code Assist)
- token refresh is transparent via `OAuth2Client` — this works as-is
- browser-based OAuth runs before agent session starts — no blocking concern

### 3.2 Model Steering and Mid-Stream Injection

Assessment: next-turn steering is plausible now; true live interruption is still blocked.

Required change:
- split “next-step steering” from “true mid-turn interruption”
- define temporary user-visible behavior until live input-stream support exists

### 3.3 State Management and Token Compaction

Assessment: plausible, but too wrapper-centric.

Required change:
- specify whether compaction operates on persisted history, outgoing request history, or both
- define recursion guards and utility-call isolation
- define artifact ownership across sessions and subagents

### 3.4 Model Configuration and Hierarchical Overrides

Assessment: under-specified.

Required change:
- model config resolution should remain request-scoped
- preserve scoped overrides and retry-aware behavior
- explain subagent and utility-call override behavior

### 3.5 Universal Policy Enforcement

Assessment: acceptable as a bridge, not as full parity.

Required change:
- explicitly document reduced phase-1 semantics
- list policy inputs lost unless extra context plumbing is added
- separate short-term callback bridge from long-term native confirmation flow

### 3.6 Telemetry and Observability (Clearcut)

Assessment: fully implementable, but the stream-interceptor approach must be replaced with a `BasePlugin`.

Required change:
- replace stream interception with `ClearcutTelemetryPlugin extends BasePlugin`
- use `afterModelCallback` for token counts (`LlmResponse.usageMetadata` is available)
- use `beforeToolCallback`/`afterToolCallback` with `functionCallId` for per-tool timing
- capture HTTP-level metrics (status code, duration) in `GcliAgentModel` wrapper
- ~70% of Clearcut metrics stay in their current call sites unchanged — document which
- replace fake API examples with a telemetry parity matrix showing capture mechanism per metric

### 3.7 Dynamic Model Routing and Configurability

Assessment: partly feasible, materially overstated.

Required change:
- remove “100% possible today”
- separate alias rewrite, fallback selection, classifier routing, and banning/rejection behavior
- define a real `RoutingContextBuilder`

### 3.8 Fallbacks and Availability Management

Assessment: incomplete.

Required change:
- split preflight fallback from post-failure transition behavior
- define retry safety
- define main-call vs utility-call fallback ownership

### 3.9 State-Driven Mode Switching

Assessment: too narrow.

Required change:
- define a single mode state source of truth
- enumerate all consumers: prompt, toolset, policy, router, UI

### 3.10 Tool Output Masking

Assessment: one of the stronger sections.

Required change:
- define whether masking mutates persisted history or only outgoing request history
- define ordering and idempotence relative to compaction
- define file/artifact lifecycle

### 4. SDK Facade / Stateful Orchestration

Assessment: this should become the architectural center of the document.

Required change:
- expand ownership boundaries
- describe the shared runtime plus adapter model
- document temporary approval/elicitation limitations explicitly

### 4.1 Hybrid Tool Instantiation

Assessment: directionally good.

Required change:
- include message bus derivation
- include MCP discovery scoping
- include recursion prevention and tool isolation details

### 4.2 Custom File-Based Persistence

Assessment: straightforward for storage, but rewind semantics need work.

The storage layer itself is low-risk — `GcliFileSessionService` wraps existing `ChatRecordingService` and implements 4 abstract methods. DB concerns (locking, stale-writer, crash recovery) don't apply to a single-user CLI.

Required change:
- define rewind as event-log truncation + state recomputation (not just file truncation)
- state that concurrent runs per session are forbidden (single-writer)
- define how app/user/temp state prefixes map to existing workspace JSON

### 4.3 Decomposing `AgentLoopContext`

Assessment: right instinct, incomplete decomposition.

Required change:
- account for message bus / confirmation routing
- account for injection queues
- account for prompt/resource registries and MCP scoping

### 5.1 Real-Time User Message Injections

Assessment: blocker analysis is incomplete.

Required change:
- mention TS live runtime gaps directly
- describe temporary UX until true interruption exists

### 5.2 Conversation Rewind and State Reversal

Assessment: too shallow today.

Required change:
- define rewind as event-log truncation plus state rollback semantics
- define confirmation/auth rollback semantics
- define artifact/version rollback expectations

### 5.3 Concurrent Sessions

Assessment: a single-user CLI does not need DB-level locking.

Required change:
- state that concurrent runs per session are forbidden (single-writer model)
- this is sufficient for a CLI — no further locking design needed

## Corrections to Earlier Reviews

### Auth is implementable, not blocked
API-key auth works via `httpOptions.headers`. Coast Assist / `LOGIN_WITH_GOOGLE` requires `GcliAgentModel` to extend `BaseLlm` directly with its own transport (using `AuthClient.request()`), not wrap `Gemini`. The OAuth flow, token refresh, and credential caching all work as-is — the issue was the design doc's assumption about the inner model, not auth capability.

### Persistence is simpler than initially claimed
DB-level concerns (PESSIMISTIC_WRITE, stale-writer detection, concurrent append policy) come from `DatabaseSessionService` and don't apply. The file-backed service wraps existing `ChatRecordingService`. Only rewind semantics need deeper design.

### Interactive PR findings are rollout-risk evidence, not architecture defects
The branch-stack dependency, hook-order risk, and `_meta.legacyState` leakage in PR #24297 are real but secondary to the core architecture gaps above.

## What To Change Before Principal Review

1. **Fix the 4 compilation blockers** (C1-C4) — these will be the first thing reviewers check
2. **Add an explicit ADK→AgentProtocol translation architecture section** — this is the real design center
3. **Add the shared-core subagent architecture** — custom `BaseTool` over shared runtime, not `AgentTool`
4. **Use `BaseContextCompactor`** for compaction instead of embedding it in the model layer
5. **Replace “100% possible today” and similar language** with explicit labels: native / bridgeable / blocked
6. **Add a parity matrix** (feature | ADK mechanism | status | bridge workaround | long-term target)

## Phased Migration Plan

### Phase 0: Foundation (current state → near-term)
**Goal:** Establish the shared runtime core and translation layer.

- [ ] Fix compilation blockers (C1-C4) in design doc code samples
- [ ] Implement `AdkRuntimeCore` wrapping ADK `Runner` + `LlmAgent`
- [ ] Implement `AdkEventTranslator` (ADK `Event` → gemini-cli `AgentEvent`)
- [ ] Implement `GcliAgentModel extends BaseLlm` with dual transport (API-key via `httpOptions.headers`, Coast Assist via `AuthClient.request()`)
- [ ] Implement `GcliFileSessionService extends BaseSessionService` wrapping `ChatRecordingService`
- [ ] Implement `GcliContextCompactor implements BaseContextCompactor` wrapping `ChatCompressionService`
- [ ] Wire behind `experimental.adk` feature gate

**Non-goals for Phase 0:**
- No interactive flow changes
- No subagent support
- No live/bidi connections
- No resumable approvals

**Exit criteria:** Non-interactive flow produces identical output behind feature gate.

### Phase 1: Non-Interactive Parity
**Goal:** Feature-gated non-interactive flow matches legacy behavior.

- [ ] Tool output masking via `BaseLlmRequestProcessor`
- [ ] Model routing via `beforeModelCallback` + `RoutingContextBuilder` adapter
- [ ] Policy enforcement via `beforeToolCallback` using existing callbacks (temporary bridge)
- [ ] Quota/availability handling via `beforeModelCallback`
- [ ] `ClearcutTelemetryPlugin extends BasePlugin` for token counts (`afterModelCallback`), per-tool timing (`beforeToolCallback`/`afterToolCallback` with `functionCallId`), agent lifecycle, model errors
- [ ] HTTP-level telemetry (status code, duration) captured in `GcliAgentModel` wrapper
- [ ] Verify ~70% of existing Clearcut call sites work unchanged

**Non-goals for Phase 1:**
- No interactive UI changes
- No plan mode switching
- No subagents
- Approvals are callback-based, not resumable

**Exit criteria:** Non-interactive tests pass with `experimental.adk.enabled = true`. Legacy path remains default.

### Phase 2: Interactive Flow Migration
**Goal:** Interactive flow uses the same ADK runtime behind `TopLevelSessionAdapter`.

- [ ] `TopLevelSessionAdapter` exposing runtime as `AgentProtocol` / `AgentSession`
- [ ] Stream lifecycle (`agent_start` / `agent_end` / `streamId` ownership)
- [ ] Replay/reattach semantics matching current `AgentSession.stream()` behavior
- [ ] Plan mode via dynamic `BaseToolset` + `InstructionProvider` + mode state
- [ ] `ApprovalBridge` for tool confirmations using existing UI callbacks
- [ ] Elicitation via existing callbacks (not yet bidi)
- [ ] `_meta.legacyState` bridge for UI rendering (documented as temporary)

**Non-goals for Phase 2:**
- No live/bidi parity (`runLiveImpl` is still a stub in ADK TS)
- No true mid-turn interruption (steering limited to once-per-LLM-call)
- No resumable approvals across process death
- No concurrent multi-stream sessions

**Exit criteria:** Interactive flow works behind feature gate. Legacy path remains default.

### Phase 3: Subagents and SDK Readiness
**Goal:** Subagents share the core runtime. The architecture is SDK-reusable.

- [ ] Custom `BaseTool` subagent wrappers over shared `AdkRuntimeCore`
- [ ] `threadId`-scoped event projection for child activity
- [ ] Shared policy, routing, and config inheritance
- [ ] Remove `_meta.legacyState` — replace with proper event/adapter separation
- [ ] Migrate approval bridge to native ADK elicitation/bidi (when available)
- [ ] Define SDK public API surface

**Non-goals for Phase 3:**
- Full ADK Dev UI compatibility
- Agent-to-agent transfer via ADK's native mechanism

**Exit criteria:** Subagent invocation works. Architecture is documented for SDK consumers.

## Positive Signals

- Feature-gating behind `experimental.adk` is the right rollout pattern
- Tool output masking maps cleanly to request-preprocessing
- Dynamic toolset + `InstructionProvider` for plan mode is a good ADK-native fit
- The phased migration checklist with tracking issues shows good engineering discipline
- The doc correctly identifies 3 known ADK gaps (sections 5.1-5.3)
- `AgentProtocol` / `AgentSession` is the right consumer-facing boundary
- The policy adapter pattern is directionally sound even with reduced phase-1 semantics

## Concern Decomposition

| Concern | Level | ADK Mechanism |
|---|---|---|
| Auth (API key) | Transport | `BaseLlm` constructor / `httpOptions.headers` |
| Auth (Coast Assist) | Transport | `BaseLlm` direct — custom transport via `AuthClient.request()` |
| Model rewrite | Transport | `BaseLlm.generateContentAsync` model override |
| Model routing | Agent | `beforeModelCallback` + `RoutingContextBuilder` |
| Token compaction | Agent | `BaseContextCompactor` (native ADK) |
| Quota/availability | Agent | `beforeModelCallback` |
| Tool masking | Agent | `BaseLlmRequestProcessor` |
| Tool confirmations | Agent+Consumer | `beforeToolCallback` + existing callbacks (phase 1) |
| Telemetry (lifecycle) | Agent | `ClearcutTelemetryPlugin` — `afterModelCallback`, `beforeToolCallback`/`afterToolCallback` |
| Telemetry (HTTP) | Transport | `GcliAgentModel` wrapper (status code, duration) |
| Telemetry (CLI) | Consumer | Existing call sites (~70% of Clearcut metrics, unchanged) |
| UI rendering | Consumer | Event subscriber / adapter |
| Subagent invocation | Agent | Custom `BaseTool` over shared runtime core |

## Final Verdict

The design is architecturally correct in its goal. To be principal-review ready:

1. Fix the 4 compilation blockers
2. Add the ADK→AgentProtocol translation architecture as the design center
3. Adopt native `BaseContextCompactor` instead of model-layer compaction
4. Use custom `BaseTool` subagents over shared core (not `AgentTool`)
5. Downgrade parity claims to match reality
6. Add the phased plan with explicit non-goals per phase

The migration path is: shared runtime core → translation layer → adapters (top-level session, subagent tools, approval bridge). Each phase ships independently behind the feature gate.
