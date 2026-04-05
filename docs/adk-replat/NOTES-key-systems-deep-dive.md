# Deep Dive: Key Gemini-CLI Systems

## Hooks System (Complete)

### 11 Hook Points

| Hook                | Input                                  | Key Output Capabilities                       |
| ------------------- | -------------------------------------- | --------------------------------------------- |
| BeforeTool          | toolName, toolInput, mcpContext        | Modify tool_input, block/allow, systemMessage |
| AfterTool           | toolName, toolInput, toolResponse      | additionalContext, tailToolCallRequest        |
| BeforeAgent         | prompt                                 | Additional context                            |
| AfterAgent          | prompt, response, stopHookActive       | Clear context                                 |
| BeforeModel         | llmRequest (GenerateContentParameters) | Modify llm_request OR inject llm_response     |
| AfterModel          | llmRequest, llmResponse                | Modify llm_response                           |
| BeforeToolSelection | llmRequest                             | Modify toolConfig (function list, mode)       |
| Notification        | type, message, details                 | Suppress/modify                               |
| SessionStart        | source (Startup/Resume/Clear)          | Additional context                            |
| SessionEnd          | reason (Exit/Clear/Logout/etc)         | Cleanup                                       |
| PreCompress         | trigger (Manual/Auto)                  | Suppress/modify                               |

### Hook Configuration Types

- **Runtime hooks** (HookType.Runtime): JS/TS functions, registered
  programmatically
- **Command hooks** (HookType.Command): External shell commands with JSON I/O

### Exit Code Semantics (Command Hooks)

- 0 = Success (allowed with system message)
- 1 = Non-blocking error (warning, continues)
- 2+ = Blocking failure (denied, stderr as reason)

### Hook Decision Values

`'ask' | 'block' | 'deny' | 'approve' | 'allow' | undefined`

### Execution Strategies

- **Parallel** (default): Promise.all(), independent
- **Sequential** (opt-in per hook): Chained, output→input cascading

### Aggregation

- Blocking decisions: OR logic (any block → all block)
- Field replacement: later overrides earlier
- Tool selection: union of allowed functions, mode precedence NONE > ANY > AUTO

### Trust Model

- Project hooks require folder trust verification
- TrustedHooksManager at `~/.gemini/trusted-hooks.json`
- Environment sanitized for command hooks (sensitive vars removed)
- `GEMINI_PROJECT_DIR` injected

### Key Insight for Abstraction

Hooks fire inside gemini-cli's execution loop. When ADK controls the model:

- BeforeModel/AfterModel still fire because AdkGeminiModel wraps GeminiChat
- BeforeTool/AfterTool still fire because AdkToolAdapter wraps DeclarativeTool
- This is dewitt's solution: adapters preserve hook injection points

**For OpenRouter or opaque agents, hooks CANNOT fire unless the agent delegates
model/tool calls back to gemini-cli.**

---

## Policy Engine (Complete)

### TOML Rule Format

```toml
[[rules]]
decision = "allow" | "deny" | "ask_user"
priority = 0-999
toolName = "tool_name"       # wildcards: *, mcp_*, mcp_server_*
mcpName = "server_name"      # MCP server filter
argsPattern = "regex"        # matches JSON-stringified args
commandPrefix = "cmd"        # shell command prefix match
commandRegex = "regex"       # shell command regex (mutually exclusive with prefix)
modes = ["default", "autoEdit", "yolo", "plan"]
annotations = ["read-only", "experimental"]
allowRedirection = true      # for shell commands
allowMessage = "..."         # user-facing message on allow
denyMessage = "..."          # user-facing message on deny
```

### 5-Tier Priority System

- Tier 5 (Admin): 5.000-5.999
- Tier 4 (User): 4.000-4.999
- Tier 3 (Workspace): 3.000-3.999
- Tier 2 (Extension): 2.000-2.999
- Tier 1 (Default): 1.000-1.999

Formula: `tier + (priority / 1000)`

### 4 Approval Modes

1. **default** — ASK_USER decisions prompt user
2. **autoEdit** — File writes auto-approved with safety checking (conseca)
3. **yolo** — All auto-approved except explicit ask_user rules
4. **plan** — Read-only, blocks modifications, allows planning docs

### Shell Command Safety

- Parses multi-command sequences (&&, ;, ||)
- Detects injection: $(...), `...`, <(...), >(...), --flag=$(...)
- Each subcommand evaluated independently
- DENY overrides everything; ASK_USER escalates; ALLOW only if all pass
- Redirections (>) downgrade ALLOW → ASK_USER unless allowRedirection=true

### Security Constraints

- Extensions cannot contribute ALLOW rules or YOLO mode
- Regex patterns validated for ReDoS
- Tool name typos detected via Levenshtein distance ≤3
- Policy file integrity: SHA-256 hash checking

### Key Insight for Abstraction

Policy is evaluated at the tool execution boundary. For the interface layer:

- If CLI controls tool execution → policy naturally applies
- If agent controls tool execution internally → policy bypassed (danger!)
- This reinforces the `pauseOnToolCalls: true` approach for ADK
- Need a `PolicyEvaluator` interface that any executor can call

---

## Tool System (Complete)

### Core Abstraction Chain

```
ToolBuilder (metadata + schema)
  → build(params) validates → ToolInvocation (ready to execute)
    → shouldConfirmExecute() → execute(signal) → ToolResult
```

### DeclarativeTool Pattern

