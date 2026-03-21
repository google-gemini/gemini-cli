# LSP Integration Design for Gemini CLI

> Status: Phase 1 in progress (TypeScript working, Python blocked on pyright
> langserver issue) Target issue:
> [#2465](https://github.com/google-gemini/gemini-cli/issues/2465) Related:
> [#6690](https://github.com/google-gemini/gemini-cli/issues/6690)
> (maintainer-only roadmap item — IDE-connected LSP) Prior art:
> [PR #15149](https://github.com/google-gemini/gemini-cli/pulls/15149) (shelved
> maintainer WIP — diagnostics-only MVP)

## Motivation

When the agent reads, writes, or refactors code, it operates on raw text. It has
no access to the compiler's understanding of the codebase — resolved types,
symbol references, diagnostics, or structural information. This leads to:

- **Redundant file reads.** The agent greps for symbol definitions, reads the
  result, greps for usages, reads those too. An LSP `references` query returns
  all call sites in one shot.
- **Imprecise refactoring.** `grep_search` matches strings in comments,
  documentation, and unrelated identifiers. `find_references` is semantically
  precise.
- **Avoidable errors.** The agent writes code that doesn't type-check, then
  discovers this only after running the build. Inline diagnostics on write would
  catch this immediately.
- **Missed context.** The agent can't see resolved types, inferred generics, or
  interface implementations without reading additional files. LSP hover and
  go-to-definition provide this instantly.

Claude Code and opencode both ship LSP integration. Users are building
workarounds (Serena MCP server, Neovim LSP bridges). This is the most-upvoted
open feature request (112 thumbs-up on #2465).

## Design principles

1. **Implicit first.** The agent should get LSP-powered feedback automatically
   when it reads or writes files, without needing to know LSP exists. This is
   the highest-value, lowest-friction integration.
2. **Explicit tools second.** For complex tasks like refactoring, the agent can
   opt in to semantic queries (references, definitions, symbols). These are
   exposed as a single tool to minimize tool-list bloat.
3. **Graceful degradation.** If no language server is available for a file type,
   or if the server crashes, everything falls back to current behavior silently.
   LSP is supplementary — it never blocks or fails a tool operation.
4. **Shareable core.** The LSP module lives in `packages/core` and is agnostic
   to whether the CLI is running standalone or inside an IDE. A future IDE
   companion integration can provide an alternative LSP backend without changing
   the tool surface.
5. **Feature-gated.** All LSP functionality is behind a setting (`lsp.enabled`),
   disabled by default initially, with no impact on users who don't opt in.

## UX design: user journeys and debuggability

LSP integration is fundamentally different from built-in tools. It depends on
external software the user installs separately, that may or may not be on PATH,
that may be the wrong version, and that communicates via a protocol where
failures are often silent. The UX must account for every failure mode.

### User journey 1: Discovery and setup

**Goal:** User learns LSP exists, enables it, and gets it working.

1. **Discovery.** When the agent writes code that could benefit from LSP
   feedback but LSP is disabled, the system prompt can mention it. Or the user
   discovers it via `/help`, `/tools`, or documentation. No nudge dialog (unlike
   IDE integration) — LSP is opt-in for power users.

2. **Enablement.** User enables LSP:

   ```
   /lsp enable
   ```

   This sets `tools.lsp.enabled: true` in user settings and prints what happens
   next: which language servers will be used, whether they're found on PATH.

3. **Validation.** Immediately after enabling, `/lsp enable` runs a health
   check:

   ```
   LSP enabled. Checking language servers...

   🟢 typescript-language-server (v5.1.3) — found on PATH
   🔴 pyright-langserver — not found on PATH
      Install: pip install pyright  or  npm install -g pyright

   TypeScript/JavaScript files will get compiler feedback on writes.
   Python files will not (no server available).
   ```

   This is the critical moment — the user immediately knows what works and what
   doesn't, with actionable install instructions.

### User journey 2: Normal operation

**Goal:** LSP works invisibly. User sees compiler feedback on writes.

1. Agent calls `write_file` or `edit` on a `.ts` file.
2. LSP diagnostics are appended to `llmContent` in `<lsp_diagnostics>` tags.
3. The user sees nothing different in the UI — the agent just happens to
   self-correct type errors without being asked.
4. If the server crashes mid-session, the next write silently falls back to
   no-LSP behavior. The user is not interrupted.

### User journey 3: Something is wrong

**Goal:** User suspects LSP isn't working and wants to diagnose it.

1. User runs `/lsp status`:

   ```
   LSP Integration Status

   Servers:
   🟢 typescript (pid 12345) — c:\project (2 files tracked, 4 diagnostics cached)
      Last activity: 3s ago
   🔴 pyright — failed to start
      Error: spawn pyright-langserver ENOENT
      Fix: Install pyright (pip install pyright) and ensure it's on PATH

   Settings:
     enabled: true
     diagnosticSeverity: error
     diagnosticTimeout: 2000ms
   ```

2. If the agent is available, the user can ask: "LSP doesn't seem to be working
   for my Python files, can you help?" The agent can call `/lsp status` (or the
   underlying `lsp_query` tool with `operation: "diagnostics"`) and reason about
   the output. This is the "agent helps debug" path.

### User journey 4: Server configuration override

**Goal:** User wants a different server (e.g., `pylsp` instead of `pyright`).

1. User runs `/lsp servers` to see available server definitions:

   ```
   Configured language servers:

   typescript:
     command: typescript-language-server --stdio
     languages: typescript, typescriptreact, javascript, javascriptreact
     root markers: tsconfig.json, jsconfig.json, package.json

   pyright:
     command: pyright-langserver --stdio
     languages: python
     root markers: pyproject.toml, setup.py, pyrightconfig.json
   ```

2. User overrides in settings:

   ```json
   { "tools": { "lsp": { "servers": { "python": { "command": "pylsp" } } } } }
   ```

3. After restart, `/lsp status` shows the override in effect.

### The `/lsp` command

Subcommands:

| Command        | Description                                                   |
| -------------- | ------------------------------------------------------------- |
| `/lsp`         | Alias for `/lsp status`                                       |
| `/lsp status`  | Show server health, tracked files, cached diagnostics, errors |
| `/lsp enable`  | Enable LSP + run health check                                 |
| `/lsp disable` | Disable LSP + shut down servers                               |
| `/lsp servers` | Show configured server definitions and detected binaries      |
| `/lsp restart` | Shut down all servers and let them respawn on next use        |

### Status tracking in LspManager

The manager tracks per-server state visible to the UI:

```typescript
interface LspServerStatus {
  id: string; // e.g. 'typescript'
  state: 'running' | 'starting' | 'stopped' | 'failed';
  pid?: number; // OS process ID when running
  projectRoot?: string; // Resolved project root
  error?: string; // Why it failed (ENOENT, crash, etc.)
  filesTracked: number; // Open documents in server
  diagnosticsCached: number; // Diagnostics in cache
  lastActivity?: number; // Timestamp of last query
  serverVersion?: string; // From InitializeResult.serverInfo
  command: string; // What was spawned
}
```

### Error messages — specific and actionable

Every error state has a message that tells the user what went wrong and how to
fix it:

| Error                        | Message                                                                                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Server binary not found      | `pyright-langserver not found on PATH. Install: pip install pyright`                                                                            |
| Server crashed on startup    | `typescript-language-server exited with code 1. Check that TypeScript is installed in your project (npm install typescript).`                   |
| Server timed out during init | `pyright-langserver did not respond within 10s. It may be incompatible with this project. Try /lsp restart.`                                    |
| No project root found        | `No tsconfig.json, jsconfig.json, or package.json found. The TypeScript server needs a project root.`                                           |
| Server crashed mid-session   | `typescript-language-server crashed (signal SIGSEGV). It will not be restarted for this session. Diagnostics unavailable for TypeScript files.` |
| Max servers reached          | `Maximum language servers (4) already running. Increase tools.lsp.maxServers in settings to allow more.`                                        |

### Agent-assisted debugging

When the agent has access to the `lsp_query` tool (Phase 3), it can diagnose LSP
issues itself:

- "My TypeScript file has errors but the agent didn't catch them" → Agent runs
  `lsp_query diagnostics` and sees an empty result → checks `/lsp status` → sees
  server is in `failed` state → suggests a fix.
- "Why is the agent slow when editing files?" → Agent checks `/lsp status` →
  sees diagnostic timeout is high → suggests reducing it.

Even before Phase 3, the agent sees `<lsp_diagnostics>` blocks (or their
absence) in tool output. If it writes a file and gets no diagnostics back, it
knows LSP isn't working for that file type and can tell the user.

### Binary detection at startup

When LSP is enabled, during the first access to a language, the manager checks
whether the server binary exists before trying to spawn it:

```typescript
async function findExecutable(command: string): Promise<string | null> {
  // 1. Check if it's an absolute path that exists
  // 2. Check PATH using `which` (Unix) or `where` (Windows)
  // 3. Check common locations:
  //    - node_modules/.bin/ (for typescript-language-server)
  //    - Python venv bin/ (for pyright)
  // Return null if not found, with a specific reason
}
```

This avoids the confusing `ENOENT` error from `spawn()` and instead produces a
helpful "not found, install with X" message.

## Architecture overview

```
packages/core/src/lsp/
  ├── types.ts              # LSP protocol types and internal interfaces
  ├── client.ts             # JSON-RPC client over stdio (speaks LSP)
  ├── server-registry.ts    # Server definitions per language
  ├── manager.ts            # LspManager singleton — lifecycle, caching, queries
  ├── enrichment.ts         # Helpers for formatting LSP data into tool output
  └── index.ts              # Public API surface

packages/core/src/tools/
  └── lsp-query.ts          # The lsp_query tool (explicit semantic queries)

packages/core/src/tools/definitions/
  └── (update coreTools.ts) # Register lsp_query tool definition
```

### Data flow

```
                      ┌─────────────────────────────────────┐
                      │           LspManager                │
                      │  (singleton, lazy server spawning)  │
                      │                                     │
                      │  ┌───────────┐  ┌───────────────┐  │
                      │  │ LspClient │  │ ServerRegistry │  │
                      │  │ (jsonrpc) │  │ (ts, py, go…) │  │
                      │  └─────┬─────┘  └───────┬───────┘  │
                      │        │                │           │
                      │        ▼                ▼           │
                      │  spawn server ◄── find server def   │
                      │  for language     for file ext      │
                      └────────┬──────────────────┬─────────┘
                               │                  │
              ┌────────────────┼──────────────────┼────────────────┐
              │                │                  │                │
              ▼                ▼                  ▼                ▼
        ┌──────────┐   ┌──────────┐       ┌──────────┐    ┌────────────┐
        │read_file │   │write_file│       │  edit    │    │ lsp_query  │
        │(implicit)│   │(implicit)│       │(implicit)│    │ (explicit) │
        └──────────┘   └──────────┘       └──────────┘    └────────────┘

  Implicit enrichment:              Explicit tool:
  - diagnostics on write/edit       - references, definitions
  - symbol summary on read          - hover, workspace symbols
  - fires automatically             - agent chooses to call
```

## Phase 1: Implicit enrichment on writes

This matches the scope of the shelved PR #15149 but fixes its known issues.

### What happens

When `write_file` or `edit` (replace) completes successfully on a file whose
language has an available server, the LSP manager is asked for diagnostics. If
any are returned, they are appended to `llmContent` in a structured block.

### Integration point

Inside the `execute()` method of `WriteFileTool` and `EditTool`, after the file
is written to disk, before returning `ToolResult`:

```typescript
// After file write succeeds:
const lspDiagnostics = await collectDiagnosticsForOutput(
  config,
  resolvedPath,
  newContent,
  signal,
);
if (lspDiagnostics) {
  llmContent = appendLspContext(llmContent, lspDiagnostics);
}
```

This mirrors the existing JIT context pattern (`discoverJitContext` /
`appendJitContext` in `jit-context.ts`) — supplementary content appended to
`llmContent` that never fails the primary operation.

### Output format

```xml
<lsp_diagnostics file="src/services/userService.ts">
Compiler feedback for the file you just modified:

ERROR line 42: Property 'findById' does not exist on type 'Repository<User>'.
ERROR line 58: Argument of type 'string' is not assignable to parameter of type 'number'.
WARN  line 12: 'import { Logger }' is declared but its value is never read.
</lsp_diagnostics>
```

Design choices:

- **XML tags** for clean parsing by the model (consistent with prior art in the
  shelved PR).
- **Severity filtering**: Errors always shown. Warnings shown on `write_file`
  (full-file context), errors-only on `edit` (partial context, warnings may be
  pre-existing noise). Configurable via `lsp.diagnosticSeverity`.
- **Compact format**: One line per diagnostic. No stack traces. File path in the
  tag attribute, not repeated per line.
- **Truncation**: Cap at 20 diagnostics per file to avoid flooding context. Show
  count of omitted diagnostics if truncated.

### Improvements over shelved PR #15149

| Issue in #15149                                                      | Fix                                                                                                                  |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 3-second synchronous polling blocks tool return                      | Async with configurable timeout (default 2s). Return without diagnostics if timeout expires — don't block the agent. |
| Dangling `setTimeout` on successful init (bot-reported)              | Proper cleanup with `finally { clearTimeout(handle) }`                                                               |
| Off-by-one in `findNearestFile` skips filesystem root (bot-reported) | Restructure to `while(true)` with explicit break                                                                     |
| No cross-platform validation                                         | Windows-aware path handling; test on all three platforms                                                             |
| `npx typescript-language-server` spawn is fragile                    | Direct `node_modules/.bin` resolution first, `npx` fallback. Configurable server command via settings.               |

### Settings

```toml
# In settings.json or settings.toml:
[lsp]
enabled = true              # Master switch (default: false)
diagnosticSeverity = "error" # "error" | "warning" | "info" | "hint" (default: "error")
diagnosticTimeout = 2000     # ms to wait for diagnostics before giving up (default: 2000)
```

Settings schema entry (matches existing patterns in `settingsSchema.ts`):

```typescript
lsp: {
  type: 'object',
  label: 'Language Server Protocol',
  category: 'Tools',
  requiresRestart: true,
  default: { enabled: false },
  description: 'Language Server Protocol integration for compiler feedback and semantic code queries.',
  showInDialog: true,
  properties: {
    enabled: {
      type: 'boolean',
      label: 'Enable LSP',
      category: 'Tools',
      requiresRestart: true,
      default: false,
      description: 'Enable Language Server Protocol integration for compiler diagnostics and semantic queries.',
      showInDialog: true,
    },
    diagnosticSeverity: {
      type: 'enum',
      label: 'Diagnostic severity',
      category: 'Tools',
      requiresRestart: false,
      default: 'error',
      description: 'Minimum severity level for diagnostics included in tool output.',
      showInDialog: true,
      options: ['error', 'warning', 'info', 'hint'],
    },
    diagnosticTimeout: {
      type: 'number',
      label: 'Diagnostic timeout (ms)',
      category: 'Tools',
      requiresRestart: false,
      default: 2000,
      description: 'Maximum time to wait for LSP diagnostics before returning without them.',
      showInDialog: false,
    },
  },
}
```

## Phase 2: Implicit enrichment on reads

### What happens

When `read_file` returns content for a file with an active language server, the
result is enriched with a lightweight symbol summary — the exported/top-level
symbols, their kinds, and condensed type signatures. This helps the agent
understand file structure without reading the entire file or grepping for
definitions.

### Integration point

Same pattern as Phase 1, inside `ReadFileTool.execute()`:

```typescript
const lspSummary = await collectSymbolSummary(config, resolvedPath, signal);
if (lspSummary) {
  llmContent = appendLspContext(llmContent, lspSummary);
}
```

### Output format

```xml
<lsp_symbols file="src/services/userService.ts">
Symbol index for this file:

class  UserService (line 15)
  method  constructor(repo: UserRepository, logger: Logger)
  method  findUser(id: number): Promise<User | null>
  method  createUser(data: CreateUserInput): Promise<User>
  method  deleteUser(id: number): Promise<void>

interface CreateUserInput (line 52)
  property name: string
  property email: string
  property role?: UserRole

type UserRole = "admin" | "member" | "viewer" (line 60)
</lsp_symbols>
```

Design choices:

- **Document symbols** (not workspace symbols) — scoped to the file being read.
- **Top-level + one nesting level**: Classes show their methods and properties.
  Deeply nested symbols are omitted.
- **Condensed signatures**: Parameter names and types, return types. No full
  JSDoc or implementation details.
- **Only on supported languages**: Files without an active server get no
  enrichment (no change from current behavior).

### Diagnostics on read (optional)

If the file has existing diagnostics (errors/warnings), these are also appended:

```xml
<lsp_diagnostics file="src/services/userService.ts">
Pre-existing issues in this file:

ERROR line 42: Property 'findById' does not exist on type 'Repository<User>'.
</lsp_diagnostics>
```

This is gated behind a sub-setting (`lsp.diagnosticsOnRead`, default: `true`).
The agent sees what's broken before it starts editing, reducing wasted attempts.

### Token budget considerations

Symbol summaries add tokens to every `read_file` result. Mitigation:

- Cap at ~50 symbols per file. For larger files, show only exported symbols.
- Omit symbols for trivial files (< 20 lines) — the file content is small enough
  that the agent can parse it directly.
- Add a setting `lsp.symbolSummary` (`true`/`false`, default `true`) for users
  who want diagnostics but not symbol summaries.

## Phase 3: Explicit semantic tool — `lsp_query`

### What happens

A new tool `lsp_query` is registered, giving the agent direct access to LSP
operations. The agent calls this when it needs semantic information beyond what
implicit enrichment provides.

### Tool definition

Single tool, operation-based parameter (matching gemini-cli's convention of
fewer, more capable tools — cf. `run_shell_command`):

```typescript
const LSP_QUERY_TOOL_NAME = 'lsp_query';

// FunctionDeclaration for the model:
{
  name: 'lsp_query',
  description: `Query the Language Server for semantic code information. Use this for precise code navigation and refactoring instead of grep-based searching.

Available operations:
- "diagnostics": Get compiler errors and warnings for a file.
- "hover": Get type information and documentation at a specific position.
- "definition": Go to the definition of the symbol at a specific position.
- "references": Find all references to the symbol at a specific position.
- "document_symbols": Get the symbol tree (functions, classes, variables) for a file.
- "workspace_symbols": Search for symbols by name across the entire workspace.`,
  parameters: {
    type: 'object',
    required: ['operation', 'file_path'],
    properties: {
      operation: {
        type: 'string',
        enum: [
          'diagnostics',
          'hover',
          'definition',
          'references',
          'document_symbols',
          'workspace_symbols',
        ],
        description: 'The LSP operation to perform.',
      },
      file_path: {
        type: 'string',
        description: 'Absolute path to the file.',
      },
      line: {
        type: 'number',
        description: 'Line number (1-based). Required for hover, definition, references.',
      },
      character: {
        type: 'number',
        description: 'Character offset (1-based). Required for hover, definition, references.',
      },
      query: {
        type: 'string',
        description: 'Search query. Required for workspace_symbols.',
      },
    },
  },
}
```

### Policy

`lsp_query` is **read-only** — it never modifies files. It should be
auto-allowed by default policy, same as `read_file`, `glob`, and `grep_search`.

```toml
# Default policy (ships with CLI):
[[rule]]
toolName = "lsp_query"
decision = "allow"
priority = 0
```

Tool annotations: `{ readOnlyHint: true }`.

### Output format examples

**references:**

```
Found 7 references to 'UserService.findUser':

src/routes/userRoutes.ts:23:15  const user = await userService.findUser(id);
src/routes/userRoutes.ts:45:19  if (await userService.findUser(email)) {
src/middleware/auth.ts:67:22    const currentUser = await this.users.findUser(req.userId);
src/services/userService.test.ts:12:5  await service.findUser(1);
src/services/userService.test.ts:28:5  await service.findUser(999);
src/services/userService.test.ts:44:5  const result = await service.findUser(testId);
src/services/adminService.ts:31:18     const user = await this.userService.findUser(userId);
```

**hover:**

```
(method) UserService.findUser(id: number): Promise<User | null>

Finds a user by their numeric ID. Returns null if not found.

Defined in: src/services/userService.ts:28
```

**definition:**

```
Symbol 'findUser' is defined at:

src/services/userService.ts:28:3

  async findUser(id: number): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }
```

### System prompt addition

The tool description above is sufficient for the model to understand when to use
`lsp_query`. No system prompt modification is needed beyond what the tool
registry provides automatically. However, we should update the bundled
documentation (`bundle/docs/tools/`) with a `lsp-query.md` reference page.

## Phase 4: Diagnostic diff on writes

### What happens

After a write or edit, instead of just showing the current diagnostics, we show
the **change** in diagnostic state — what was introduced and what was fixed.
This gives the agent a clear signal about whether its edit moved in the right
direction.

### Implementation

The `LspManager` maintains a diagnostic cache per file. On write:

1. Snapshot pre-write diagnostics from cache.
2. Notify the LSP server of the file change (`textDocument/didChange`).
3. Collect post-write diagnostics.
4. Diff the two sets.

### Output format

```xml
<lsp_diagnostics file="src/services/userService.ts" introduced="1" fixed="2">
Diagnostic changes from your edit:

FIXED   line 42: Property 'findById' does not exist on type 'Repository<User>'.
FIXED   line 58: Argument of type 'string' is not assignable to parameter of type 'number'.
NEW     line 35: Parameter 'id' implicitly has an 'any' type.
</lsp_diagnostics>
```

The `introduced`/`fixed` counts in the tag attributes give the model an instant
pass/fail signal before it even reads the details.

## Phase 5: Multi-language server support

### Server registry

Phase 1 ships with TypeScript/JavaScript only (via `typescript-language-server`
or `ts_ls`). The server registry is designed for extension:

```typescript
interface LspServerDefinition {
  /** LSP language IDs this server handles. */
  languageIds: string[];

  /** How to find/spawn the server binary. */
  command: string;
  args: string[];

  /**
   * Strategy for finding the project root.
   * 'marker' walks up looking for marker files.
   */
  rootStrategy: 'marker';
  rootMarkers: string[];

  /** Initialization options passed to the server. */
  initializationOptions?: Record<string, unknown>;
}

const BUILTIN_SERVERS: LspServerDefinition[] = [
  {
    languageIds: [
      'typescript',
      'typescriptreact',
      'javascript',
      'javascriptreact',
    ],
    command: 'typescript-language-server',
    args: ['--stdio'],
    rootStrategy: 'marker',
    rootMarkers: ['tsconfig.json', 'jsconfig.json', 'package.json'],
  },
  {
    languageIds: ['python'],
    command: 'pyright-langserver',
    args: ['--stdio'],
    rootStrategy: 'marker',
    rootMarkers: ['pyproject.toml', 'setup.py', 'pyrightconfig.json'],
  },
  {
    languageIds: ['go'],
    command: 'gopls',
    args: ['serve'],
    rootStrategy: 'marker',
    rootMarkers: ['go.mod'],
  },
  {
    languageIds: ['rust'],
    command: 'rust-analyzer',
    args: [],
    rootStrategy: 'marker',
    rootMarkers: ['Cargo.toml'],
  },
];
```

### User-configurable servers

Users can override or add servers via settings:

```toml
[lsp.servers.typescript]
command = "typescript-language-server"
args = ["--stdio"]

[lsp.servers.python]
command = "pylsp"
args = []
```

This allows users to substitute their preferred server (e.g., `pylsp` instead of
`pyright`, or a custom wrapper) without modifying core code.

## LspManager — lifecycle and caching

### Singleton with lazy spawning

```typescript
class LspManager {
  private clients: Map<string, LspClient>; // key: `${serverId}:${projectRoot}`
  private brokenServers: Set<string>; // servers that crashed, don't retry
  private diagnosticCache: Map<string, Diagnostic[]>; // per-file cache
  private touchedFiles: Map<string, number>; // file URI → version counter

  /** Get or create a client for the given file. */
  async getClient(
    filePath: string,
    signal: AbortSignal,
  ): Promise<LspClient | null>;

  /** Notify server of file content (for read tracking). */
  async touchFile(filePath: string, content?: string): Promise<void>;

  /** Get diagnostics, waiting up to timeout. */
  async getDiagnostics(
    filePath: string,
    signal: AbortSignal,
  ): Promise<Diagnostic[]>;

  /** Get hover info at position. */
  async getHover(
    filePath: string,
    line: number,
    character: number,
    signal: AbortSignal,
  ): Promise<HoverResult | null>;

  /** Get definition location(s). */
  async getDefinition(
    filePath: string,
    line: number,
    character: number,
    signal: AbortSignal,
  ): Promise<Location[]>;

  /** Get all references to symbol at position. */
  async getReferences(
    filePath: string,
    line: number,
    character: number,
    signal: AbortSignal,
  ): Promise<Location[]>;

  /** Get document symbol tree. */
  async getDocumentSymbols(
    filePath: string,
    signal: AbortSignal,
  ): Promise<DocumentSymbol[]>;

  /** Search workspace symbols by query. */
  async getWorkspaceSymbols(
    query: string,
    signal: AbortSignal,
  ): Promise<SymbolInformation[]>;

  /** Shut down all active servers. */
  async shutdown(): Promise<void>;
}
```

### Key lifecycle rules

- **Lazy**: Servers are spawned on first access to a file of that language. No
  server process is started until LSP is actually needed.
- **Cached**: One client per `(serverId, projectRoot)` pair. Reused across all
  files in the same project for that language.
- **Resilient**: If a server crashes or fails to initialize, it's added to
  `brokenServers` and not retried for the session. The feature silently
  degrades.
- **Bounded**: Track at most 1000 touched files. Evict LRU when the cap is
  reached (full-document sync means each touched file holds a version in the
  server's memory).
- **Shutdown**: All clients are shut down via `registerCleanup()` in the CLI
  initialization pipeline, matching the existing cleanup pattern.

### Document synchronization

Use `TextDocumentSyncKind.Full` (send entire file content on each change). This
is simpler than incremental sync and acceptable for our use case — we only sync
files when the agent reads or writes them, not on every keystroke.

## Shareability: standalone vs. IDE-connected

The `LspManager` in `packages/core` is the single integration point for all LSP
consumers. It exposes a uniform API regardless of where the language server
actually runs.

### Current design (Phase 1–5): Standalone

The `LspManager` spawns and manages its own language server processes. This
works in any terminal — no IDE required.

### Future: IDE-connected provider

The `packages/vscode-ide-companion` extension already runs an MCP server. A
future enhancement could expose LSP operations as MCP tools on that server,
delegating to VS Code's built-in language servers (which are already running,
already warmed up, and already have the project indexed).

The integration path:

1. The IDE companion exposes tools like `lsp/diagnostics`, `lsp/hover`, etc. via
   its existing MCP server.
2. The `LspManager` detects that the CLI is running in IDE mode
   (`config.getIdeMode()`).
3. Instead of spawning servers, it delegates queries to the IDE companion's MCP
   tools via the existing `IdeClient`.
4. The tool surface (`lsp_query`) and implicit enrichment remain identical — the
   agent doesn't know or care where the LSP data comes from.

This requires no changes to `packages/core` beyond an `LspProvider` interface:

```typescript
interface LspProvider {
  getDiagnostics(filePath: string, signal: AbortSignal): Promise<Diagnostic[]>;
  getHover(
    filePath: string,
    line: number,
    char: number,
    signal: AbortSignal,
  ): Promise<HoverResult | null>;
  getDefinition(
    filePath: string,
    line: number,
    char: number,
    signal: AbortSignal,
  ): Promise<Location[]>;
  getReferences(
    filePath: string,
    line: number,
    char: number,
    signal: AbortSignal,
  ): Promise<Location[]>;
  getDocumentSymbols(
    filePath: string,
    signal: AbortSignal,
  ): Promise<DocumentSymbol[]>;
  getWorkspaceSymbols(
    query: string,
    signal: AbortSignal,
  ): Promise<SymbolInformation[]>;
  touchFile(filePath: string, content?: string): Promise<void>;
  shutdown(): Promise<void>;
}

// Phase 1-5: StandaloneLspProvider (spawns servers via LspClient)
// Future:    IdeLspProvider (delegates to IDE companion MCP tools)
```

## Security considerations

### Sandbox interaction

Language servers execute code (e.g., TypeScript's `tsserver` runs Node.js). In
sandboxed environments:

- **macOS Seatbelt**: Servers spawned by the CLI inherit the sandbox profile.
  They can read workspace files but are restricted by the active profile.
- **Container sandbox**: Servers run inside the container alongside the CLI. No
  additional exposure beyond what the sandbox already permits.
- **Policy engine**: `lsp_query` is read-only and auto-allowed by default
  policy. The tool annotation `readOnlyHint: true` enables policy rules to match
  it.

### Untrusted workspace risk

A malicious workspace could include a `tsconfig.json` or `.pyrightconfig.json`
that configures plugins or paths designed to exfiltrate data. Mitigations:

- Servers are spawned only for files within trusted workspace roots (matching
  existing `trustedFolders` behavior).
- No server-provided code execution (we don't use LSP code actions or
  refactoring commands, only read-only queries).
- Server commands are from a built-in allowlist or explicit user configuration —
  never derived from workspace files.

### Resource limits

- Maximum 4 concurrent language server processes (configurable via
  `lsp.maxServers`).
- Per-server memory: not directly controllable, but bounded indirectly by the
  1000-file touched-file cap and session lifetime.
- Idle timeout: servers unused for 10 minutes are shut down (configurable via
  `lsp.idleTimeout`).

## Implementation roadmap

| Phase      | Scope                                          | Files touched                                                                             | Dependency                      |
| ---------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------- |
| **1a**     | LSP core + diagnostics on write/edit (TS only) | `lsp/*` (new), `edit.ts`, `write-file.ts`, `settingsSchema.ts`, `config.ts`, `cleanup.ts` | None (no new npm deps)          |
| **1b**     | `/lsp` command + status/health UI              | `lspCommand.ts` (new), `BuiltinCommandLoader.ts`, `manager.ts` (status API)               | Phase 1a                        |
| **1c**     | Binary detection + actionable error messages   | `lsp/server-registry.ts`, `lsp/manager.ts`                                                | Phase 1a                        |
| **2**      | Symbol summary on read, diagnostics on read    | `read-file.ts`                                                                            | Phase 1a                        |
| **3**      | `lsp_query` tool (all 6 operations)            | `lsp-query.ts` (new), `coreTools.ts`, `tool-names.ts`, default policy                     | Phase 1a                        |
| **4**      | Diagnostic diffs (introduced/fixed counts)     | `lsp/enrichment.ts`, `edit.ts`, `write-file.ts`                                           | Phase 1a                        |
| **5**      | Multi-language servers (Python, Go, Rust)      | `lsp/server-registry.ts`                                                                  | Phase 1a + server testing       |
| **Future** | IDE-connected `LspProvider` via MCP companion  | `lsp/manager.ts`, `ide-client.ts`, `vscode-ide-companion`                                 | Phase 3 + IDE companion changes |

### PR strategy (if contributing upstream)

Each phase is a self-contained PR. Phase 1 is the minimum viable contribution.
Phases 2–5 build incrementally and can be reviewed independently. This follows
the project's preference for small, focused PRs linked to a single issue.

Phase 1 alone provides meaningful value (the agent self-corrects type errors on
writes) and matches the scope the maintainers already prototyped in PR #15149,
making it the most likely to be accepted.

## Dependencies

**No new npm dependencies.** The LSP JSON-RPC client is implemented directly
using Node.js `child_process` and manual Content-Length framing (~450 lines).
The shelved PR #15149 used `vscode-jsonrpc` and `vscode-languageserver-types`
(+146 kB), but those are unnecessary — LSP's wire protocol is simple enough to
implement inline, and we define only the subset of types we need.

## Known issues

### Pyright langserver on Windows

Pyright's language server mode (`pyright-langserver --stdio`) does not publish
`textDocument/publishDiagnostics` notifications on Windows, despite the CLI
`pyright` working correctly on the same files. Tested with v1.1.390 and
v1.1.408, multiple spawn strategies, workspace/configuration responses, and
didChangeConfiguration triggers. The server finds source files but never
completes analysis.

This is likely a Windows-specific or typeshed-loading issue. Needs testing on
Linux/macOS. The opencode project has reported similar pyright issues
([anomalyco/opencode#6131](https://github.com/anomalyco/opencode/issues/6131)).

**Workaround:** TypeScript/JavaScript LSP works perfectly. Python users can
check `/lsp status` and will see a clear error message with install
instructions.

## Open questions

1. **Token budget governance.** Should there be a hard cap on total LSP tokens
   per tool result? The JIT context system doesn't have one, but LSP output
   could be significantly larger for files with many symbols or diagnostics.

2. **Warm-up latency.** The first LSP query for a project requires server
   initialization (can take 5–15 seconds for large TypeScript projects). Should
   we pre-warm the server on session start for the workspace's primary language?
   Or accept the cold-start penalty on first use? The `/lsp enable` health check
   partially addresses this — it spawns the server as a side effect.

3. **`read_many_files` for reference results.** When `lsp_query references`
   returns locations, should it automatically include the surrounding code
   context (like `grep_search` does with `--context`)? Or return just locations
   and let the agent `read_file` the ones it needs?

4. **Server auto-detection vs. manual config.** Should the CLI attempt to detect
   installed language servers at startup (scanning PATH), or only try to spawn
   them on first use? Early detection enables better `/lsp status` output but
   adds startup cost.

5. **Pyright alternatives.** If pyright langserver remains broken on Windows,
   should we support `pylsp` (python-lsp-server) as an alternative? It's a
   different architecture (plugin-based) but more widely tested as a standalone
   server.

6. **Telemetry.** The existing codebase instruments most features with
   OpenTelemetry events. LSP would benefit from similar instrumentation
   (`lsp_server_started`, `lsp_server_failed`, `lsp_diagnostics_collected`,
   `lsp_diagnostics_timeout`) to help understand which servers work well in
   practice and where users hit problems. Worth discussing with maintainers if
   contributing upstream.
