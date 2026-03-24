# Graph Index (IDX) — Implementation Reference

---

## G+ReAct — Why This Is Not Plain ReAct

### What standard ReAct looks like in this codebase

The Gemini CLI implements ReAct exactly as described in the official docs. The
loop lives in two files:

**`packages/core/src/core/turn.ts`** — one turn of model reasoning:

```
stream response from model
  → if part.thought  → yield Thought event       (Reason)
  → if text          → yield Content event
  → if functionCall  → yield ToolCallRequest      (Act)
  → if finishReason  → yield Finished
```

**`packages/core/src/core/client.ts`** — the recursive loop driver:

```typescript
// client.ts ~line 823 — recursive self-call after tool results
turn = yield* this.sendMessageStream(
  nextRequest,       // ← tool results injected as functionResponse parts
  signal,
  prompt_id,
  boundedTurns - 1, // ← turn budget decremented
  ...
);
```

Each iteration is: **model reasons → emits `functionCall` → tool executes →
result injected as `functionResponse` → model reasons again**. This is the
textbook Reason-Act-Observe cycle.

The tool set available to the main model and `codebase_investigator` subagent
before this project was:

```
ls, read_file, glob, grep_search, edit_file, ...
```

In that configuration every codebase navigation query — "where is X?", "what
calls X?" — resolves through **file I/O inside the ReAct loop**:

```
Reason: "I need to find set_stance"
Act:    grep_search("set_stance")           ← disk scan, regex over all files
Obs:    50 matches across 12 files
Reason: "I need to narrow down"
Act:    read_file("torch/compiler/__init__.py")
Obs:    300 lines
Act:    read_file("torch/_dynamo/stances.py")
...                                         ← loop iterates 6-10 more times
```

Each iteration burns tokens (the full history is re-sent) and wall-clock time.
The loop depth is proportional to codebase size.

---

### What G+ReAct changes

**G+ReAct = Graph-Index-Augmented ReAct.**

The graph index (`graph_search`, `graph_query`) is injected into the tool
registry **before the loop runs**. This collapses multi-turn navigation chains
into a single Act-Observe pair:

```
Reason: "I need to find set_stance"
Act:    graph_search("set_stance")          ← SQLite lookup, ~130ms, 0 file I/O
Obs:    { file: "torch/_dynamo/stances.py", line: 47,
          callers: ["_compile", "set_stance_ctx"],
          callees: ["_validate_stance"] }
Reason: "I have location + full call context. Done navigating."
```

The loop does not need another turn for pure navigation. File reads only happen
when the agent needs to read the **content** at a known location — and even then
it uses `start_line/end_line` from the graph result instead of loading the whole
file.

**Where in the code this is wired:**

| Layer                | File                              | What changed                                                                                                                             |
| -------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Tool registry        | `graphTools.ts`                   | `GraphInitTool`, `GraphSearchTool`, `GraphQueryTool` registered as first-class tools                                                     |
| Subagent tool access | `codebase-investigator.ts`        | Graph tools added to `toolConfig.tools` — without this, the subagent's ReAct loop physically cannot call them                            |
| Loop entry condition | `snippets.legacy.ts`              | `hasGraphQuery` flag gates graph-first routing in `workflowStepUnderstand` — changes which tool the model reaches for at **Reason** time |
| Index freshness      | `autoIndex.ts` + `initializer.ts` | Index is rebuilt at session start and hourly so the graph the loop queries is never stale                                                |

---

### The structural difference

| Property                     | Plain ReAct                                        | G+ReAct                                      |
| ---------------------------- | -------------------------------------------------- | -------------------------------------------- |
| Navigation cost              | O(files matching grep) turns                       | O(1) turns — single graph lookup             |
| Token cost per navigation    | High — history grows with each read_file           | Low — one tool call + one compact result     |
| Subagent delegation          | Subagent re-does navigation from scratch with grep | Subagent has same graph access as main model |
| Index staleness              | N/A                                                | Solved by session-start + hourly auto-index  |
| Loop depth for "where is X?" | 4–10 turns typically                               | 1 turn                                       |