- `build(params)` — Validate and create invocation
- `buildAndExecute(params)` — One-step convenience
- `validateBuildAndExecute(params)` — Non-throwing variant

### BaseToolInvocation

- Message bus integration for policy decisions
- Three decision paths: ALLOW → execute, DENY → reject, ASK_USER → confirm

### ToolResult Structure

- `llmContent` — For LLM conversation history
- `returnDisplay` — For UI presentation
- `displayContent` — Additional display formatting
- `errorDetails` — Optional error info
- `result` — Structured data payload
- `tailCall` — Optional chaining requests

### Confirmation System (6 types)

1. **edit** — File modification with diff
2. **execute** — Command execution
3. **mcp** — MCP tool with allowlist mgmt
4. **info** — Information-only
5. **ask_user** — General user approval
6. **exit_plan_mode** — Plan exit notification

### Confirmation Outcomes (7 values)

ProceedOnce, ProceedAlways, ProceedAlwaysAndSave, ProceedAlwaysServer,
ProceedAlwaysTool, ModifyWithEditor, Cancel

### Tool Kinds

- **Mutator**: Edit, Delete, Move, Execute
- **Read-Only**: Read, Search, Fetch
- **Other**: Think, Agent, Communicate, Plan, SwitchMode, Other

### MCP Tools

- Naming: `mcp_<server>_<toolname>` (64-char limit)
- Schema validation via LenientJsonSchemaValidator
- Response types: McpTextBlock, McpMediaBlock, McpResourceBlock,
  McpResourceLinkBlock
- Transform to GenAI Parts format

### Error Types (20+)

- **Recoverable**: INVALID_TOOL_PARAMS, FILE_NOT_FOUND,
  EDIT_NO_OCCURRENCE_FOUND, SHELL_TIMEOUT, MCP_TOOL_ERROR...
- **Fatal**: NO_SPACE_LEFT (only one!)

### ModifiableTool

- Extends DeclarativeTool with external editor support
- `getModifyContext()` → temp files → editor opens → `getUpdatedParams()` → diff

---

## Execution Loop (Complete)

### LocalAgentExecutor Flow

1. Collect user hints, setup deadline timer
2. **Turn loop**: executeTurn() repeatedly until completion
3. Per-turn: compress chat → callModel() → processFunctionCalls()
4. On limit hit: executeFinalWarningTurn() with 60s grace period
5. Return OutputObject { result, terminate_reason }

### AgentTerminateMode

GOAL | TIMEOUT | MAX_TURNS | ABORTED | ERROR | ERROR_NO_COMPLETE_TASK_CALL

### SubagentTool Architecture

```
Parent Agent
  └─ SubagentTool (wraps AgentDefinition as DeclarativeTool)
       └─ SubagentToolWrapper (routes by agent kind)
            ├─ LocalSubagentInvocation → LocalAgentExecutor
            ├─ RemoteAgentInvocation → A2AClientManager
            └─ BrowserAgentInvocation
```

### Agent Types

- `LocalAgentDefinition` — kind: 'local', has promptConfig, modelConfig,
  runConfig, toolConfig
- `RemoteAgentDefinition` — kind: 'remote', has agentCardUrl, auth config

### Key Defaults

- DEFAULT_MAX_TURNS = 15
- DEFAULT_MAX_TIME_MINUTES = 5
- A2A_TIMEOUT = 1800000 (30 min for remote agents)

---

## Services/Config (Complete)

### ModelConfigService

- **Alias chains**: Inheritance with `extends`, merged root-to-leaf
- **Overrides**: Contextual (model, scope, retry, isChatModel), sorted by
  specificity
- **Runtime registration**: Dynamic aliases and overrides
- **Deep merge**: Objects merged, arrays replaced entirely

### ModelRouterService (Strategy Chain)

1. Fallback & Override → 2. Approval Mode → 3. Gemma Classifier → 4. Generic
   Classifier → 5. Numerical Classifier → 6. Default

### ModelAvailabilityService

- Terminal (permanent), Sticky_retry (one retry per turn), Healthy
- `selectFirstAvailable()` iterates fallback chain
- `resetTurn()` at turn boundaries enables fresh retries

### Config (~95KB!)

Central dependency injection. Initializes: ModelAvailabilityService →
ModelConfigService → FolderTrustDiscoveryService → PolicyEngine →
FileDiscoveryService → GitService → ToolRegistry → MCP → GeminiClient →
HookSystem

### CoreEventEmitter (UI Events)

Event types: UserFeedback, ModelChanged, ConsoleLog, Output, RetryAttempt,
ConsentRequest, McpProgress, Hook, QuotaChanged

Backlog buffering (max 10,000) with head-pointer eviction and auto-compaction.

### Scheduler Types

```typescript
ToolCallRequestInfo {
  callId, name, args, originalRequestName,
  isClientInitiated, prompt_id, checkpoint, traceId,
  parentCallId, schedulerId
}
ToolCallResponseInfo {
  callId, responseParts, resultDisplay, error, errorType,
  outputFile, contentLength, data
}
CoreToolCallStatus: Validating → AwaitingApproval → Scheduled → Executing → Success|Error|Cancelled
```

### FolderTrust

Scans: commands (.toml), skills (SKILL.md), settings.json, MCP servers, hooks
Security warnings: auto-approved tools, autonomous agents, disabled trust,
disabled sandbox Pattern: discovery → review → execution (no code runs during
scan)
