# ADK-TS Alignment Pass

Every interface in our outline must map cleanly to ADK-TS. This document
verifies that mapping field-by-field, identifies gaps, and confirms
HITL/plugin/transfer patterns work.

Source: ADK-TS v0.4.0 at `/Users/adamfweidman/Desktop/adk-int/adk-js/core/src/`

---

## 1. AgentDescriptor ↔ ADK Agent Hierarchy

### Field-by-field mapping

| AgentDescriptor field        | ADK-TS source                                | Notes                                                                                                                                                    |
| ---------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                       | `BaseAgent.name`                             | Direct. ADK validates it's a valid JS identifier.                                                                                                        |
| `displayName`                | —                                            | ADK doesn't have this. No conflict.                                                                                                                      |
| `description`                | `BaseAgent.description` (optional in ADK)    | Direct. Used for model routing in AgentTool.                                                                                                             |
| `executor`                   | —                                            | New concept. ADK agents are always 'adk'. Adapter sets this.                                                                                             |
| `inputSchema`                | `LlmAgent.inputSchema` (Zod or JSON Schema)  | Direct. ADK's AgentTool uses this for tool parameter generation.                                                                                         |
| `outputSchema`               | `LlmAgent.outputSchema` (Zod or JSON Schema) | Direct. ADK uses for structured output + AgentTool response.                                                                                             |
| `capabilities`               | —                                            | New concept. Adapter infers from agent type: LlmAgent gets `['elicitation', 'streaming', 'host_tool_execution']`, LoopAgent gets `['composition']`, etc. |
| `ownTools`                   | `LlmAgent.tools: ToolUnion[]`                | Maps via ToolDescriptor adapter. ADK tools have `name`, `description`, `_getDeclaration()` which returns JSON Schema.                                    |
| `requiredTools`              | —                                            | New concept. ADK agents don't declare required host tools. Adapter can infer from tool references.                                                       |
| `subAgents`                  | `BaseAgent.subAgents: BaseAgent[]`           | Recursive. Each sub-agent becomes a nested AgentDescriptor.                                                                                              |
| `constraints.maxTurns`       | `RunConfig.maxLlmCalls` (default 500)        | Maps, though semantics differ slightly (LLM calls vs turns).                                                                                             |
| `constraints.maxTimeMinutes` | —                                            | ADK doesn't have time limits. No conflict — host enforces.                                                                                               |
| `constraints.maxBudgetUsd`   | —                                            | ADK doesn't have budget. No conflict — host enforces.                                                                                                    |
| `metadata`                   | —                                            | New concept. Adapter can populate from agent registration context.                                                                                       |

### ADK-specific fields NOT in AgentDescriptor