The key insight: **ReAct loop depth is not a property of the model — it is a
property of the tool set.** Giving the model a tool that answers "where is X,
who calls it, what does it call" in one call removes the need for the iterative
grep-read-reason-repeat pattern entirely. G+ReAct does not modify the loop
mechanics in `client.ts` or `turn.ts` at all — it makes the loop converge faster
by raising the information density of a single Act-Observe pair.

---

## What Is This

The graph index is a SQLite-backed code intelligence layer built into the
experimental CLI. It indexes every function, class, and call edge in a codebase
into `.gemini/gemini.idx`, enabling instant symbol lookup and caller/callee
chain tracing without file scanning or grep.

Two tools expose it to the agent:

| Tool                     | Purpose                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| `graph_search("<name>")` | Find where a symbol is defined. Returns file, line, arguments, callers, callees.               |
| `graph_query("<name>")`  | Trace the full caller/callee chain for a symbol. Use for "what calls X" or "what does X call". |

A third tool bootstraps it:

| Tool         | Purpose                                                                                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `graph_init` | Indexes the project into `.gemini/gemini.idx`. Safe to re-run — unchanged files are skipped. Also generates `GEMINI.md`, a symbol location map auto-loaded on every session. |

---

## The Problem It Solves

For large codebases (100k+ files, millions of call edges — e.g. PyTorch),
navigation queries like "trace this call flow" or "find all callers of X" were
expensive:

- The agent would `grep_search` for a symbol, get 50 matches, read 5 files to
  narrow down, read 3 more to understand callers — burning thousands of tokens
  and tens of seconds
- `codebase_investigator` (the subagent) was the default delegation target for
  these queries, and it ran on `gemini-2.5-pro` for 2+ minutes per investigation

With the graph index:

- `graph_search("symbol")` returns file, line, callers, callees in ~130ms
- `graph_query("symbol")` traces the full chain in one call
- Zero file reads needed for pure navigation

---

## How We Got Here

### Phase 1 — Graph Index Built (V0)

The graph index tools (`graph_init`, `graph_search`, `graph_query`) were
implemented and wired into the main model's tool registry. The main model
received a graph-first mandate in its system prompt:

```
- "Where is X defined?" → graph_search("X")
- "What calls X? What does X call?" → graph_query("X")
- "Find text/string/comment" → grep_search("X")
```

### Phase 2 — The Routing Problem Discovered

After the index was built, session comparisons revealed a critical gap:

**Vanilla model (no graph index) — `saved_tensors_hooks` query:**

```
grep_search:  2
read_file:    5
glob:         1
graph_query:  0   ← index ignored entirely
codebase_investigator: 1 call, 2m21s, 363,956 tokens on gemini-2.5-pro
Total tokens: ~389k
```

**Experimental model (with graph index) — `set_stance` query:**

```
graph_query:  11
graph_search:  2
grep_search:   2
read_file:     0   ← zero file reads
Total tokens: ~240k (89.1% cache hits)
```

The vanilla model delegated everything to `codebase_investigator`, which had
**no access to graph tools** — it only had `[ls, read_file, glob, grep_search]`.
So the graph index was being completely bypassed the moment any navigation query
got routed to the subagent.

The improvement only worked when the **main model** handled the query directly.
Any delegation to `codebase_investigator` regressed to the old grep-heavy,
file-reading behavior.

### Phase 3 — The Fix: Route All Agents Through Graph Index

Four files were changed to close the routing gap:

---

## What Was Changed and Why

### 1. `packages/core/src/tools/tool-names.ts`

**Added:**

```ts
export const GRAPH_SEARCH_TOOL_NAME = 'graph_search';
export const GRAPH_QUERY_TOOL_NAME = 'graph_query';
```

**Why:** Graph tool names were previously inline string literals scattered
across files. Exporting them as constants enables type-safe imports and prevents
typos when wiring tools into agent configurations.

---

### 2. `packages/core/src/agents/codebase-investigator.ts`

**A — Graph tools added to `toolConfig.tools`:**

