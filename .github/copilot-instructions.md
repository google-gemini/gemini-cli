# Gemini CLI: Copilot Instructions

## Project Overview

**Gemini CLI** is an open-source AI agent delivering Gemini's capabilities directly to the terminal. It features a modular architecture separating CLI frontend (`packages/cli`) from a backend (`packages/core`) that orchestrates API interactions and tool execution.

### Core Architecture

```
User Input (CLI) → Request (Core) → API + Tool Execution → Response → Display
```

**Key packages:**
- **`packages/cli`** - Terminal UI, input handling, history, display rendering (React-based with Ink)
- **`packages/core`** - API orchestration, tool registry, model routing, conversation state
- **`packages/core/src/tools/`** - Tool modules (file I/O, shell, web-fetch, MCP clients, search)
- **`packages/core/src/routing/`** - Model router service with pluggable strategies (DefaultStrategy, ClassifierStrategy)

### Interaction Flow

1. User types prompt → `packages/cli` captures input
2. CLI sends request to `packages/core`
3. Core constructs prompt + sends to Gemini API (models: pro/flash/flash-lite/preview)
4. API response triggers tool calls or returns final answer
5. For modifiable tools (edit, write), user approval required; read-only tools (read, grep) auto-execute
6. Tool results feed back to API → final response → CLI displays

## Critical Developer Workflows

### Build & Bundle
- **Main build:** `npm run build` - Compiles packages with TypeScript, outputs to `dist/`
- **Full build:** `npm run build:all` - Includes `build` + sandbox + VSCode companion
- **Bundle:** `npm run bundle` - esbuild config generates CLI executable (`bundle/gemini.js`)
- **Sandbox images:** `npm run build:sandbox` - Docker/Podman container for tool execution isolation

### Testing
- **Unit/integration:** `npm run test --workspaces` - Vitest runs tests in each package
- **E2E tests:** `npm run test:e2e` - Interactive integration tests in `integration-tests/`
  - Uses `TestRig` helper to spawn CLI, capture output, assert tool calls
  - Environment: `GEMINI_SANDBOX=false` (local), `docker`, or `podman`
  - Retry: 2 attempts, parallel file execution (8-16 threads), 5-min timeout per test
- **Pre-commit:** `npm run preflight` - Format, lint, build, typecheck, test:ci

### Development & Debugging
- **Start dev mode:** `npm run start` - Local CLI with `NODE_ENV=development`
- **Debug mode:** `npm run debug` - `node --inspect-brk` for debugger connection
- **Dev tracing:** `GEMINI_DEV_TRACING=true npm run start` - OpenTelemetry traces via Genkit UI or Jaeger
  - View traces: `npm run telemetry -- --target=genkit` (UI at `http://localhost:4000`)
  - Instrument code: Use `runInDevTraceSpan({ name: 'span-name' }, async ({ metadata }) => { ... })`

### Model Routing & Configuration
- **Model selection:** `packages/core/src/config/models.ts` defines constants (pro, flash, flash-lite, preview)
- **Router service:** `ModelRouterService` evaluates context (history, turn type, fallback mode, forced override)
- **Strategies:** DefaultStrategy or ClassifierStrategy (pluggable via constructor)
- **Fallback mechanism:** When quota hit, downgrade to flash model (respects "lite" requests)

## Project-Specific Conventions

### Tool Development Pattern

**Standard tool structure** (see `packages/core/src/tools/edit.ts`, `read-file.ts`):
```typescript
// In packages/core/src/tools/your-tool.ts
export interface YourToolParams { file_path?: string; /* JSON schema props */ }
export interface YourToolResult extends ToolResult { /* success/error */ }

export class YourToolInvocation extends BaseToolInvocation<YourToolParams, YourToolResult> {
  getDescription(): string { /* Human-readable preview, shown pre-execution */ }
  toolLocations(): ToolLocation[] { /* Return [{path, operation}] for file ops */ }
  async shouldConfirmExecute(signal): Promise<ToolCallConfirmationDetails | false> {
    // Read-only tools return false; modifiable tools use messageBus to prompt user
  }
  async execute(signal, updateOutput?, shellConfig?): Promise<YourToolResult> {
    // Implement tool logic; use updateOutput() to stream progress
    // On error: return { toolError: ToolErrorType.EXECUTION_ERROR, message: "..." }
  }
}

export class YourTool extends BaseDeclarativeTool<YourToolParams, YourToolInvocation> {
  static toolDefinition(): FunctionDeclaration { /* Gemini API schema */ }
  invocation(params, messageBus?): YourToolInvocation {
    return new YourToolInvocation(params, messageBus);
  }
}
```