| ADK field                           | Where it lives | Our approach                                                                                               |
| ----------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------- |
| `instruction` / `globalInstruction` | LlmAgent       | Executor-internal. Not in descriptor (it's runtime config, not identity).                                  |
| `model`                             | LlmAgent       | Goes in ExecutionOptions.model or executor-internal config.                                                |
| `generateContentConfig`             | LlmAgent       | Executor-internal.                                                                                         |
| `disallowTransferToParent/Peers`    | LlmAgent       | Could be `constraints` or `_meta`. Transfer policy is host-enforced.                                       |
| `includeContents`                   | LlmAgent       | Executor-internal (context management).                                                                    |
| `outputKey`                         | LlmAgent       | Executor-internal (state management).                                                                      |
| `beforeModelCallback`, etc.         | LlmAgent       | Executor-internal. These are ADK's callback system — our LifecycleInterceptor is the interface equivalent. |

### Verdict: CLEAN MAPPING

AgentDescriptor captures everything needed to describe an ADK agent externally.
ADK-specific runtime config (instruction, model, callbacks) stays inside the
executor — exactly right for the descriptor/executor separation.

**Key ADK pattern preserved:** AgentTool wraps an agent as a tool using
`inputSchema` for parameters and `description` for the tool description. Our
AgentDescriptor has both, so SubagentTool can do the same thing.

---

## 2. AgentSession ↔ ADK Runner

### Method mapping

| AgentSession method     | ADK-TS equivalent                                               | How adapter works                                                                                                                                                   |
| ----------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stream(data, options)` | `Runner.runAsync({ userId, sessionId, newMessage, runConfig })` | Adapter creates/loads session, maps data+options → runAsync params, wraps Event generator → AgentEvent generator. Each `stream()` call triggers a new `runAsync()`. |
| `update(config)`        | No direct equivalent                                            | ADK doesn't support mid-stream config changes. Adapter queues updates for next `runAsync()` call.                                                                   |
| `steer(data)`           | No direct equivalent                                            | ADK doesn't support mid-stream intervention. Adapter can queue for next invocation or ignore.                                                                       |
| `abort()`               | No direct equivalent                                            | ADK uses `invocationContext.endInvocation = true`. Adapter sets this flag. Could also use AbortController.                                                          |

### ExecutionRequest → Runner.runAsync mapping

| ExecutionRequest field      | ADK mapping                                                      |
| --------------------------- | ---------------------------------------------------------------- |
| `descriptor`                | Used to find/create the BaseAgent instance                       |
| `input`                     | → `newMessage: Content` (converted from ContentPart[] → Content) |
| `sessionRef`                | → `sessionId` (string) or creates session from SessionSnapshot   |
| `forkSession`               | Adapter clones session before running                            |
| `options.tools`             | → merged into agent's `tools` config                             |
| `options.model`             | → `LlmAgent.model` override                                      |
| `options.hostToolExecution` | → `RunConfig.pauseOnToolCalls: true`                             |
| `options.streaming`         | → `RunConfig.streamingMode`                                      |
| `options.permissionMode`    | → SecurityPlugin config                                          |
| `signal`                    | → wired to `invocationContext.endInvocation`                     |

### HITL: How pauseOnToolCalls works end-to-end

This is the critical path. Here's the full flow:

```
1. LLM returns tool call (FunctionCall in Event)
2. ADK checks RunConfig.pauseOnToolCalls === true
3. ADK sets invocationContext.endInvocation = true
4. ADK yields the Event (with FunctionCall) and stops
5. Runner.runAsync() generator completes

   --- OUR INTERFACE BOUNDARY ---

6. Adapter translates ADK Event → ToolRequestEvent
7. Host receives ToolRequestEvent from session.stream() generator
8. Host runs policy check (PolicyEvaluator.evaluate())
9. Host fires hooks (LifecycleInterceptor.fire('before_tool', ...))
10. If policy allows → Host executes tool → gets ToolResultData
11. Host calls session.stream({ kind: 'tool_result', ... }) to get next stream

   --- BACK INTO ADK ---

12. Adapter receives tool result
13. Adapter creates FunctionResponse Content
14. Adapter calls Runner.runAsync() again with FunctionResponse as newMessage
15. ADK loads session (has prior tool call event)
16. ADK resumes agent with tool response
17. Loop continues from step 1
```

**Why this works:** ADK's `pauseOnToolCalls` was designed exactly for this
pattern — external tool execution by a host. The adapter translates between
ADK's "end invocation + resume with FunctionResponse" pattern and our
"ToolRequestEvent + send(tool_result)" pattern.

**Key insight:** Each `session.stream()` call triggers a new `Runner.runAsync()`
call. This means each ADK "invocation" maps to one `stream()` call. The session
persists state across invocations. Mid-stream `update()` and `steer()` calls are
queued for the next invocation since ADK doesn't support mid-turn changes.

### HITL: ToolConfirmation flow

ADK also has a separate ToolConfirmation pattern (via
`context.requestConfirmation()`):

```
1. beforeToolCallback calls context.requestConfirmation({ hint: '...' })
2. This sets eventActions.requestedToolConfirmations[functionCallId]
3. ADK yields event with requestedToolConfirmations populated
4. Runner completes (invocation ends)

   --- OUR INTERFACE BOUNDARY ---

5. Adapter sees requestedToolConfirmations in event
6. Adapter translates → ElicitationRequest { kind: 'tool_confirmation', ... }
7. Host renders confirmation UI
8. User responds → ElicitationResponse { action: 'accept' | 'decline' }

   --- BACK INTO ADK ---

9. Adapter receives elicitation response
10. If accepted: Adapter creates FunctionResponse with confirmed=true
11. Calls Runner.runAsync() with FunctionResponse
12. ADK's SecurityPlugin or callback reads confirmation from session
13. Tool executes
```

**Maps to our ElicitationRequest:** ADK's `ToolConfirmation.hint` →
`ElicitationRequest.message`. ADK's `ToolConfirmation.payload` →
`ElicitationRequest.context`. The `kind: 'tool_confirmation'` is the
discriminator.

### HITL: Auth request flow

```
1. Tool or callback calls context.requestCredential(authConfig)
2. Sets eventActions.requestedAuthConfigs[functionCallId]
3. Event yields, invocation ends

   --- OUR INTERFACE BOUNDARY ---

4. Adapter sees requestedAuthConfigs
5. Translates → ElicitationRequest { kind: 'auth_required', context: authConfig }
6. User provides credentials
7. ElicitationResponse { action: 'accept', content: { credential: ... } }

   --- BACK INTO ADK ---

8. Adapter stores credential via CredentialService
9. Calls Runner.runAsync() again
10. Tool calls context.getAuthResponse() → gets credential
```

**Maps to our ElicitationRequest:** ADK's auth pattern is just another
elicitation kind. This validates our generic elicitation design — it handles
tool confirmation, auth, and any future interaction type.

---

## 3. AgentEvent ↔ ADK Event

### Event type mapping

| Our AgentEvent        | ADK Event pattern                                                                 | Adapter translation                           |
| --------------------- | --------------------------------------------------------------------------------- | --------------------------------------------- |
| `InitializeEvent`     | First event from Runner.runAsync()                                                | Adapter emits on first stream() call          |
| `SessionUpdateEvent`  | `eventActions.stateDelta`                                                         | Adapter emits when stateDelta is non-empty    |
| `MessageEvent`        | `event.content` with text Parts                                                   | Filter text/thought parts from Content        |
| `ToolRequestEvent`    | `getFunctionCalls(event)` returns FunctionCall[]                                  | Each FunctionCall → one ToolRequestEvent      |
| `ToolUpdateEvent`     | `event.longRunningToolIds`                                                        | Adapter emits progress for long-running tools |
| `ToolResponseEvent`   | `getFunctionResponses(event)` returns FunctionResponse[]                          | Each FunctionResponse → one ToolResponseEvent |
| `ElicitationRequest`  | `eventActions.requestedToolConfirmations` or `requestedAuthConfigs`               | Map to generic elicitation                    |
| `ElicitationResponse` | User input → FunctionResponse in next runAsync call                               | Reverse of above                              |
| `UsageEvent`          | `event.usageMetadata` (GenerateContentResponseUsageMetadata)                      | Map token counts                              |
| `ErrorEvent`          | `event.errorCode` + `event.errorMessage`                                          | Map error fields                              |
| `stream_end`          | `isFinalResponse(event)`, `eventActions.transferToAgent`, `eventActions.escalate` | Derive `stream_end` reason from ADK signals   |
| `CustomEvent`         | `event.customMetadata`                                                            | Pass through                                  |

### ADK EventActions → Our events

| EventActions field           | Our event                                                                 | Notes                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `stateDelta`                 | SessionUpdate or embedded in other events                                 | Delta state is a core ADK pattern                                                                            |
| `artifactDelta`              | `CustomEvent { kind: 'artifact_delta' }`                                  | Artifacts not in our core events                                                                             |
| `transferToAgent`            | Tool call (`transfer_to_agent`) + `stream_end` `reason: 'completed'`      | Handoff is a tool call. Host intercepts the tool request, mediates the handoff, originating agent completes. |
| `escalate`                   | `stream_end` `reason: 'completed'` with `data: { escalateReason: '...' }` | LoopAgent exit signal. ADK's escalate = "I'm done, pass control back up"                                     |
| `requestedToolConfirmations` | `ElicitationRequest { kind: 'tool_confirmation' }`                        | Per function call ID                                                                                         |
| `requestedAuthConfigs`       | `ElicitationRequest { kind: 'auth_required' }`                            | Per function call ID                                                                                         |
| `skipSummarization`          | `_meta: { skipSummarization: true }`                                      | ADK-specific, goes in metadata                                                                               |

### AgentEventBase mapping

| AgentEventBase field | ADK Event field                          | Notes                                             |
| -------------------- | ---------------------------------------- | ------------------------------------------------- |
| `id`                 | `event.id`                               | Direct                                            |
| `timestamp`          | `event.timestamp` (number)               | Convert to ISO 8601 string                        |
| `type`               | Derived from content analysis            | ADK doesn't have event types — adapter classifies |
| `agentId`            | `event.author` (agent name) or context   | **New field** — which agent emitted this event    |
| `threadId`           | `event.branch` (e.g., "agent_1.agent_2") | Direct mapping                                    |
| `source`             | `event.author` ("user" or agent name)    | Direct                                            |
| `_meta`              | `event.customMetadata`                   | Direct                                            |

### Verdict: CLEAN MAPPING

Every ADK event pattern maps to our event types. The adapter classifies ADK's
untyped events into our typed event taxonomy. Key insight: ADK events are richer
(they carry EventActions, function calls, auth requests all in one event), so
the adapter may fan out one ADK Event into multiple AgentEvents (e.g., one
Message + one ToolRequest + one ElicitationRequest). The new `agentId` field
maps directly from ADK's `event.author`.

---

## 4. ToolContract ↔ ADK Tool System

### ToolDescriptor ↔ BaseTool

| ToolDescriptor field      | ADK source                                                    | Notes                             |
| ------------------------- | ------------------------------------------------------------- | --------------------------------- |
| `name`                    | `BaseTool.name`                                               | Direct                            |
| `displayName`             | —                                                             | ADK doesn't have this             |
| `description`             | `BaseTool.description`                                        | Direct                            |
| `parametersSchema`        | `BaseTool._getDeclaration()` → FunctionDeclaration.parameters | JSON Schema from declaration      |
| `annotations.readOnly`    | Inferred from tool type                                       | FunctionTool with no side effects |
| `annotations.longRunning` | `BaseTool.isLongRunning`                                      | Direct                            |

### ToolCallRequest ↔ FunctionCall

| ToolCallRequest | ADK FunctionCall    | Notes  |
| --------------- | ------------------- | ------ |
| `requestId`     | `functionCall.id`   | Direct |
| `name`          | `functionCall.name` | Direct |
| `args`          | `functionCall.args` | Direct |

### ToolResultData ↔ FunctionResponse + tool return

| ToolResultData   | ADK                            | Notes                                            |
| ---------------- | ------------------------------ | ------------------------------------------------ |
| `llmContent`     | `FunctionResponse.response`    | Adapter wraps into ContentPart[]                 |
| `displayContent` | —                              | ADK doesn't separate display from model content  |
| `isError`        | Error thrown from `runAsync()` | Adapter catches and sets flag                    |
| `tailCalls`      | —                              | ADK doesn't have tail calls (gemini-cli concept) |

### AgentTool pattern

ADK's `AgentTool` wraps a `BaseAgent` as a `BaseTool`:

- Uses `agent.inputSchema` for tool parameters
- Uses `agent.description` for tool description
- Creates internal Runner with isolated session
- Returns agent output as tool result
- Merges state deltas back to parent

**Our equivalent:** `SubagentTool` wraps `AgentDescriptor` as a tool:

- Uses `descriptor.inputSchema` for tool parameters
- Uses `descriptor.description` for tool description
- Creates executor via `SessionFactory.create(descriptor, context)`
- Returns execution result as tool result

**Mapping is 1:1.** The only difference is ADK does it with concrete agent
instances; we do it with descriptors + factory.

---

## 5. LifecycleInterceptor ↔ ADK Plugin System

### Hook point mapping

| Our hook point string | ADK Plugin callback     | Mapping                                    |
| --------------------- | ----------------------- | ------------------------------------------ |
| `'before_agent'`      | `beforeAgentCallback`   | `payload: { agent, context }`              |
| `'after_agent'`       | `afterAgentCallback`    | `payload: { agent, context }`              |
| `'before_model'`      | `beforeModelCallback`   | `payload: { context, llmRequest }`         |
| `'after_model'`       | `afterModelCallback`    | `payload: { context, llmResponse }`        |
| `'before_tool'`       | `beforeToolCallback`    | `payload: { tool, args, context }`         |
| `'after_tool'`        | `afterToolCallback`     | `payload: { tool, args, context, result }` |
| `'on_event'`          | `onEventCallback`       | `payload: { event }`                       |
| `'on_user_message'`   | `onUserMessageCallback` | `payload: { userMessage }`                 |
| `'before_run'`        | `beforeRunCallback`     | `payload: { context }`                     |
| `'after_run'`         | `afterRunCallback`      | `payload: { context }`                     |
| `'on_model_error'`    | `onModelErrorCallback`  | `payload: { request, error }`              |
| `'on_tool_error'`     | `onToolErrorCallback`   | `payload: { tool, args, error }`           |

### HookResult ↔ ADK callback return

| HookResult field    | ADK pattern                                     | Notes                               |
| ------------------- | ----------------------------------------------- | ----------------------------------- |
| `action: 'proceed'` | Return `undefined`                              | Plugin returns nothing → continue   |
| `action: 'block'`   | Return `Content` (for agent/model) or throw     | Non-undefined return short-circuits |
| `modifications`     | Return modified `LlmRequest`/`LlmResponse`/args | Plugin returns modified version     |

### ADK's early-exit pattern

ADK plugins use "first non-undefined return wins":

- `beforeModelCallback` returns `LlmResponse` → skips LLM call entirely (cache
  hit)
- `beforeToolCallback` returns modified `args` → tool runs with new args
- `beforeAgentCallback` returns `Content` → skips agent run entirely

Our `HookResult.modifications` carries the same data. The `action: 'block'` +
return value pattern maps cleanly.

### gemini-cli hooks NOT in ADK

| gemini-cli hook       | ADK equivalent                       | Notes                                                         |
| --------------------- | ------------------------------------ | ------------------------------------------------------------- |
| `BeforeToolSelection` | —                                    | ADK doesn't let you modify which tools are available mid-turn |
| `Notification`        | —                                    | ADK doesn't have notification hooks                           |
| `SessionStart`        | `onUserMessageCallback` (first call) | Close enough                                                  |
| `SessionEnd`          | `afterRunCallback`                   | Close enough                                                  |
| `PreCompress`         | —                                    | ADK doesn't have context compression hooks                    |

These gaps are fine — they're gemini-cli-specific hook points. Our generic
`fire(hookPoint, payload)` handles them because the hook point is an open
string. ADK executors simply don't fire these hook points, and
`supportedHookPoints()` reflects that.

---

## 6. PolicyEvaluator ↔ ADK SecurityPlugin

### ADK SecurityPlugin

```typescript
class SecurityPlugin extends BasePlugin {
  policyEngine: BasePolicyEngine;

  // In beforeToolCallback:
  async beforeToolCallback({ tool, args, context }) {
    const outcome = await this.policyEngine.evaluate(tool.name, args);
    switch (outcome) {
      case PolicyOutcome.DENY:
        throw error;
      case PolicyOutcome.CONFIRM:
        context.requestConfirmation({ hint });
      case PolicyOutcome.ALLOW:
        return undefined; // proceed
    }
  }
}
```

### Mapping

| Our PolicyEvaluator       | ADK SecurityPlugin                                        | Notes                                      |
| ------------------------- | --------------------------------------------------------- | ------------------------------------------ |
| `evaluate(request)`       | `policyEngine.evaluate(toolName, args)`                   | ADK is simpler — tool name + args only     |
| `PolicyDecision.allow`    | `PolicyOutcome.ALLOW`                                     | Direct                                     |
| `PolicyDecision.deny`     | `PolicyOutcome.DENY`                                      | Direct                                     |
| `PolicyDecision.ask_user` | `PolicyOutcome.CONFIRM` → `context.requestConfirmation()` | ADK chains to ToolConfirmation             |
| `getExcluded()`           | —                                                         | ADK doesn't pre-filter tools               |
| `request.principal`       | —                                                         | ADK doesn't track who's calling            |
| `request.principalPath`   | Could use `context.agentName` + branch                    | For hierarchical policy                    |
| `request.context`         | —                                                         | Our extension point for host-specific data |

### How ADK policy maps when host controls execution

With `pauseOnToolCalls: true`, the flow is:

1. ADK yields tool call → adapter converts to ToolRequestEvent
2. **Host** runs PolicyEvaluator.evaluate() — NOT ADK's SecurityPlugin
3. Host decides allow/deny/ask_user
4. If allowed, host executes tool and sends result via `session.stream()`

This means **ADK's SecurityPlugin is bypassed when the host controls tool
execution** — which is correct! The host's PolicyEvaluator is the authority.
ADK's SecurityPlugin only matters when ADK executes tools internally
(`pauseOnToolCalls: false`).

---

## 7. SessionContract ↔ ADK Session

### Session mapping

| Our SessionHandle | ADK Session                              | Notes                                     |
| ----------------- | ---------------------------------------- | ----------------------------------------- |
| `id`              | `Session.id`                             | Direct                                    |
| `agentName`       | `Session.appName`                        | ADK uses appName, not agent name          |
| `events`          | `Session.events: Event[]`                | Direct (but ADK Events → our AgentEvents) |
| `state`           | `Session.state: Record<string, unknown>` | Direct                                    |
| `lastUpdateTime`  | `Session.lastUpdateTime`                 | Direct                                    |

### SessionProvider ↔ BaseSessionService

| Our SessionProvider           | ADK BaseSessionService                          | Notes                      |
| ----------------------------- | ----------------------------------------------- | -------------------------- |
| `create(agentName, metadata)` | `createSession({ appName, userId })`            | ADK requires userId        |
| `load(sessionId)`             | `getSession({ appName, userId, sessionId })`    | ADK requires all three IDs |
| `list(agentName)`             | `listSessions({ appName, userId })`             | ADK scopes by userId       |
| `delete(sessionId)`           | `deleteSession({ appName, userId, sessionId })` | Same pattern               |

### Gap: ADK requires userId

ADK sessions are scoped by `(appName, userId, sessionId)`. Our interface uses
just `sessionId`. The adapter can embed userId in the session metadata or derive
it from HostContext.

### State prefixes (ADK-specific)

ADK uses prefixed state keys:

- `app:` — app-scoped, persisted
- `user:` — user-scoped, persisted
- `temp:` — temporary, stripped before persistence

Our `SessionHandle.state` is a flat `Record<string, unknown>`. The adapter
preserves prefixes as-is — they're just string keys. No conflict.

---

## 8. ContentPart ↔ ADK Content/Part

### ADK uses Google GenAI types

ADK's `Content` and `Part` come from `@google/genai`:

```typescript
interface Content {
  role?: string;  // 'user' | 'model'
  parts: Part[];
}

type Part = TextPart | InlineDataPart | FunctionCallPart | FunctionResponsePart | ...
```

### Mapping

| Our ContentPart                                     | ADK/GenAI Part                                 | Notes                                                  |
| --------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------ |
| `{ type: 'text', text }`                            | `{ text: string }`                             | Direct                                                 |
| `{ type: 'thought', thought }`                      | `{ thought: true, text: string }`              | ADK uses `thought` boolean flag on TextPart            |
| `{ type: 'media', mimeType, data }`                 | `{ inlineData: { mimeType, data } }`           | Restructure                                            |
| `{ type: 'reference', text, uri }`                  | `{ fileData: { fileUri, mimeType } }`          | Map fileData → reference                               |
| `{ type: 'refusal', text }`                         | —                                              | Not in ADK/GenAI. Adapter would map from finishReason. |
| `{ type: 'function_call', name, args, id }`         | `{ functionCall: { name, args, id } }`         | Unwrap                                                 |
| `{ type: 'function_response', name, response, id }` | `{ functionResponse: { name, response, id } }` | Unwrap                                                 |

### Verdict: CLEAN MAPPING

The adapter converts between our flat discriminated union and ADK's nested Part
structure. No information loss in either direction.

---

## 9. Composition ↔ ADK Agent Patterns

| Our CompositionConfig.pattern | ADK Agent type                         | Notes                                            |
| ----------------------------- | -------------------------------------- | ------------------------------------------------ |
| `'hierarchical'`              | Any agent with `subAgents`             | Default — parent calls sub-agents as tools       |
| `'sequential'`                | `SequentialAgent`                      | Runs children in order                           |
| `'parallel'`                  | `ParallelAgent`                        | Runs children concurrently, branch isolation     |
| `'loop'`                      | `LoopAgent`                            | Repeats children until escalate or maxIterations |
| `'transfer'`                  | LlmAgent with `transfer_to_agent` tool | Peer-to-peer handoff                             |

### Branch isolation

ADK's `ParallelAgent` gives each child an isolated `branch` context:

- Children don't see peer events
- Each gets unique branch path: `"parent.child_0"`, `"parent.child_1"`
- Results merged after all complete

Maps to our `threadId` — each parallel branch gets a unique threadId. Events
from different branches are interleaved by the host.

---

## 10. Summary: Gaps and Resolutions

### No gaps blocking ADK integration:

| Concern                 | Status    | Resolution                                                                |
| ----------------------- | --------- | ------------------------------------------------------------------------- |
| pauseOnToolCalls HITL   | **Works** | Adapter maps to stream() cycle (§2)                                       |
| ToolConfirmation        | **Works** | Maps to ElicitationRequest (§2)                                           |
| Auth requests           | **Works** | Maps to ElicitationRequest (§2)                                           |
| Plugin hooks (12 types) | **Works** | Maps to LifecycleInterceptor.fire() (§5)                                  |
| Agent transfers         | **Works** | Tool call (`transfer_to_agent`) + `stream_end` `reason: 'completed'` (§3) |
| State delta pattern     | **Works** | SessionUpdateEvent or \_meta (§3)                                         |
| Branch isolation        | **Works** | threadId mapping (§9)                                                     |
| AgentTool pattern       | **Works** | SubagentTool with descriptor + factory (§4)                               |
| Session management      | **Works** | Adapter maps userId into session (§7)                                     |

### Minor adapter complexity:

1. **Event fan-out:** One ADK Event may become multiple AgentEvents (message +
   tool call + elicitation). Adapter logic needed but straightforward.
2. **userId scoping:** ADK sessions require userId; our interface doesn't.
   Adapter derives from HostContext.
3. **Timestamp format:** ADK uses `number` (epoch ms); we use ISO 8601 string.
   Simple conversion.
4. **Content structure:** ADK uses nested Part types; we use flat discriminated
   union. Adapter converts bidirectionally.

### ADK features our interface supports that gemini-cli doesn't have yet:

- `LoopAgent` / `ParallelAgent` / `SequentialAgent` composition → our
  CompositionConfig
- `eventActions.stateDelta` → our SessionUpdateEvent
- `eventActions.transferToAgent` → tool call (`transfer_to_agent`) +
  `stream_end` `reason: 'completed'`
- `eventActions.escalate` → `stream_end` `reason: 'completed'` with
  `data: { escalateReason }`
- Long-running tools → our ToolUpdateEvent
- Auth credential flow → our ElicitationRequest with kind: 'auth_required'