```ts
toolConfig: {
  tools: [
    LS_TOOL_NAME,
    READ_FILE_TOOL_NAME,
    GLOB_TOOL_NAME,
    GREP_TOOL_NAME,
    GRAPH_SEARCH_TOOL_NAME,   // ← added
    GRAPH_QUERY_TOOL_NAME,    // ← added
  ],
},
```

**Why:** Without these, `codebase_investigator` physically could not call graph
tools even if instructed to. The tool registry gates what each agent can invoke.

**B — Graph-first mandate added to system prompt:**

```
## Graph-First Navigation (when index available)
If graph_search and graph_query tools are available, you MUST follow this hierarchy:
- graph_search("<name>") — for any symbol lookup. Faster than grep, no file scanning.
- graph_query("<name>") — for full caller/callee chains. Use before read_file.
- grep_search — ONLY for non-symbol searches: string literals, comments, config values.
- After a graph result gives you file + line, read ONLY that range with start_line/end_line.
- If graph_search returns 0 results, try a shorter keyword before falling back to grep_search.
```

**Why:** Having the tools available is necessary but not sufficient. Without
explicit instructions, the subagent defaults to grep — which is what it was
trained on. The graph-first section tells it exactly when to use which tool.

**C — ExplorationTrace example updated:**

Changed the example in the final report template from:

```
"Used grep to search for updateUser to locate the primary function."
```

To:

```
"Used graph_search('updateUser') — returned file, line, callers, callees instantly."
"Used graph_query('updateUser') to trace the full caller chain."
"Read src/controllers/userController.js lines 42-78 (from graph result)."
```

**Why:** The example in the system prompt acts as a behavioral template. If the
example shows grep as step 1, the agent will mirror that pattern. Showing
graph_search as step 1 anchors the correct behavior.

---

### 3. `packages/core/src/prompts/snippets.legacy.ts`

**Added `hasGraphQuery` to `PrimaryWorkflowsOptions`:**

```ts
export interface PrimaryWorkflowsOptions {
  ...
  hasGraphQuery?: boolean;   // ← added
}
```

**Updated `workflowStepUnderstand`** — when both `enableCodebaseInvestigator`
AND `hasGraphQuery` are true:

```
For symbol lookups (finding where a function/class is defined, tracing who calls it),
use graph_search/graph_query directly — these are faster than delegating to
codebase_investigator for pure navigation. Delegate to codebase_investigator when
the task requires deep architectural understanding across many files, not just
symbol location.
```

**Why:** This tells the main model to handle symbol navigation itself rather
than delegating to the subagent. The distinction is intentional:
`codebase_investigator` is for deep architectural analysis (understanding why
code is written a certain way, ripple effects of changes). For pure "where is X,
what calls X" queries the graph tools on the main model are both faster and
cheaper.

---

### 4. `packages/core/src/prompts/promptProvider.ts`

**No change needed.** `hasGraphQuery` was already being computed (lines 166–171)
and included in the options object passed downstream. Adding `hasGraphQuery` to
the legacy interface in `snippets.legacy.ts` was sufficient for the value to
flow through.

---

## Agent Behavior After the Fix

### What each agent has now

| Agent                   | Graph Tools                                     | Graph-First Instructions                         |
| ----------------------- | ----------------------------------------------- | ------------------------------------------------ |
| Main model              | `graph_search`, `graph_query` via tool registry | ✅ Full mandate in core system prompt            |
| `codebase_investigator` | `graph_search`, `graph_query` ← **newly added** | ✅ Graph-first section in subagent system prompt |
| `generalist`            | All tools including graph                       | ✅ Inherits core system prompt                   |
| `cli_help`              | Docs tool only                                  | N/A (irrelevant)                                 |

### Expected tool routing

| Query type                                   | Correct tool                            | Wrong tool                           |
| -------------------------------------------- | --------------------------------------- | ------------------------------------ |
| "Where is function X defined?"               | `graph_search("X")`                     | `grep_search`, `read_file`           |
| "What calls X? What does X call?"            | `graph_query("X")`                      | `grep_search` + multiple `read_file` |
| "Trace the call chain from A to B"           | `graph_query("A")` → `graph_query("B")` | `codebase_investigator`              |
| "Find all places the string 'TODO' appears"  | `grep_search`                           | `graph_search`                       |
| "Understand the architecture of subsystem Y" | `codebase_investigator`                 | —                                    |
| "What is the purpose of module Z?"           | `codebase_investigator`                 | —                                    |