**Key patterns:**
- `BaseToolInvocation` + `BaseDeclarativeTool` pattern is standard; no alternatives
- `getDescription()` determines user prompt content (use `{ toolError }` for failures)
- `toolLocations()` enables IDE highlighting; critical for modifiable tools
- Read-only tools: `shouldConfirmExecute()` returns `false` → auto-execute
- Modifiable tools: Extend `ModifiableDeclarativeTool`, use `messageBus` for user approval
- Error handling: Always return `{ toolError: ToolErrorType.*, message, ...details }`
- Tool result must extend `ToolResult` union type (see `packages/core/src/tools/tools.ts`)

### MCP (Model Context Protocol) Integration
- `packages/core/src/tools/mcp-client.ts` - Spawns MCP servers, discovers tools via protocol
- `ToolRegistry` auto-discovers MCP tools and registers alongside native tools
- Configuration in `~/.gemini/config.json`: `"mcpServers": { "name": { "command": "...", "args": [...] } }`
- MCP servers wrapped as `DiscoveredMCPTool`; tool execution via stdin/stdout JSON serialization
- Discovery happens at startup via `connectAndDiscover()` (blocking); tools become available immediately
- Tool call failures: MCP server crash handled as `toolError: ToolErrorType.EXECUTION_ERROR`

### Testing Patterns (Vitest)
- **Unit tests** (alongside source): `*.test.ts` files use Vitest with mocks (`vi.fn()`, `vi.mock()`)
- **Mock fs:** `__mocks__/fs/promises.ts` uses Vitest hoisting; tests auto-use mocked fs
- **Integration tests** (`integration-tests/`): Spawn real CLI, use `TestRig` helper
  ```typescript
  import { TestRig } from './test-helper.js';
  
  it('should invoke a tool', async () => {
    const rig = new TestRig({ /* config */ });
    const result = await rig.invoke('prompt', { env: 'GEMINI_SANDBOX=false' });
    expect(result).toContain('expected output');
    expect(rig.findToolCall('tool_name')).toBeDefined();
    const toolLogs = rig.readToolLogs(); // Get raw tool call logs
  });
  ```
- **TestRig methods:** `invoke()`, `findToolCall()`, `readToolLogs()`, `poll()` for async checks
- **Config:** E2E tests run with 2 retries, 8-16 parallel threads, 5-min timeout per test
- **Sandbox modes:** `GEMINI_SANDBOX=false` (local), `docker`, `podman` - env var sets execution context

### Configuration & State Management
- User settings: `packages/core/src/config/config.ts` - Loads from `~/.gemini/config.json` or env vars
- API keys: OAuth providers in `packages/core/src/mcp/` (google-auth-provider.ts, oauth-provider.ts)
- Conversation history: Managed in CLI state, sent to API per turn
- Fallback tracking: `config.isInFallbackMode()` activates when quota exhausted
- Approval modes: `ApprovalMode.DEFAULT` (prompt), `.AUTO_EDIT` (auto-approve edits), `.YOLO` (skip all prompts)

### Error Handling & Quota Management
- Quota errors classified in `packages/core/src/utils/googleQuotaErrors.ts`
  - `TerminalQuotaError` (hard limit, e.g., daily quota) → stops execution
  - `RetryableQuotaError` (soft limit, e.g., per-minute) → triggers fallback
- Fallback mechanism: Downgrade to flash model, preserve "lite" requests (cost optimization)
- Tool errors: Return `{ toolError: ToolErrorType.EXECUTION_ERROR, message: "...", details?: {} }`
- Retry logic: `retryWithBackoff()` in `packages/core/src/utils/retry.ts` for API calls

### Model Routing Strategy
- **DefaultStrategy:** Simple model selection (not currently used)
- **ClassifierStrategy:** Evaluates context to route between pro/flash (currently active)
- **Bypass conditions:** Tool responses, next speaker checks, forced overrides all bypass routing
- **Model aliases:** User inputs `pro`, `flash`, `flash-lite` → resolved to full model names
- **Preview features:** Set `previewFeaturesEnabled` in config to access `gemini-3-pro-preview`

### Handling File Operations & User Approval
- Modifiable tools (edit, write) require confirmation via `messageBus.publish()` → wait for response
- Read-only tools (read, grep, ls) auto-execute (no user approval)
- `ToolLocation` array drives IDE diff preview; include file path + operation type
- For multi-file operations: Use `ReadManyFilesTool` to batch-read instead of N sequential calls

