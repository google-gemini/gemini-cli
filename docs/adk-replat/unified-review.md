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

1. **Three non-compilable code samples** that will immediately erode reviewer confidence
2. **An under-specified translation boundary** — the ADK→AgentProtocol mapping is the real architecture, but the doc treats it as an afterthought
3. **Overclaimed parity** in routing, telemetry, and approvals
4. **Missing phased plan** with clear milestones and non-goals

The central architectural insight is right: the migration boundary is:

- `adk-js Event -> Gemini CLI AgentEvent`
- `adk-js session/runtime semantics -> AgentProtocol / AgentSession semantics`

That boundary carries stream lifecycle, replay/resume, event projection, approval correlation, and persistence correctness. Until the translation architecture is explicit, parity claims remain unsupported.

## Merged High-Risk Findings

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

### 2. The “single consolidated decorator” is overloaded

The `GcliAgentModel.generateContentAsync` sketch is a useful mental model, but today it is carrying too many concerns:
- request mutation
- routing
- availability / fallback prompting
- compaction
- masking
- auth
- approval-adjacent control flow

Several of these are not model-layer problems. They are session, orchestration, policy, or UI-integration concerns.

This should be decomposed into separate layers:
- request shaping
- runtime/session ownership
- event translation
- approval / elicitation bridge
- persistence / rewind service
- telemetry projection

### 3. The design frequently conflates “possible with custom logic” with “supported by current ADK architecture”

This is one of the main wording risks.

Several statements currently read like native ADK parity when the real meaning is:
- possible with substantial Gemini CLI-owned bridge logic
- possible by bypassing native ADK facilities
- possible only for phase 1 with intentionally degraded semantics

That distinction needs to be explicit everywhere the doc uses strong language like “validated” or “100% possible today.”

### 4. Auth is materially overstated

The auth section has real issues:
- `LlmRequest` has no top-level `headers` field in `adk-js/core/src/models/llm_request.ts`
- backend selection still depends on constructor-level `apiKey` vs Vertex config in `adk-js/core/src/models/google_llm.ts`
- live/bidi handling is still a separate path with different behavior

Important nuance:
- unary header injection via `llmRequest.config.httpOptions.headers` and constructor `headers` does exist in `google_llm.ts`
- but that is not enough to claim general auth support across the full runtime

Conclusion:
- the doc should present auth as a bridge with caveats or a real blocker, not as a solved integration

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

### 6. Rewind and custom persistence are underdesigned

The doc treats rewind too much like storage truncation.

But `adk-js` session services in:
- `adk-js/core/src/sessions/base_session_service.ts`
- `adk-js/core/src/sessions/database_session_service.ts`

show that correctness depends on:
- append ordering
- state merging
- scope splitting
- resumption logic
- stale-writer handling
- locking / concurrency behavior

The unified conclusion is:
- file-backed persistence is plausible
- but it is not “just write JSON”
- rewind needs explicit semantics for state recomputation and resumption rollback

### 7. Routing, telemetry, and plan mode are all overclaimed

Routing:
- current routing requires a richer `RoutingContext`
- `contents.slice(0, -1)` / `contents.pop()` is not a sufficient or type-accurate mapping
- model banning via simulated error is not the same as model routing

Telemetry:
- `event.id` is not a safe per-tool correlation key
- ADK can batch multiple function calls or responses in one event
- the sample APIs in the design do not match current `ClearcutLogger`

Plan mode:
- current behavior is broader than prompt + tool filtering
- policy, approval mode, routing, and config refresh are all part of the behavior

### 8. Retry safety around side effects is missing

The “full turn reset” proposal is incomplete without a retry safety model.

The document must define behavior after:
- file writes
- shell commands
- MCP mutations
- subagent actions with external effects

Otherwise “retry from the start” can duplicate side effects.

### 9. The review should distinguish architecture defects from rollout-status evidence

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

3. `SubagentToolAdapter`
- exposes the same runtime as a callable tool
- projects child activity into parent-facing `tool_update` / `tool_response` or explicit child-thread events
- does not pretend every subagent is a peer top-level chat session unless that is an explicit design decision

4. `ApprovalBridge`
- phase-1 callback bridge for approvals / elicitation
- clearly documented as temporary and non-native

5. `GcliSessionService`
- file-backed persistence, locking, rewind, state recomputation, and crash recovery

### Subagent conclusion

The document should not imply that `AgentTool` is the only correct long-term path.

Current ADK TS exposes:
- `FunctionTool`
- `AgentTool`