### Keyword shortening rule

The graph index stores symbols as defined in source, not as module-qualified
paths. `torch.compiler.set_stance` will not match — `set_stance` will. The agent
is instructed to strip module prefixes and try shorter keywords before falling
back to grep.

---

## Verified Results

Session comparison on PyTorch codebase (~6,330 files, 61,475 functions,
1,223,155 call edges):

| Metric                      | Vanilla | Experimental |
| --------------------------- | ------- | ------------ |
| Graph tool calls            | 0       | 13           |
| `read_file` calls           | 5       | 0            |
| Subagent duration           | 2m 21s  | —            |
| Subagent tokens (pro model) | 363,956 | 0            |
| Total tokens                | ~389k   | ~240k        |
| Cache hit rate              | 35.8%   | 89.1%        |
| Avg graph_query latency     | —       | 134ms        |

---

## Known Limitations

**Dotted-path names not indexed.** `torch.compiler.set_stance` returns 0 results
because the index stores `set_stance`, not the fully-qualified path. The agent
should try progressively shorter keywords.

**Class methods not directly queryable.** `graph_query("DynamoStance.__init__")`
returns nothing. Query the method name directly (`graph_query("__init__")`) or
the class name and inspect the `calls` field.

**Index must be initialized.** `graph_init` must be run at least once before
`graph_search`/`graph_query` return results. The agent will run it automatically
if queries return empty. After first run, auto-index keeps it fresh
automatically (see below).

**C/C++ coverage is partial.** The index focuses on Python. C++ symbols (e.g.
`torch/csrc/`) may be indexed as class names but call edges within C++ are
sparse.

---

## Phase 4 — GEMINI.md Smart Write + Auto-Index

### Problem

Two pain points emerged after Phase 3:

1. **GEMINI.md was overwritten on every `/idx` run.** Any custom instructions a
   developer added to `GEMINI.md` (project-specific rules, context, notes) were
   silently deleted each time the index was refreshed.

2. **Index goes stale during active development.** Developers actively writing
   code would have to remember to run `/idx` manually to keep the index current.
   In practice this was easy to forget, causing the agent to navigate using
   outdated symbol locations.

---

### Fix 1 — Smart GEMINI.md Write

**File:** `packages/core/src/services/graphService.ts` — `writeGeminiMd()`

**Old behaviour:** Always called `fs.writeFileSync`, unconditionally overwriting
the entire file.

**New behaviour:**

```
if GEMINI.md does not exist:
    create it with the index header + instructions   ← same as before

if GEMINI.md already exists:
    read existing content
    for each instruction line that is NOT already present in the file:
        prepend that line at the top
    if nothing is missing → do nothing, leave file untouched
```

Empty lines are excluded from the duplicate check so blank separators never
block real content from being added.

**Why prepend, not append?** `gemini-cli` auto-loads `GEMINI.md` and the model
reads it top-to-bottom. Index instructions (which govern tool routing) need to
appear before any project-specific notes to ensure they are not missed under
context truncation.

---

### Fix 2 — Auto-Index on Session Start and Every Hour

**New file:** `packages/cli/src/core/autoIndex.ts`

```
startAutoIndex(root):
    if .gemini/gemini.idx does not exist → return (idx never initialised)

    setImmediate → runIndex(root)           ← background, after UI renders
    setInterval(runIndex, 1 hour).unref()   ← hourly, won't block process exit
```

`runIndex` acquires a boolean lock (`indexing`) so two re-indexes can never
overlap. All errors are silently caught — auto-index is best-effort and must
never crash or stall the session.

**Wired in:** `packages/cli/src/core/initializer.ts` — `initializeApp()` calls
`startAutoIndex(config.getTargetDir())` after IDE connection is established,
just before returning the init result.