## Integration Points & External Dependencies

### Gemini API Client
- SDK: `@google/genai` v1.30.0
- Models: `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-3-pro-preview`
- Auth: OAuth 2.0 via Google Cloud libraries
- Tool requests modeled as `FunctionCalling` in API schema

### MCP (Model Context Protocol)
- SDK: `@modelcontextprotocol/sdk` v1.11.0
- Tools discovered via server protocol, auto-wrapped for Gemini API
- Bidirectional: Gemini → MCP tool call → execute → Gemini processes result

### Telemetry & Tracing
- **OpenTelemetry (OTel):** Instrumentation for model calls, tool scheduler, tool execution
- **Exporters:** Jaeger, Genkit UI, Google Cloud Trace, Cloud Monitoring
- **Dev traces:** Disabled by default; enable with `GEMINI_DEV_TRACING=true`

### Terminal UI (Ink/React)
- `packages/cli` renders with Ink (React renderer for terminals)
- Theme/styling: Configured via `.gemini/config.json`
- History managed in memory per session

## Common Patterns & Workflows

### Adding a New Tool
1. Create `packages/core/src/tools/my-tool.ts` with tool logic
2. Implement `MyToolInvocation` and `MyTool` classes
3. Register in `ToolRegistry` (auto-discovery via `BaseDeclarativeTool` subclass)
4. Add unit tests `my-tool.test.ts` with Vitest mocks
5. Add integration test in `integration-tests/my-tool.test.ts` using `TestRig`
6. Add tool definition to `packages/core/src/tools/tool-names.ts` if public

### Debugging Tool Execution Issues
- Enable verbose output: `npm run start` with `DEBUG=*` environment variable
- Use dev tracing: `GEMINI_DEV_TRACING=true npm run start` → view at `npm run telemetry -- --target=genkit`
- Check tool logs in integration tests: `rig.readToolLogs()` returns raw execution data
- For shell tools: Use `updateOutput(string)` callback to stream progress

### Modifying Models or Routing Logic
- **Model list:** `packages/core/src/config/models.ts` - Add constants here
- **Router:** `packages/core/src/routing/modelRouterService.ts` - Decision logic
- **Strategies:** `packages/core/src/routing/strategies/` - Pluggable routing algorithms
- Test routing with `integration-tests/` + manually verify with `npm run start`

### Quota & Fallback Handling
- **Detection:** Check `classifyGoogleError()` in `packages/core/src/utils/googleQuotaErrors.ts`
- **State:** `config.isInFallbackMode()` indicates active fallback
- **Recovery:** Fallback automatically downgrades model; manual recovery via `config.resetFallback()`
- **Testing:** Use mock errors in unit tests, E2E tests verify fallback with real quota hits

## Advanced Topics

### Chat History Management & Compression
- **Compression triggers:** When history exceeds 70% of token limit (DEFAULT_COMPRESSION_TOKEN_THRESHOLD)
- **Compression strategy:** Keep last 30% of history (COMPRESSION_PRESERVE_THRESHOLD) to preserve context
- **Service:** `ChatCompressionService` uses Gemini API to summarize old turns
- **Splitting logic:** `findCompressSplitPoint()` only compresses at user message boundaries (safe split points)
- **Validation:** History must alternate user↔model, start with user, no function calls in model boundaries

### Service Patterns
- **FileDiscoveryService** - Respects `.gitignore` and `.geminiignore` (configurable per operation)
- **GitService** - Repo analysis for context
- **ShellExecutionService** - Handles sandboxed shell execution with streaming output
- **LoopDetectionService** - Detects and prevents infinite tool call loops
- **ModelConfigService** - Manages model capabilities and token limits (cached from API)

### Error Classification & Recovery
- **Fatal vs Retryable:** 
  - `FatalError` subclasses exit immediately (auth, config, sandbox, turn limit errors)
  - Exit codes: 41 (auth), 42 (input), 44 (sandbox), 52 (config), 53 (turn limit)
- **Quota errors:** Use `classifyGoogleError()` to distinguish terminal (daily limit) vs retryable (rate limit)
- **Tool execution:** Tools return `{ toolError, message, details }` on failure; executor continues or stops based on error type
- **Error reporting:** `reportError()` sends structured error data for monitoring

