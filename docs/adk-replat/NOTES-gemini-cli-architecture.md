# Gemini CLI Architecture Notes

## Project Structure

**Monorepo packages:**

- `packages/core/` - Main execution engine (the big one)
- `packages/cli/` - CLI frontend
- `packages/sdk/` - SDK for extensions
- `packages/a2a-server/` - Agent-to-agent server
- `packages/devtools/` - Dev utilities
- `packages/vscode-ide-companion/` - VS Code extension

## Core Execution Loop

### GeminiClient (`core/src/core/client.ts` ~38KB)

- **Primary orchestrator** for user interactions
- Manages session lifecycle, message routing, model selection
- Coordinates hooks, context management, error recovery
- Enforces `MAX_TURNS = 100` per session
- Tracks `currentSequenceModel` for multi-turn stickiness
- Handles history compression when context grows

### GeminiChat (`core/src/core/geminiChat.ts` ~34KB)

- Bidirectional LLM communication
- Maintains `history[]` alternating user/model turns
- Retry logic: max 2 attempts, 500ms delay for invalid responses
- Fires `BeforeModel` and `AfterModel` hooks
- Integrates ChatRecordingService for persistence

### Scheduler (`core/src/scheduler/scheduler.ts` ~23KB)

- **Three-phase event-driven**: Ingestion → Processing → Completion
- Tool call state machine:
  `Validating → AwaitingApproval → Scheduled → Executing → Terminal`
- Terminal states: `Success`, `Error`, `Cancelled`
- Parallel execution for read-only and agent-type tools
- Yields to event loop for user approval
- Publishes state changes via MessageBus

### CoreToolScheduler (`core/src/core/coreToolScheduler.ts` ~38KB)

- Sequential, queue-based tool processing
- Validates policy via PolicyEngine
- Confirmation handling via ToolModificationHandler (editor integration)
- Uses MessageBus for async confirmation responses

## Tool System

### DeclarativeTool Pattern

- **Separation of concerns**: build() → validate → createInvocation() →
  execute()
- `ToolBuilder` defines metadata (name, displayName, description, kind) + schema
  via `getSchema()`
- `ToolInvocation` has: `getDescription()`, `toolLocations()`,
  `shouldConfirmExecute()`, `execute()`
- `ToolResult` contains: `llmContent` (for LLM), `returnDisplay` (for UI), error
  details, tail calls

### BaseToolInvocation

- Abstract base with MessageBus integration for policy/confirmation
- Three decision paths: ALLOW, DENY, ASK_USER via `getMessageBusDecision()`

### ToolRegistry (`core/src/tools/tool-registry.ts`)

- Registers tools via `registerTool()`
- MCP tools with fully qualified names: `mcp_serverName_toolName`
- Priority sorting: built-in → discovered → MCP (by server name)
- Filters by active status based on configuration

### Confirmation System

- `ToolCallConfirmationDetails` union: edit, execute, MCP, info, ask_user,
  exit_plan_mode
- `ToolConfirmationOutcome` enum: ProceedOnce, ProceedAlways, etc.
- Async confirmation via MessageBus pub/sub

## Hooks System

### Hook Types (11 hook points)

| Hook                  | Trigger                 | Key Capability                    |
| --------------------- | ----------------------- | --------------------------------- |
| `BeforeTool`          | Before tool execution   | Modify tool_input                 |
| `AfterTool`           | After tool completion   | Context injection, tail calls     |
| `BeforeAgent`         | Before agent prompt     | Additional context                |
| `AfterAgent`          | After agent response    | Clear context flag                |
| `BeforeModel`         | Before LLM request      | Modify request or inject response |
| `AfterModel`          | After LLM response      | Modify response                   |
| `BeforeToolSelection` | Before tool selection   | Modify toolConfig                 |
| `Notification`        | When notifications fire | Suppress/modify message           |
| `SessionStart`        | Session begins          | Additional context                |
| `SessionEnd`          | Session terminates      | Cleanup                           |
| `PreCompress`         | Before compression      | Suppress/modify                   |

### Hook Output Fields (common to all hooks)

- `continue` - Whether execution proceeds
- `stopReason` - Reason to halt
- `suppressOutput` - Hide from user
- `systemMessage` - Add to system context
- `decision` - ask/block/deny/approve/allow

### Hook System Components

- `HookSystem` - Main coordinator
- `HookRegistry` - Stores/manages configurations
- `HookRunner` - Executes registered hooks
- `HookAggregator` - Combines multiple hook results
- `HookPlanner` - Determines execution order
- `HookEventHandler` - Orchestrates event firing
- `HookTranslator` - Converts between formats

## Policy Engine