**Full session lifecycle with auto-index:**

```
Developer starts CLI session
        │
        ▼
initializeApp()
        │
        ├─ auth, theme, IDE connect ...
        │
        └─ startAutoIndex(targetDir)
                │
                ├─ .gemini/gemini.idx exists?
                │       │ NO  → return (nothing to do)
                │       │ YES ↓
                │
                ├─ setImmediate: runIndex()   ← fires after UI renders
                │       └─ GraphService.indexProject()  (background, silent)
                │       └─ writeGeminiMd()              (smart write, no overwrite)
                │
                └─ setInterval(1h, runIndex).unref()
                        └─ fires every hour while session is open
                        └─ skipped if a run is already in progress
```

**Session start latency:** Zero. `setImmediate` defers indexing until after the
React UI renders and the prompt is shown.

**Why `unref()`?** Without `.unref()`, Node.js keeps the process alive as long
as the timer is pending. `unref()` means the user can `Ctrl+C` or type `/quit`
and the process exits immediately — the timer doesn't hold it open.

---

### GraphService exported from core

`packages/core/src/index.ts` now exports `GraphService` so the CLI package can
import it without reaching into internal paths:

```ts
export { GraphService } from './services/graphService.js';
```

---

## Full End-to-End Flow (current state)

```
User runs /idx (or session starts with existing .gemini/gemini.idx)
        │
        ▼
GraphInitToolInvocation.execute()   [graphTools.ts]
        │
        ▼
GraphService.indexProject()         [graphService.ts]
        │
        ├─ Opens / creates .gemini/gemini.idx (SQLite)
        ├─ Walks all files under root
        │       └─ skip if file hash unchanged (manifest table)
        ├─ Parses changed files for functions, classes, call edges
        ├─ Writes nodes + edges + manifest rows in a single transaction
        └─ writeGeminiMd()
                ├─ GEMINI.md absent  → create with index header
                └─ GEMINI.md present → prepend only missing instruction lines

        ▼
Returns IndexStats { files_indexed, files_skipped, functions, classes, edges }

        ▼
On every subsequent session start (auto-index)
        │
        ├─ startAutoIndex() checks .gemini/gemini.idx exists
        ├─ setImmediate fires → GraphService.indexProject() in background
        └─ setInterval (1h) → repeat while session is open
```

**Agent usage after index is live:**

```
User query: "what calls set_stance?"
        │
        ▼
Main model → graph_query("set_stance")         [~134ms, 0 file reads]
        │
        ▼
codebase_investigator (if delegated)
        ├─ also has graph_search + graph_query in toolConfig
        └─ graph-first mandate in system prompt → uses graph, not grep
```

---

## Files Modified

| File                                                | Change                                                                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `packages/core/src/tools/tool-names.ts`             | Added `GRAPH_SEARCH_TOOL_NAME`, `GRAPH_QUERY_TOOL_NAME` constants                                            |
| `packages/core/src/agents/codebase-investigator.ts` | Added graph tools to toolConfig + graph-first system prompt section + updated ExplorationTrace example       |
| `packages/core/src/prompts/snippets.legacy.ts`      | Added `hasGraphQuery` to `PrimaryWorkflowsOptions`, updated `workflowStepUnderstand` with graph-first caveat |
| `packages/core/src/prompts/promptProvider.ts`       | No change — `hasGraphQuery` was already computed and forwarded                                               |
| `packages/core/src/services/graphService.ts`        | Graph index service (SQLite backend); `writeGeminiMd()` changed to smart write (no overwrite)                |
| `packages/core/src/tools/graphTools.ts`             | `graph_init`, `graph_search`, `graph_query` tool definitions                                                 |
| `packages/core/src/index.ts`                        | Added `export { GraphService }` so CLI package can import without internal path                              |
| `packages/cli/src/core/autoIndex.ts`                | **New.** Background auto-index at session start + hourly interval with lock + unref                          |
| `packages/cli/src/core/initializer.ts`              | Calls `startAutoIndex(config.getTargetDir())` at end of `initializeApp()`                                    |