### Agent Execution & Tool Calling Loop
- **AgentExecutor** runs agents that call tools until `complete_task` is invoked
- **Non-interactive tool execution:** `executeToolCall()` bypasses approval prompts (used by agents)
- **Tool scheduling:** Core scheduler handles tool call resolution, output streaming, and error propagation
- **Activity tracking:** Optional `ActivityCallback` receives agent turn events (thought, tool_call, tool_response, completion)
- **Termination modes:** `completed`, `timeout` (grace period 60s), `tool_error`, `api_error`

### Handling Multi-File Operations
- **ReadManyFilesTool** preferred over sequential read calls (batches requests to Gemini API)
- **EditTool with expected_replacements** - Set when replacing multiple occurrences in one file
- **Tool locations** for IDE preview - Include operation type: `read`, `write`, `modify`, `create`
- **Diff preview** - Uses `ModifiableDeclarativeTool.getModifyContext()` to open editor for manual edits

### Context & Prompt Construction
- **System prompt** - `getCoreSystemPrompt()` includes dynamic context (working directory, recent files)
- **Directory structure** - `getDirectoryContextString()` provides tree view of project layout
- **Compression prompt** - Special prompt for summarizing chat history while preserving key context
- **Token limits** - Model-specific limits in `tokenLimits.ts`; consider compression when approaching 70%

### Testing Strategies for Complex Features
- **Mock tools:** Create lightweight tool implementations for testing scheduler/executor behavior
- **Compression testing:** Verify split points respect safe boundaries (user messages)
- **Loop detection:** Inject repeated tool calls, verify termination after threshold
- **Fallback scenarios:** Mock `TerminalQuotaError` to test downgrade logic
- **Agent testing:** Use `TestRig` with sandbox=false for fast local E2E validation

## Key Files to Review

| File | Purpose |
|------|---------|
| `packages/core/src/core/client.ts` | Gemini API client wrapper |
| `packages/core/src/tools/tools.ts` | Base tool abstractions + interfaces |
| `packages/core/src/tools/tool-registry.ts` | Tool registration, MCP discovery |
| `packages/core/src/routing/modelRouterService.ts` | Model selection logic |
| `packages/core/src/config/config.ts` | Configuration loading + state |
| `packages/cli/src/gemini.tsx` | Main CLI React component |
| `integration-tests/test-helper.ts` | Test utilities for E2E testing |
| `esbuild.config.js` | Bundle configuration |
| `Makefile` | Common dev tasks shorthand |
| `packages/core/src/services/chatCompressionService.ts` | History compression logic |
| `packages/core/src/agents/executor.ts` | Agent loop & tool calling |
| `packages/core/src/core/turn.ts` | Turn data structures & validation |
| `packages/core/src/utils/googleQuotaErrors.ts` | Quota error classification |

## Code Organization Patterns

### Directory Structure Conventions
- **`src/tools/`** - Each tool is one file: `{toolname}.ts` + `{toolname}.test.ts`
- **`src/core/`** - Core API interaction: `client.ts`, `geminiChat.ts`, `turn.ts`, prompts, compression
- **`src/routing/`** - Model selection: `modelRouterService.ts` + `strategies/` subdirectory
- **`src/services/`** - Shared business logic: file discovery, git, shell execution, loop detection
- **`src/config/`** - Configuration: settings loading, model definitions, defaults
- **`src/utils/`** - Helpers: error classification, environment context, retry logic, text utilities
- **`src/__mocks__/`** - Vitest mocks with hoisting enabled

### Type System Patterns
- **Tool parameters:** Use interfaces extending object, map directly to JSON schema
- **Tool results:** Extend `ToolResult` discriminated union for type safety
- **Turn/Message types:** Use discriminated unions (`role: 'user' | 'model'`, `parts: Part[]`)
- **Error types:** Extend `Error` with contextual properties (code, cause, retryDelayMs)
- **Config types:** Use enums for modes (ApprovalMode, AuthType, TelemetryTarget)
- **Avoid:** Generic `any` types; use `unknown` with type guards instead

### Code Quality Standards
- **License headers:** Apache 2.0 headers on all `.ts` files
- **Exports:** Use `export class`, `export interface` at module level
- **Constants:** UPPER_SNAKE_CASE for module-level constants
- **Private fields:** Use `private readonly` in classes
- **Error handling:** Never swallow errors; log, rethrow, or return structured error result
- **Comments:** Doc comments on public methods/interfaces; inline comments for why, not what

## Release & Deployment

- **Weekly releases:** Preview (Tue 23:59 UTC) → Stable (Tue 20:00 UTC) → Nightly (daily 00:00 UTC)
- **npm tags:** `preview`, `latest` (stable), `nightly`
- **Versioning:** Semver in `package.json` + git tags
- **Build artifacts:** Published to npm registry + Docker images
- **CI/CD:** GitHub Actions for tests, lint, build validation

