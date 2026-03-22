# LSP Integration Design for Gemini CLI

> **Status:** Phases 1–3 implemented and tested. Phases 4–5 remaining.
>
> **Target issue:**
> [#2465](https://github.com/google-gemini/gemini-cli/issues/2465) (112+
> thumbs-up)
>
> **Related:** [#6690](https://github.com/google-gemini/gemini-cli/issues/6690)
> (maintainer-only — IDE-connected LSP)
>
> **Prior art:**
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
  discovers this only after running the build. Inline diagnostics on write catch
  this immediately.
- **Missed context.** The agent can't see resolved types, inferred generics, or
  interface implementations without reading additional files. LSP hover and
  go-to-definition provide this instantly.

Claude Code and opencode both ship LSP integration. Users are building
workarounds (Serena MCP server, Neovim LSP bridges).

## LSP protocol reference for agentic tools

This section summarizes how LSP works from a client's perspective, focused on
the subset relevant to an agentic coding tool rather than an interactive IDE.
Sources:
[LSP 3.18 specification](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.18/specification/),
VS Code's `vscode-languageclient` source, and observed behavior of
`typescript-language-server` and `pyright-langserver`.

### Lifecycle

1. **`initialize` request.** Client sends `processId`, `rootUri`,
   `workspaceFolders`, and `capabilities`. Server responds with its
   capabilities. Nothing else can happen until this completes.

2. **`initialized` notification.** Client tells the server it's ready. After
   this, the server may send requests back to the client
   (`workspace/configuration`, `client/registerCapability`, etc.) that **must be
   answered** or the server will deadlock.

3. **`workspace/didChangeConfiguration` notification.** Some servers (notably
   pyright) require this to trigger workspace initialization. Send it
   immediately after `initialized`, even with `{ settings: {} }`. See
   [pyright#6874](https://github.com/microsoft/pyright/issues/6874).

4. **Normal operation.** Open/change/close documents, make queries.

5. **`shutdown` request + `exit` notification.** Graceful teardown.

### How servers discover files

Servers **scan the filesystem themselves** using `rootUri`/`workspaceFolders`
from initialize. They do not rely on the client to enumerate files:

- **TypeScript:** Walks up from files looking for `tsconfig.json`. Loads all
  files referenced by the config plus transitive imports. Reads directly from
  disk — no `didOpen` needed.
- **Pyright:** Loads files referenced by `pyrightconfig.json` plus transitive
  imports. Has `diagnosticMode: "openFilesOnly"` vs `"workspace"` setting.

The client only needs to send `textDocument/didOpen` for files it wants to
explicitly manage (provide in-memory content that supersedes disk).

### Document synchronization

- **`textDocument/didOpen`:** Transfers ownership from disk to client. Server
  uses client-provided content, not the file on disk.
- **`textDocument/didChange`:** Sends content updates. We use full sync (send
  entire content) — simpler and universally supported.
- **`textDocument/didSave`:** Notification that the file was saved. Some servers
  use it as a trigger for heavier analysis.
- **`textDocument/didClose`:** Returns ownership to disk.

**Key insight:** If you write to disk but only sent `didOpen` previously, the
server still uses the stale in-memory content. Send `didChange` for every
modification, OR `didClose` + `didOpen` to re-sync.

### File watching (`workspace/didChangeWatchedFiles`)

Servers register glob patterns via `client/registerCapability`. The client sends
`workspace/didChangeWatchedFiles` when matching files are created, changed, or
deleted. Important for files the agent creates or deletes that haven't been
opened via `didOpen`. TypeScript 5.0+ delegates all file watching to the client.

### Diagnostics: push vs pull

**Push model (`textDocument/publishDiagnostics`):** Server sends diagnostics
whenever it wants. The client has **no way to know when the server is "done"**.
Used by `typescript-language-server` and `pyright-langserver`.

**Pull model (`textDocument/diagnostic`):** Added in LSP 3.17. Proper
request/response — ideal for agentic tools. **Not supported by TypeScript or
Pyright yet.** Only some Microsoft HTML/CSS/JSON servers implement it.

We use the push model with an adaptive timeout (see below).

### Semantic queries (all request/response)

- `textDocument/hover` — type info and documentation at a position
- `textDocument/definition` — jump to definition
- `textDocument/references` — find all references (includes declaration)
- `textDocument/documentSymbol` — symbol tree for a file
- `workspace/symbol` — search symbols by name across the workspace

These work on any file the server knows about via project config + imports.

### Server-initiated requests we must handle

Blocking JSON-RPC requests — if unanswered, the server deadlocks:

- **`workspace/configuration`:** Return array with one result per item.
- **`client/registerCapability`:** Acknowledge with `null`.
- **`window/workDoneProgress/create`:** Acknowledge with `null`.
- **`workspace/workspaceFolders`:** Return the workspace folders.

### Fundamental tension with agentic tools

LSP is designed for an interactive IDE where the user edits one file at a time
and diagnostics trickle in asynchronously. An agentic tool writes files in
bursts and needs immediate feedback. The push diagnostic model is the biggest
mismatch — our adaptive timeout is the best available workaround.

## Design principles

1. **Implicit first.** The agent gets LSP-powered feedback automatically on
   reads and writes, without needing to know LSP exists.
2. **Explicit tools second.** For refactoring, the agent can opt in to semantic
   queries via a single `lsp_query` tool.
3. **Graceful degradation.** Missing servers, crashes, and timeouts all fall
   back silently to current behavior. LSP never blocks a tool.
4. **Shareable core.** The LSP module lives in `packages/core`, agnostic to
   standalone vs IDE mode.
5. **Feature-gated.** Behind `tools.lsp.enabled`, disabled by default.

## What we built

### Architecture

```
packages/core/src/lsp/
  types.ts              LSP protocol types (minimal subset, no npm deps)
  client.ts             JSON-RPC client over stdio with typed events
  server-registry.ts    Built-in server definitions (TS, Python)
  manager.ts            LspManager — per-server state, adaptive timeouts
  enrichment.ts         Diagnostic/symbol formatting, tool enrichment
  index.ts              Public API

packages/core/src/tools/
  lsp-query.ts          The lsp_query tool (6 semantic operations)

packages/cli/src/ui/commands/
  lspCommand.ts         /lsp slash command (status, restart)
```

### Per-server state model

All state for a `(serverId, projectRoot)` pair is bundled in `ServerState`:

```typescript
interface ServerState {
  client: LspClient | null;
  broken: boolean;
  error?: string;
  starting?: Promise<LspClient | null>;
  diagnosticCache: Map<string, Diagnostic[]>;
  fileVersions: Map<string, number>;
  timeout: number;
}
```

Servers are keyed by the gemini-cli workspace directory (from
`WorkspaceContext`), falling back to marker-based root detection for files
outside any workspace. When workspace directories change (e.g., user adds a
directory via `/directory`), all servers restart to reinitialize.

### Adaptive timeout

The push diagnostic model has no "done" signal, so we wait with a timeout that
adapts per server:

- **Cold start:** `diagnosticTimeout × 3` (default: 15s). Pyright can take 10+
  seconds to load typeshed on first use.
- **On timeout:** Halve the timeout for next attempt, floor at 1s. If the server
  is consistently slow, we stop blocking for long.
- **On success:** Reset to `diagnosticTimeout` (default: 5s). Server is warm and
  should respond quickly.

Each server instance has its own timeout — a slow pyright doesn't drag down a
warm typescript-language-server.

### Three-state diagnostic result

We distinguish between "server said clean" and "server didn't respond":

- `publishDiagnostics` with `diagnostics: []` → **clean** (green footer)
- No response within timeout → **timed out** (yellow footer with message)
- `publishDiagnostics` with errors → **issues found** (red footer)

### Workspace-wide diagnostic caching

A persistent listener on each server captures ALL incoming `publishDiagnostics`
notifications, not just the file we asked about. When the agent edits `utils.ts`
and that breaks `app.ts`, the diagnostic for `app.ts` lands in the cache.
Available via `getAllCachedDiagnostics()`.

### LSP protocol compliance

After every file write, we send:

1. `textDocument/didOpen` or `textDocument/didChange` (in-memory sync)
2. `textDocument/didSave` (triggers heavier analysis in some servers)
3. `workspace/didChangeWatchedFiles` (for servers using client-side watching)

### Settings

```json
{
  "tools": {
    "lsp": {
      "enabled": true,
      "diagnosticTimeout": 5000
    }
  }
}
```

Only two settings. We deliberately removed `diagnosticSeverity` — the agent
benefits from seeing all severities (errors, warnings, hints). No reason to
filter.

### UX: user-facing feedback

**On write/edit:** A color-coded footer below the diff:

- Red: `LSP: 2 errors` / `LSP: 1 error, 3 warnings`
- Yellow:
  `LSP: timed out waiting for diagnostics (server may still be starting)`
- Dimmed green: `LSP: no issues found`

Only shown for file types with an LSP server. JSON, markdown, etc. get no
footer.

The footer uses a structured `DiagnosticSummary { text, severity }` on the
`FileDiff` return display — color is determined by severity enum, not string
matching.

**On read:** No visual change — reads remain silent. Diagnostics and symbol
summaries are appended to `llmContent` (what the model sees) but not shown to
the user.

**`/lsp` command:** Shows server health, tracked files, cached diagnostics,
error messages with install instructions. `/lsp restart` shuts down all servers.

### The `lsp_query` tool

Single tool with 6 operations, registered as `Kind.Search` (read-only,
auto-allowed by policy, available in plan mode):

```
lsp_query(operation: "references", file_path: "src/foo.ts", line: 10)
lsp_query(operation: "hover", file_path: "src/foo.ts", line: 10, character: 5)
lsp_query(operation: "diagnostics", file_path: "src/foo.ts")
lsp_query(operation: "document_symbols", file_path: "src/foo.ts")
lsp_query(operation: "workspace_symbols", file_path: "src/foo.ts", query: "UserService")
```

**Line/character are 1-based** — matching every other tool in the CLI
(`read_file`, `grep_search`, etc.) and the output of `formatSymbolSummary`. The
invocation converts to 0-based internally before calling LSP.

**Character is optional.** When omitted, defaults to the first non-whitespace
character on the line. The agent often knows the line but not the exact column.

**Tool description includes strategic hints** like "Use instead of grep for
refactoring — won't match comments or strings." These prevent the model from
falling back to less efficient tools.

### No new npm dependencies

The JSON-RPC client is implemented directly using Node.js `child_process` and
manual Content-Length framing (~530 lines). The shelved PR #15149 used
`vscode-jsonrpc` and `vscode-languageserver-types` (+146 kB) — unnecessary for
our use case.

## Key design decisions and rationale

| Decision                                          | Rationale                                                                                                                                 |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| No `diagnosticSeverity` filter                    | Agent benefits from all severities. Removed after initial implementation — it was cargo-culted from the shelved PR with no justification. |
| Per-server state bundles                          | Prevents cache pollution between servers. Enables clean restart of individual servers without losing others' state.                       |
| Workspace directories from `WorkspaceContext`     | Matches what VS Code does — send the user's actual workspace, not guessed roots. Servers get the right scope.                             |
| 1-based line numbers in `lsp_query`               | Every other tool and output in the CLI uses 1-based. Zero-based would cause off-by-one bugs constantly.                                   |
| Optional `character` with smart default           | Agent rarely knows the exact column. First non-whitespace is almost always correct for hover/definition queries.                          |
| Detailed tool descriptions in both model families | The strategic hints ("unlike grep") are worth their token cost — they prevent the model from wasting context on bad grep searches.        |
| `enrichToolResultWithLsp` shared helper           | Eliminated duplication between edit.ts and write-file.ts. Single place to maintain the enrichment logic.                                  |
| Optional chaining on `config.isLspEnabled?.()`    | Mock configs in tests don't have LSP methods. Optional chaining avoids test crashes without modifying every mock.                         |
| Dynamic imports for LSP in tool files             | `await import('../lsp/enrichment.js')` — LSP code is only loaded when the feature is enabled. Zero cost for users who don't opt in.       |

## Remaining work

### Phase 4: Diagnostic diffs (not started)

After a write or edit, show the **change** in diagnostic state — what was
introduced and what was fixed. The per-server `diagnosticCache` already stores
pre-edit state. Needs diff logic in `enrichment.ts`.

```xml
<lsp_diagnostics file="src/foo.ts" introduced="1" fixed="2">
FIXED   line 42: Property 'findById' does not exist on type 'Repository<User>'.
NEW     line 35: Parameter 'id' implicitly has an 'any' type.
</lsp_diagnostics>
```

### Phase 5: Multi-language servers (not started)

Adding Go (`gopls`) and Rust (`rust-analyzer`) is just adding entries to
`BUILTIN_SERVERS` in `server-registry.ts`. TypeScript and Python are already
working. Each new server may need testing for server-initiated request quirks
(like pyright's `workspace/configuration` requirement).

### Phase 1c: Binary detection (partial)

Currently, if a server binary isn't found, the user sees a raw `ENOENT` error in
`/lsp status`. A pre-spawn binary check using `which`/`where` would produce a
cleaner "not found, install with X" message. Low priority since the error is
still surfaced and actionable.

### Future: IDE-connected `LspProvider`

The `LspManager` public API maps cleanly to an `LspProvider` interface. In IDE
mode, a future `IdeLspProvider` could delegate to the IDE companion extension's
existing MCP server, using the IDE's already-running language servers. No
changes to the tool surface or enrichment logic needed.

## Security considerations

- Language servers execute code (TypeScript's `tsserver` runs Node.js). In
  sandboxed environments, spawned servers inherit the sandbox profile.
- `lsp_query` is read-only (`Kind.Search`) and auto-allowed by policy.
- Server commands are from a built-in allowlist or explicit user config — never
  derived from workspace files.
- Maximum 4 concurrent server processes (configurable via
  `tools.lsp.maxServers`).

## Open questions

1. **Token budget governance.** Should there be a hard cap on LSP tokens per
   tool result? Symbol summaries on large files could be significant.

2. **Diagnostic debounce.** Some servers publish diagnostics incrementally
   (initial batch then final). We resolve on the first match. A short debounce
   window (100–200ms) after the first match could capture the more complete set.

3. **`read_many_files` enrichment.** Batch reads could get noisy with per-file
   symbol summaries. Possibly enrich only the first N files.

4. **Telemetry.** If contributing upstream, instrument with OpenTelemetry events
   (`lsp_server_started`, `lsp_server_failed`, `lsp_diagnostics_collected`,
   `lsp_diagnostics_timeout`) to understand real-world reliability.
