# Architectural Design: Gemini CLI to ADK Migration

| Authors: [Adam Weidman](mailto:adamfweidman@google.com)  Contributors:  Reviewers: *See section [Status of this document](#status-of-this-document).* | Status: Draft  Last revised: Mar 26, 2026 Visibility: Confidential |
| :--- | :--- |

---

# Goal

To migrate the Gemini CLI backend execution engine from its legacy fragmented loop structure to the Agent Development Kit (ADK). This migration will unify how agents and subagents are orchestrated, simplify state persistence, and enable cleaner artifact management using the standard `AgentSession` interface.

---

# Context

Over time, Gemini CLI has accumulated complex runtime behaviors (multi-tier tool schedulers, payload masking, and fine-grained telemetry). Integrating these with ADK requires careful mapping to maintain feature parity without forking the ADK core. The newly introduced `AgentSession` interface provides a unified boundary to bridge legacy loops with ADK event streams.

---

# Current State and Proposed Mappings

The following analysis details how existing Gemini CLI components map onto ADK capabilities, citing specific files from both repositories (`gemini-cli` and `adk-js`).

## High-Level Instantiation Sketch (Consolidated Procedural Graph)
Before diving into granular mappings, here is how all these extension points (Auth, Fallbacks, Routing, Tools, Security) are wired together at startup. We use a **Single Consolidated Decorator** that execute business rules line-by-line rather than 4-5 nested wrapper classes.

```typescript
export class GcliAgentModel extends BaseLlm {
  constructor(
    private baseModel: BaseLlm, // Standard Google Gen AI or Vertex
    private services: {
      auth: AuthService;
      router: RouterService;
      compactor: CompactorService;
      quota: QuotaService;
    }
  ) {
    super({ model: 'gcli-consolidated' });
  }

  async *generateContentAsync(request: LlmRequest, stream = false): AsyncGenerator<LlmResponse, void> {
    
    // 1. Quota Management (Section 3.8)
    // Checks if the alias is available; if not, prompts for fallback (mutates request.model)
    await this.services.quota.checkAvailabilityOrPrompt(request);

    // 2. Route Abstract Alias to Concrete Machine ID (Section 3.7)
    request.model = this.services.router.resolve(request.model);

    // 3. Token Compaction (Alters request.contents in-place if too big) (Section 3.3)
    // Note: Compactor is stateful and executes its own sub-model calls for summarization.
    const threshold = this.services.compactor.getThresholdFor(request.model);
    if (estimateTokens(request.contents) > threshold) {
       request.contents = await this.services.compactor.compact(request.contents);
    }

    // 4. Tool Output Masking (Alters request.contents in-place) (Section 3.10)
    // Note: Offloads large raw tool outputs to files on EVERY turn, leaving a preview snippet.
    if (this.services.masker.shouldMask(request.model)) {
      const result = await this.services.masker.mask(request.contents);
      request.contents = result.newHistory;
    }

    // 5. Auth Injection (Section 3.1)
    request.headers = { ...request.headers, ...this.services.auth.getAuthHeaders() };

    // 5. Final Dispatch
    yield* this.baseModel.generateContentAsync(request, stream);
  }
}
```

## 3.1 Authentication Flexibility

The CLI resolves distinct authentication flows (OAuth, ADC, Compute metadata) using standard Google libraries.

*   **Current State:** Resolved in `packages/core/src/code_assist/oauth2.ts` based on `AuthType`. 
    *   OAuth (LOGIN_WITH_GOOGLE): Loops back local servers (`L228-L281`).
    *   Compute Metadata Server (`COMPUTE_ADC`): Resolves via `fetchCachedCredentials` (`L204-L226`).
*   **Proposed ADK Mapping (Constraint):** Standard `Gemini` params in `adk-js/core/src/models/google_llm.ts` strictly validate for `apiKey` or `project` (`L94-L98`). They do not bridge standard `google-auth-library` `AuthClient`s or OAuth2 bearer tokens natively.
*   **Proposed ADK Mapping (Solution):** Instead of a separate isolated decorator, this logic is executed as the final step in the `GcliAgentModel.generateContentAsync` pipeline. It resolves the CLI's OAuth2 refreshed tokens and injects them into the `request.headers` right before dispatching to the base model. This keeps standard ADK key checks bypassed without fracturing the execution graph.
*   **Validation**: This approach was verified via code analysis. By providing a dummy string (e.g., `'dummy-key'`) to the standard `Gemini` constructor, we satisfy its runtime check, and then override the `Authorization` header in the linear pipeline right before dispatch.

```typescript
// Inside GcliAgentModel.generateContentAsync
request.headers = {
  ...request.headers,
  'Authorization': `Bearer ${await this.services.auth.getAuthHeaders()}`
};
```



## 3.2 Model Steering and Mid-Stream Injection
User interjections (hints) course-correct the loop mid-turn.

*   **Current State:** Captured in `packages/core/src/agent/legacy-agent-session.ts` where standard synchronous loops wait for tool yields.
*   **Proposed ADK Mapping (Next-Step Steering):** Using `LlmAgent` callbacks defined in `adk-js/core/src/agents/llm_agent.ts` (`beforeModelCallback` L294). The callback can read an external steering queue and push content into `request.contents` between steps.
*   **Proposed ADK Mapping (Real-time Interrupt):** Requires Alexey's PR #214 which models `runAsync` inputs as `AsyncGenerator<UserMessage>`.

## 3.3 State Management and Token Compaction
The CLI truncates large tool responses and summarizes older history to protect token budgets.

*   **Current State:** `ChatCompressionService` in `packages/core/src/context/chatCompressionService.ts` implements a "Reverse Token Budget" and a Two-Phase Verification self-correction loop.
    *   **Reverse Token Budgeting**: Iterates backwards (newest to oldest). Preserves recent tool outputs, but once a $50,000$ token budget for function responses is exceeded, older large outputs are truncated to 30 lines and saved to files.
    *   **Two-Phase Verification**: 
        -   **Phase 1**: Yields a `<state_snapshot>` summary of the older $70\%$ of history using a family-mapped Flash alias (e.g., `chat-compression-2.5-flash`).
        -   **Phase 2**: Calls the model again with the summary and original history to evaluate if anything was missed ("Self-Correction").
*   **Proposed ADK Mapping:** This logic executes as a linear step inside the `GcliAgentModel.generateContentAsync` pipeline. The `CompactorService` holds its own reference to a `BaseLlm` (or the base model) to make these sub-calls. These sub-calls are also subjected to standard Quota/Availability checks to ensure the utility model is healthy.

## 3.4 Model Configuration and Hierarchical Overrides
Dynamic aliasing (e.g., Temperature scoped to specific sub-commands).

*   **Current State:** Managed by `ModelConfigService` in `packages/core/src/services/modelConfigService.ts` (`L131`).
*   **Proposed ADK Mapping:** The CLI flatten-resolves aliases down to a concrete model ID and temperature *before* initializing the session runtime.

## 3.5 Universal Policy Enforcement (TOML Rules)
Tiered workspace restrictions (e.g. read-only tools in untrusted folders).

*   **Current State:** Intercepted at tool scheduling time in legacy scheduler loops.
*   **Proposed ADK Mapping (The Container):** Standardize on the standard ADK `SecurityPlugin` defined in `adk-js/core/src/plugins/security_plugin.ts`.
*   **Proposed ADK Mapping (The Decision Brain):** We will implement a `GcliPolicyEngineAdapter implements BasePolicyEngine`. The `SecurityPlugin` will delegate tool checking to this adapter.
*   **Proposed ADK Mapping (Suspension Flow for AskUser):** When the legacy engine returns `ASK_USER`, the adapter will block internally (suspend the thread) to prompt the user directly via existing CLI callbacks. It will then return a binary `ALLOW` or `DENY` to ADK, bypassing ADK's native confirmation event cycle for velocity.

```typescript
export class GcliPolicyEngineAdapter implements BasePolicyEngine {
  constructor(
    private legacyEngine: PolicyEngine,
    private promptUserCallback: (toolName: string, args: Record<string, unknown>) => Promise<boolean>
  ) {}

  async evaluate(context: ToolCallPolicyContext): Promise<PolicyCheckResult> {
    const functionCall = { name: context.tool.name, args: context.toolArgs };
    const result = await this.legacyEngine.check(functionCall, undefined);

    if (result.decision === PolicyDecision.ALLOW) return { outcome: PolicyOutcome.ALLOW };
    if (result.decision === PolicyDecision.DENY) return { outcome: PolicyOutcome.DENY, reason: 'Rejected by policy.' };

    if (result.decision === PolicyDecision.ASK_USER) {
      const approved = await this.promptUserCallback(context.tool.name, context.toolArgs);
      return approved ? { outcome: PolicyOutcome.ALLOW } : { outcome: PolicyOutcome.DENY, reason: 'Rejected by user.' };
    }
    return { outcome: PolicyOutcome.DENY, reason: 'Unknown policy decision.' };
  }
}

> [!TIP]
> **Tool Suspension Validation**: Tool execution in `adk-js` (specifically `handleFunctionCallList` in `functions.ts`) uses standard natural `await` chains. If a tool returns an unresolved Promise (e.g. while waiting for UI interaction), the execution loop will block naturally without timing out. This means we do not need custom polling shims for asynchronous tool confirmation!
```


## 3.6 Telemetry and Observability (Clearcut Tracking)
Hardware metrics, token counts, and step durations.

*   **Current State:** Class `ClearcutLogger` in `packages/core/src/telemetry/clearcut-logger/clearcut-logger.ts` (`L290`) reads system metrics (OS, RAM) and requires deep hooks in the legacy tool scheduler to clock step latencies.
*   **Proposed ADK Mapping (Stream Interceptor):** We will use the **Observable Stream Pattern**. `adk-js` runners (`BaseAgent.runAsync`) inherently return an `AsyncGenerator<Event>`. We can intercept this stream *before* it reaches the UI without altering the core `BaseAgent`.
*   **Proposed ADK Mapping (Structures):** The wrapper will evaluate standard `adk-js/core/src/events/event.ts` helper methods (like `getFunctionCalls(event)` and `getFunctionResponses(event)`) to clock durations and token usage natively.

```typescript
// Telemetry Stream Interceptor
export async function* withTelemetry(
  agentStream: AsyncGenerator<Event, void>, 
  logger: ClearcutLogger
): AsyncGenerator<Event, void> {
  let stepStartTime = Date.now();

  for await (const event of agentStream) {
    if (getFunctionCalls(event).length > 0) {
      // Model dispatched a tool request
      logger.recordToolStart(event.id);
      stepStartTime = Date.now();
    } 
    
    if (getFunctionResponses(event).length > 0) {
      // Tool finished and returned yield back to agent
      const latencyMs = Date.now() - stepStartTime;
      logger.recordToolEnd(event.id, latencyMs);
    }

    // Transparently yield the unmodified event forward to the UI renderer
    yield event;
  }
}
```
*   **Rationale:** The outer ADK agent remains perfectly isolated and purely functional, while the CLI maintains rigorous fine-grained hardware and tool latency logging.


---

## 3.7 Dynamic Model Routing and Configurability
Banning a model mid-turn, auto-routing via classifiers (e.g. Gemma, Numerical), and falling back dynamically without reinitializing the session.

*   **Current State:** Managed by `ModelRouterService` and a chain of `RoutingStrategy` implementations which require the full `RoutingContext` (`history`, `request`, `AbortSignal`).
*   **Proposed ADK Mapping (Router Interception):** Yes, it is **100% possible to model the current routing feature today**. Because `LlmRequest` exposes the full `contents` array right at execution time, we can synthesize a strict `RoutingContext` (`history = contents.slice(0,-1)`, `request = contents.pop()`).
*   **Proposed ADK Mapping (Solution):** This logic is executed as the second step (after the Quota/Availability prompt) in the `GcliAgentModel.generateContentAsync` pipeline. It resolves the abstract alias to a concrete model ID *after* the availability check, ensuring that any chosen fallback model is also correctly resolved.

```typescript
// Inside GcliAgentModel.generateContentAsync
request.model = this.services.router.resolve(request.model);
```

*   **Proposed ADK Mapping (Model Banning):** Leverage `beforeModelCallback` in `adk-js/core/src/agents/llm_agent.ts`. A callback can check a dynamic blacklist and return a simulated error response, effectively bypassing the model call mid-turn.

## 3.8 Fallbacks and Availability Management
Ensuring availability by retrying or switching models when rate limits (429s) or terminal faults occur.

*   **Current State:** Managed by `ModelAvailabilityService` and `ModelPool` which track healthy vs terminal models.
*   **Proposed ADK Mapping (Solution):** This logic is executed as the first step in the `GcliAgentModel.generateContentAsync` pipeline. It checks if the model alias is currently overloaded or de-prioritized and prompts the user for a fallback *before* standard routing and network traffic begin.
*   **Global Application**: Availability checks apply not just to the primary model, but to **Utility Calls** (e.g., classifiers for routing, summarizers for compaction). The `QuotaService` must be accessible by these sub-services to ensure fallback prompts trigger for utility models too.

```typescript
// Inside GcliAgentModel.generateContentAsync
await this.services.quota.checkAvailabilityOrPrompt(request.model);
```


*   **Mid-Stream Iteration Reset (Backwards Compatibility):** If an error occurs *during* stream iteration (a network drop halfway through reading chunks), we will follow the existing `gemini-cli` behavior of **Full Turn Reset** (re-sending the original prompt from scratch) rather than attempting to stitch text.
    *   **The Signal:** The custom `BaseLlm` will yield a standard `LlmResponse` with `customMetadata: { resetUi: true }`.
    *   **The Translation:** The `LegacyAgentSession` adapter translates this into a standard `gemini-cli` custom event (`{ type: 'custom', kind: 'ui_reset' }`).
    *   **The UI Action:** The Ink renderer clears the screen buffer and prepares for the model to re-generate from the beginning.

*   **The Transition Path (Velocity vs Purity):** To unblock migration testing immediately, we will use a **Velocity-First (Tier 1)** approach of raw callbacks injected into constructors. As the backend stabilizes, these callbacks will be refactored into a `UnifiedPromptProvider` (Tier 2) and eventually standard ADK `ElicitationRequests` (Tier 3) without breaking the internal `BaseLlm` contracts.






---

## 3.9 State-Driven Mode Switching (Plan Mode)
Dynamically shifting system prompts and active tools when users switch interaction tiers (e.g., from Chat Mode to Plan Mode).

*   **Current State:** Toggled via `/plan` command, which sets internal `ApprovalMode` configuration flags. The legacy scheduler reads this config when deciding tool availability.
*   **Proposed ADK Mapping (Dynamic Prompt):** Use `InstructionProvider` in `LlmAgentConfig.instruction`. It evaluates context state on every turn without needing to recreate the agent instance.
*   **Proposed ADK Mapping (Dynamic Tooling):** Use a custom `BaseToolset` where `.getTools(context)` reads session state and returns a filtered subset of tools (e.g., read-only tools for planning).

*   **Design Interactions:**
    *   **Security (Section 3.5):** The standard `SecurityPlugin` and our `GcliPolicyEngineAdapter` remain active and inspect whatever subset of tools the `BaseToolset` yields. Security constraints are unaffected by mode shifts.
    *   **Dynamic Routing (Section 3.7):** The `RouterLlm` can inspect the mode state to route to heavier reasoning models during planning phases.
    *   **Telemetry (Section 3.6):** Remains passive and unaffected, accurately clocking whatever tools execute in either mode.

```typescript
export class GcliModeAwareToolset extends BaseToolset {
  constructor(private chatTools: BaseTool[], private planTools: BaseTool[]) { super([]); }

  async getTools(context?: ReadonlyContext): Promise<BaseTool[]> {
    const isPlan = context?.state.get('plan_mode') as boolean;
    return isPlan ? this.planTools : this.chatTools;
  }
  async close() {}
}
```

## 3.10 Tool Output Masking
Managing context window efficiency by offloading bulky tool outputs (e.g., shell logs, large file reads) to files.

*   **Current State:** `ToolOutputMaskingService` in `packages/core/src/context/toolOutputMaskingService.ts`.
    -   **Algorithm**: "Hybrid Backward Scanned FIFO".
    -   **Trigger**: Scans backwards. Protects recent $50,000$ tool tokens. Masks older ones once a $30,000$ batch threshold is reached.
    -   **Behavior**: Writes full output to `tool-outputs/` file and yield a preview snippet containing a Head+Tail summary and a file path link.
*   **Proposed ADK Mapping:** This logic is executed on **every conversation turn** as a linear step in the `GcliAgentModel.generateContentAsync` pipeline (executed *after* Compaction so the Compactor sees raw data, but *before* Auth/Dispatch). This ensures the context window stays lean cheaply without LLM overhead.

# 4. The SDK Facade (Stateful Orchestration)

To support the 6-month vision of a portable, testable SDK, we will formalize the `AdkAgentService`. This service acts as a **Stateful Lifecycle Manager** that orchestrates the global environment (Auth, Routing, Quota, Tools) and binds them into standard `AgentSessions`.

### 4.1 Hybrid Tool Instantiation (Independence)
To prevent tools from sharing state across concurrent subagent sessions, the service will **clone or reinstantiate stateful tools**, while sharing stateless singletons (like `grep` or `read_file`).

### 4.2 Custom File-Based Persistence
Per constraints, we will override ADK's native SQLite storage with a custom `GcliFileSessionService extends BaseSessionService` that reads and writes to your standard workspace JSON files.

```typescript
export interface AgentServiceConfig {
  model: BaseLlm; 
  sessionService: GcliFileSessionService; 
  localTools: BaseTool[];
  mcpProviders: McpClientProvider[];
  policyEngine: BasePolicyEngine;
}

### 4.3 Concept: Decomposing the "God Config" (Legacy AgentLoopContext)

To prevent dragging legacy debt into the pure ADK architecture, the existing `AgentLoopContext` will be treated strictly as a **Legacy Bridge Artifact**. In the new `AdkAgentService`, we decompose it into granular, single-responsibility injections:

-   **Pipeline Config**: Only Quota, Routing, Compactor, Masker, and Auth are passed to `GcliAgentModel`. NO tool registries or sandboxes.
-   **Tool Config**: Environmental dependencies (like `SandboxManager`) are injected directly into the tool constructors (e.g., `ExecuteShellTool`), not passed globally.
-   **UI Yields**: Responsibilities for terminal UI rendering listen to standard ADK runner event output streams, rather than agents reaching out to a global `messageBus`.

export class AdkAgentService {
  constructor(private config: AgentServiceConfig) {}

  /**
   * Spawns a new session using standard AgentDefinition.
   * Clones stateful tools to ensure subagent independence.
   */
  async createSession(definition: AgentDefinition): Promise<AgentSession>;

  /**
   * Resumes an existing session from local file storage.
   */
  async resumeSession(sessionId: string): Promise<AgentSession>;

  async listSessions(): Promise<SessionInfo[]>;
}
```

---

# 5. Known Gaps in ADK (Gating Blockers)

This section highlights existing gaps in standard ADK that prevent a seamless cutover without upstream pull requests.

## 5.1 Real-Time User Message Injections (Aborted Turns)
While Next-Step steering is possible today using `beforeModelCallback`, true real-time interruption (injecting a hint while a tool or model is actively running without aborting the RPC altogether) requires **Input Streams** (feeding an `AsyncGenerator` to `runAsync`). Un-merged ADK PR #214 addresses this, but it is not yet standard.

## 5.2 Conversation Rewind and State Reversal
Translating manual trajectory drops to ADK runtime state is cumbersome. While Python ADK supports rollback, typescript ADK does not yet support it natively.
*   **Resolution Strategy**: Since we are implementing a custom `GcliFileSessionService` (Section 4.2) for workspace parity, we can **implement Rewind directly in our custom service** (by truncating the JSON file history) without requiring upstream ADK changes to the SQL-based `DatabaseSessionService`.

## 5.3 Concurrent runAsync Sessions and DB Locking
Running parallel `runAsync` loops on the exact same Session ID causes database serialization conflicts (`PESSIMISTIC_WRITE`) or state clobbering inside standard repository storage layers.

---

# Long-Term Vision: Unification of Agents and Subagents

The long-term vision dictates that **subagents and the primary agent are functionally identical**. They must share the exact same tool definitions, same policy constraints, and configuration schemas. 

*   **Nesting Agents:** In standard ADK (`adk-js/core/src/agents/base_agent.ts`), any subclass of `BaseAgent` can be wrapped as a `FunctionalTool` and passed to a parent agent. This provides standard, type-safe nesting without custom wrapper shims.

---

# Migration Sequence and Unification Checklist

The migration will address the following sub-issues (non-sequential track) by swapping `LegacyAgentSession` for `ADKAgentSession` utilizing standard ADK runtime inside the `npm run test` harness.

- [ ] Adapt non-interactive mode to `AgentSession` interface `#22699`
- [ ] Adapt interactive mode runtime to `AgentSession` `#22701`
- [ ] Adapt subagents to `AgentSession` interface `#22700`
- [ ] ADK agent conforms to `AgentSession` interface `#22974`
- [ ] ADK agent supports skills in parity with existing agent `#22966`
- [ ] ADK agent supports tool confirmations and policies `#22964`
- [ ] ADK agent compaction works with comparable quality to existing compaction `#22979`

---

# Status of this document approvals table {#status-of-this-document}

| #begin-approvals-addon-section See [go/g3a-approvals](http://goto.google.com/g3a-approvals) for instructions on adding reviewers. |
| :---: |
.
