---
name: memory-analysis
description: Investigate Node.js memory leaks and heap growth using automated heap snapshot capture, the 3-snapshot diffing technique, and structured summarization. Use when the user reports memory issues, OOM crashes, growing RSS, or asks to find a memory leak in a Node.js application.
---

# Memory Analysis

Diagnose Node.js memory leaks by capturing V8 heap snapshots, diffing them with the 3-snapshot technique, and producing compact summaries for root-cause analysis.

## Quick Start

For a suspected memory leak in a running app:

```
node <skill_scripts_dir>/capture-snapshots.cjs --target=<pid_or_script> --count=3 --interval=10
node <skill_scripts_dir>/diff-snapshots.cjs --s1=snap1.heapsnapshot --s2=snap2.heapsnapshot --s3=snap3.heapsnapshot
```

For a single snapshot analysis:

```
node <skill_scripts_dir>/parse-heapsnapshot.cjs --input=<file.heapsnapshot> --top=20
```

## Available Scripts

| Script | Purpose | Input | Output |
|--------|---------|-------|--------|
| `capture-snapshots.cjs` | Capture N heap snapshots from a process via CDP | PID or script path, count, interval | `.heapsnapshot` files in `.gemini/diagnostics/` |
| `parse-heapsnapshot.cjs` | Summarize a single snapshot | `.heapsnapshot` file | JSON: top constructors, large objects, suspicious patterns |
| `diff-snapshots.cjs` | 3-snapshot leak detection | Three `.heapsnapshot` files | JSON: leaked constructors, leaked IDs, growth stats |
| `retainer-chains.cjs` | BFS retainer chain analysis | `.heapsnapshot` + leaked IDs | JSON: retention paths, root cause patterns, confidence scores |

All script output is JSON, compact (<5KB), designed to fit in context without truncation.

## The 3-Snapshot Technique

This is the standard approach for isolating genuine leaks from normal allocations:

1. **S1 (baseline)** — Capture after app reaches steady state (warmup complete)
2. Perform the suspected leaky operation once
3. **S2 (mid)** — Capture to mark the allocation window
4. Repeat the same operation
5. **S3 (final)** — Capture again

**Leak formula**: Objects in S3 that were allocated between S1 and S2 and survived GC are leaked.

`diff-snapshots.cjs` automates this computation and filters out V8 internal noise (system types like `(sliced string)`, `(compiled code)`, `CodeRelocationInfo`).

## Interpreting Output

### `parse-heapsnapshot.cjs` output

```json
{
  "snapshot_info": { "node_count": 1247832, "total_size": "142MB" },
  "top_constructors": [
    { "name": "Socket", "count": 8472, "shallow": "12.3MB", "retained": "89.2MB" }
  ],
  "suspicious_patterns": [
    { "pattern": "growing_array", "constructor": "Array", "evidence": "12 arrays > 1MB" }
  ],
  "largest_objects": [
    { "constructor": "Buffer", "size": "4.2MB", "retainer": "Socket → _readableState → buffer" }
  ]
}
```

**Action after reading output:**
- If `top_constructors` shows unexpected types with high retained size → search codebase for that constructor name
- If `suspicious_patterns` flags `growing_array` → look for unbounded `.push()` without cleanup
- If `largest_objects` shows a retainer chain → trace that chain in source code to find where the reference should be released

### `diff-snapshots.cjs` output

```json
{
  "leaked_constructors": [
    { "name": "Closure", "count": 847, "total_retained": "12.1MB",
      "sample_retainers": ["EventEmitter → _events → connection → [3]"] }
  ],
  "growth_stats": {
    "s1_to_s2": "+18.2MB",
    "s2_to_s3": "+18.5MB",
    "verdict": "consistent growth — steady leak"
  }
}
```

**Action after reading output:**
- Consistent growth between intervals confirms a leak (not a one-time allocation)
- Use `sample_retainers` paths to `grep_search` for the allocation site
- Common patterns: `EventEmitter.on()` without `.off()`, `setInterval()` without `clearInterval()`, closures capturing large scopes

## Common Leak Patterns to Search For

When the diff identifies a leaking constructor, search the codebase for these anti-patterns:

| Leak Type | grep pattern | Fix |
|-----------|-------------|-----|
| Event listener accumulation | `\.on\(` / `addEventListener` | Add corresponding `.off()` / `removeEventListener` in cleanup |
| Timer leak | `setInterval` / `setTimeout` | Store handle, call `clearInterval` / `clearTimeout` on teardown |
| Closure capture | Look at retainer chain constructor name in source | Nullify references or use `WeakRef` |
| Cache without eviction | `Map` / `Object` used as cache | Add LRU bounds or `WeakMap` |
| Detached DOM nodes | `detached_dom` in suspicious_patterns | Ensure DOM removal also nullifies JS references |

## Composing with Other Skills

- **With `perfetto-export`**: After analysis, activate `perfetto-export` to convert heap data into a visual timeline trace for `ui.perfetto.dev`
- **With `cpu-profiling`**: If GC time is high in CPU profiles, that's a signal to investigate memory — activate this skill as follow-up

## Security Model

Profiling an external process requires attaching a CDP WebSocket to its `--inspect` port.
This opens real attack surface in sandboxed or multi-user workspaces — an area the issue
explicitly calls out and that no other prototype addresses.

### Threat model

| Threat | Mitigation |
|--------|------------|
| Inspector port reachable from network | Bind exclusively to `127.0.0.1`; never `0.0.0.0` |
| Port hijacking / squatting | Use ephemeral port (`--inspect=127.0.0.1:0`), read assigned port from `stderr` |
| User unaware a debug port is open | Explicit consent prompt before attaching to any PID |
| Port left open after analysis | Disconnect CDP session and kill `--inspect` subprocess on skill teardown |
| Env-var injection via tool arguments | Follow the `hookConfig.env` filtering precedent (PR #22504) — sanitise all env overrides before process spawn |

### Consent prompt (planned implementation)

Before attaching to an external process the CLI will display:

```
⚠  Memory Analysis — inspector access requested
   Target: node server.js  (PID 12345)
   This opens a CDP WebSocket on 127.0.0.1:<ephemeral> for the duration of the analysis.
   Confirm? [y/N]
```

The consent check is skipped only when the workspace `GEMINI.md` has explicitly
allowlisted `memory-analysis` inspector access for a named script.

### Ephemeral port lifecycle

```
spawn  node --inspect=127.0.0.1:0 <target>
  └─ read  "Debugger listening on ws://127.0.0.1:<PORT>" from stderr
  └─ open  CDP WebSocket to 127.0.0.1:<PORT>
  └─ [capture snapshots]
  └─ session.disconnect()
  └─ close WebSocket, kill subprocess, verify port no longer bound
```

This is consistent with the existing sandbox profiles in `bundle/sandbox-macos-*.sb`
which restrict the CLI to loopback-only networking during tool execution.

## Detailed References

- [V8 Heap Snapshot Format](v8-heap-format.md) — Structure of `.heapsnapshot` JSON, node/edge types, string table
- `references/common-leak-patterns.md` — Catalogue of Node.js anti-patterns with code examples *(full GSoC implementation)*
- `references/cdp-heap-commands.md` — Chrome DevTools Protocol commands for `HeapProfiler` domain *(full GSoC implementation)*