## Troubleshooting & Common Issues

### Tool Execution Problems
| Issue | Cause | Solution |
|-------|-------|----------|
| Tool not found in registry | Not registered or wrong class name | Check `BaseDeclarativeTool` inheritance; verify in tool-registry.ts auto-discovery |
| User not prompted for edit | `shouldConfirmExecute()` returns false | Return confirmation details for modifiable tools; use messageBus |
| Tool times out | Long-running operation | Use `updateOutput()` callback to send progress; increase timeout in test config |
| MCP tool crashes silently | Server died; stdio broken | Check MCP config in ~/.gemini/config.json; verify server process spawns correctly |
| File operation affects wrong files | Incorrect toolLocations() | Return exact paths that will be modified; relative paths from cwd |

### Testing Failures
| Issue | Cause | Solution |
|-------|-------|----------|
| "Poll timed out" | Tool/API slower than expected | Increase timeout in test, or check for infinite loops with `LoopDetectionService` |
| Mock fs not used in test | Hoisting not enabled | Check vitest config; ensure `vi.mock()` calls are at top level |
| Tool approval prompt hangs | messageBus subscription missing | Verify `shouldConfirmExecute()` properly subscribes to TOOL_CONFIRMATION_RESPONSE |
| E2E test flaky on CI | Sandbox/environment differences | Use `GEMINI_SANDBOX=false` for local testing; check 5-min timeout is sufficient |

### Model Routing Issues
| Issue | Cause | Solution |
|-------|-------|----------|
| Wrong model selected | Routing strategy not applied | Check if bypass conditions met (tool_response, next_speaker_request, forced override) |
| Fallback stuck on | Quota recovery not triggered | Manual: check `config.resetFallback()`; auto: waits for next successful request |
| Flash model returns empty response | Known API behavior on early requests | `ModelRouterService` has bypass for history < 5 (currently commented) |

### Build & Bundle Issues
| Issue | Cause | Solution |
|-------|-------|----------|
| Bundle fails with WASM | Missing wasm plugin | Check esbuild.config.js wasmLoader configuration; ensure .wasm files exist |
| Build outputs empty dist/ | TypeScript errors not surfacing | Run `npm run typecheck` to see errors; check build script output |
| Sandbox image not found | Build step skipped or failed | Run `npm run build:sandbox` explicitly; verify Docker/Podman available |

### Quota & Fallback Edge Cases
| Issue | Cause | Solution |
|-------|-------|----------|
| Daily quota exhausted but no fallback | TerminalQuotaError not detected | Check `classifyGoogleError()` logic; verify error message format matches |
| Fallback loop infinite | Model selection broken | Verify flash model works; check `getEffectiveModel()` preserves lite requests |
| Per-minute quota triggers fallback | Expected; soft limit | Use `RetryableQuotaError` for retry logic; fallback is intended behavior |

### API & Communication
| Issue | Cause | Solution |
|-------|-------|----------|
| History validation fails | Role sequence broken | Must alternate user↔model; always start with user; no consecutive model turns |
| Compression splits mid-turn | Safe split point not found | `findCompressSplitPoint()` only splits at user turn boundaries; check history structure |
| Auth token expired | OAuth refresh failed | Check token storage in `packages/core/src/mcp/token-storage/`; re-auth if needed |

## Debugging Tips

### Enable Debug Logging
```bash
DEBUG=* npm run start
GEMINI_DEV_TRACING=true npm run start
```

### Inspect Tool Calls
```typescript
// In integration tests
const toolLogs = rig.readToolLogs();
console.log(JSON.stringify(toolLogs, null, 2));
```

### Trace Model Routing
- Check `ModelRouterService.route()` return value in logs
- Verify `RoutingContext` has correct history, turnType, forcedModel
- Test strategies independently in unit tests

### Profile Tool Performance
- Use `runInDevTraceSpan()` to wrap tool execution
- View traces in Genkit UI at `http://localhost:4000`
- Check for N+1 tool calls (use `ReadManyFilesTool` for batch reads)

### Validate Configuration
```typescript
// Check config loading
const config = new Config();
console.log(config.getModel()); // Should return resolved model name
console.log(config.isInFallbackMode()); // Check fallback state
```

---

**Last Updated:** Nov 2025  
For additional context, see `/docs/architecture.md`, `/docs/local-development.md`, and `CONTRIBUTING.md`.