These serve different purposes.

Merged conclusion:
- if the goal is SDK-first subagent invocation over a Gemini CLI-owned modular core, `FunctionTool` or a custom `BaseTool` wrapper is a legitimate phase-1 choice
- if the goal is ADK-native nested-agent semantics, `AgentTool` is the native abstraction

The doc should describe this as a deliberate architectural choice, not as an accident.

### Session conclusion

Main agent and subagents can share the same underlying runtime core.

But they should not necessarily share the exact same public adapter.

The right formulation is:
- same core runtime
- different event/session projections depending on embedding context

## Section-by-Section Unified Review

### 3.1 Authentication Flexibility

Assessment: bridgeable, not validated parity.

Keep:
- ADK `Gemini` does not natively accept the CLI’s auth shape

Change:
- fix request-shape examples
- downgrade the workaround claim
- state ownership of refresh, header precedence, and live/bidi caveats

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

### 3.6 Telemetry and Observability

Assessment: the design direction is fine, but the example implementation is incorrect.

Required change:
- correlate tools by function-call id, not event id
- account for merged / parallel tool events
- replace fake API examples with a telemetry parity matrix

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

Assessment: high-risk and underdesigned.

Required change:
- define on-disk schema
- define lock strategy
- define crash recovery
- define state-scope storage
- define rewind algorithm

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

### 5.3 Concurrent Sessions and Locking

Assessment: real issue, mitigation is missing.

Required change:
- define file-backed equivalent of locking / single-writer policy
- state whether concurrent runs per session are forbidden
- state where serialization is enforced

## Corrections and Softenings Relative to the Earlier Reviews

These points should be preserved in the unified version so the review stays technically precise.

### 1. `FunctionTool` vs `AgentTool`

The earlier reviews were correct that `FunctionalTool` is the wrong name.

But the stronger unified position is:
- `FunctionTool` is real and can be the right fit for SDK-first subagent invocation
- `AgentTool` is the native nested-agent abstraction
- the design should choose deliberately between them

### 2. `AgentTool` criticism should be more precise

Avoid overstating that `AgentTool` always creates a totally isolated in-memory boundary.

The more accurate criticism is:
- nested-runner semantics differ from top-level semantics
- session reuse/state propagation are nuanced
- the document must define intended boundaries explicitly

### 3. Auth criticism should be precise

Do not say “header injection is impossible.”

Say:
- request/header mutation exists for unary requests
- that does not justify the broader parity claim currently made in the doc

### 4. Interactive PR findings should be demoted below the core architecture issues

Keep:
- branch-stack caveat
- hook-order risk
- `_meta.legacyState` leakage

But frame them as rollout and protocol-hygiene evidence, not as the single biggest issue.

## What To Change Before Principal Review

1. Add an explicit `ADK runtime -> AgentProtocol / AgentSession` translation architecture section.
2. Add a “shared runtime, different adapters” section for top-level agent vs subagent invocation.
3. Replace strong parity language with explicit labels:
   - native ADK support
   - bridgeable with custom logic
   - blocked today
4. Add a persistence section with:
   - on-disk schema
   - locking
   - rewind semantics
   - state recomputation
   - crash recovery
5. Add a parity matrix with:
   - feature
   - current owner
   - ADK integration point
   - implementable now
   - bridge workaround
   - degraded semantics
   - long-term target
6. Add explicit phase-1 non-goals:
   - no live/bidi parity
   - no resumable approval parity
   - no hidden claim of native subagent parity
   - no concurrent multi-run semantics beyond defined limits
7. Add success criteria to the migration sequence:
   - non-interactive parity
   - replay/reattach parity
   - approval parity
   - interactive UI parity
   - subagent activity parity

## Positive Signals

The design is not wrong across the board. These parts are promising:

- isolating the migration behind flags and separate paths is the right rollout shape
- tool output masking maps relatively well to request-preprocessing
- hybrid tool isolation is aligned with current subagent registry/message-bus behavior
- the introduction of `AgentProtocol` / `AgentSession` is the right boundary; it just needs a much more explicit runtime/translation design behind it

## Final Verdict

The design should be reframed as:

- one shared ADK-based runtime core
- one explicit translation layer from ADK runtime semantics to Gemini CLI session semantics
- one temporary callback-based bridge for approvals/elicitation
- different adapters for top-level agent sessions vs subagent-as-tool invocation

If the doc is revised around that architecture and stops overclaiming what is already supported natively by ADK TS, it can become principal-review ready.