### Rule Structure

```
PolicyRule {
  toolName: string;        // wildcards supported
  decision: PolicyDecision; // ALLOW | DENY | ASK_USER
  priority: number;
  argsPattern?: RegExp;    // conditional on args
  mcpName?: string;
  source: string;
}
```

### Tier Hierarchy (lowest → highest priority)

1. Default (1) - Core built-in policies
2. Extension (2) - Extension contributions
3. Workspace (3) - Project-scoped (.gemini/)
4. User (4) - User-provided (~/.gemini/)
5. Admin (5) - System-level policies

### Dynamic Rule Priorities (within User Tier)

- 4.9 - MCP_EXCLUDED (persistent server blocks)
- 4.4 - EXCLUDE_TOOLS_FLAG (CLI exclusions)
- 4.3 - ALLOWED_TOOLS_FLAG (CLI allows)
- 4.2 - TRUSTED_MCP_SERVER
- 4.1 - ALLOWED_MCP_SERVER
- 3.95 - ALWAYS_ALLOW (interactive selections)

### Security Constraint

- Extensions CANNOT contribute ALLOW rules or YOLO mode

## Agent System

### Agent Registry (`core/src/agents/registry.ts`)

Discovery sources:

1. Built-in: CodebaseInvestigator, CliHelp, Generalist, Browser
2. User-level: `~/.gemini/agents/`
3. Project-level: `.gemini/agents/` (requires folder trust)
4. Extension-based: From active extensions

### LocalAgentExecutor (`core/src/agents/local-executor.ts`)

- Prompt processing: input augmentation → template expansion → system prompt
  construction
- Uses GeminiChat for accumulating conversation
- ChatCompressionService for history management
- Turn loop: invoke model → extract function calls → check auth → append results
- Termination: complete_task tool, max turns, timeout

### SubagentTool (`core/src/agents/subagent-tool.ts`)

- Extends BaseDeclarativeTool - agents invoked like standard tools
- Read-only status checking, user hint propagation
- Execution: validate → optional confirmation → parameter enrichment →
  SubagentToolWrapper

### Remote Agents

- A2A client manager for agent-to-agent protocol
- Remote invocation for external agents
- Agent acknowledgement system (security for project agents)

## Model System

### ModelConfigService

- **Hierarchical alias system**: children override parents
- Resolution: alias chain → level assignment → apply overrides
- Deep merging with array override capability
- Fallback to `chat-base` alias for unknown models

### ModelRouterService

Sequential strategy pattern:

1. Fallback & Override
2. Approval Mode Strategy
3. Gemma Classifier (if enabled)
4. Generic Classifier
5. Numerical Classifier
6. Default Strategy

### ModelAvailabilityService

Health states:

- **Terminal** - permanently unavailable
- **Sticky Retry** - failed once, can retry once per turn
- **Healthy** - no issues

## Services

| Service                     | Purpose                                 |
| --------------------------- | --------------------------------------- |
| ChatRecordingService        | Session persistence (JSON files)        |
| ChatCompressionService      | History summarization for token budgets |
| ModelConfigService          | Hierarchical model config with aliases  |
| ModelAvailabilityService    | Model health tracking                   |
| ModelRouterService          | Model selection via strategies          |
| FolderTrustDiscoveryService | Workspace security scanning             |
| KeychainService             | Credential storage                      |
| LoopDetectionService        | Detect repetitive agent loops           |

## UI + Core Separation

### IDE Client (`core/src/ide/ide-client.ts`)

- Singleton managing CLI ↔ IDE communication via MCP
- **Outbound** (CLI → IDE): `openDiff`, `closeDiff`
- **Inbound** (IDE → CLI): `ide/contextUpdate`, `ide/diffAccepted`,
  `ide/diffRejected`

### Event Contract

```typescript
interface IdeContextNotification {
  method: 'ide/contextUpdate';
  params: { workspaceState: { openFiles: string[]; isTrusted: boolean } };
}
```

### Confirmation Bus

- `TOOL_CONFIRMATION_REQUEST` / `TOOL_CONFIRMATION_RESPONSE`
- Detail types: edit, execute, MCP, info, ask_user, exit_plan_mode
- Async pub/sub via MessageBus

## Configuration (`core/src/config/config.ts` ~95KB!)

- Tool config: core tools, allowed/excluded, MCP servers
- File filtering: git ignore, fuzzy search, max counts, timeouts
- Approval modes: policy engine config
- Experiments: feature flags (GEMINI_3_1_PRO_LAUNCHED, ENABLE_ADMIN_CONTROLS,
  etc.)
- FolderTrust: discovery scans for commands, skills, settings, MCP, hooks
