---
name: memory-investigation
description: >
  Automated 3-snapshot memory leak detection and retainer chain analysis for
  Node.js processes. Use when the user wants to investigate memory growth,
  diagnose memory leaks, analyze heap snapshots, or understand why objects
  survive garbage collection in Node.js applications or in Gemini CLI itself.
---

# Memory Investigation

Automated heap snapshot analysis skill for diagnosing memory leaks in Node.js processes.

## Workflow

### Step 1: Capture Heap Snapshots

Capture 3 snapshots at intervals to distinguish persistent leaks from transient allocations:

```bash
node <skill-path>/scripts/capture.mjs --count 3 --interval 5000 --output ./snapshots
```

Between captures, reproduce the suspected leak (send prompts, open files, trigger workflows).

### Step 2: Analyze Snapshots

Run the full analysis pipeline — parse, diff, retainer chains, and output:

```bash
node <skill-path>/scripts/analyze.mjs ./snapshots
```

This produces:
- Color-coded terminal table of growing constructors
- Retainer chain paths showing why objects survive GC
- `diff_summary.json` — compact LLM-ready anomaly summary (< 5KB)
- `trace.json` — Perfetto-compatible trace for visual exploration

### Step 3: Interpret Results

Apply these diagnostic patterns to the analysis output:

| Pattern | Root Cause | Investigation |
|---|---|---|
| Custom class growing with retainer chain to root | Direct leak — objects retained from GC root | Follow the retainer path to find the holding reference |
| Buffer + ArrayBuffer growing together | Streams not consumed | Check for caching without eviction |
| Multiple constructors with same countDelta | Fields of same leaked parent | Identify the root object via retainer chains |
| Map / Set growing | No eviction policy | Check for missing `.delete()` calls |

### Step 4: Visualize in Perfetto

Tell the user to open [ui.perfetto.dev](https://ui.perfetto.dev) and drag-drop `trace.json`.

## Files

```
scripts/
  analyze.mjs       Orchestrator: capture -> parse -> diff -> retainers -> output
  capture.mjs       V8 snapshot capture via node:inspector Session
  cdp.mjs           External-process CDP WebSocket client (RFC 6455)
  diff.mjs          .heapsnapshot parser + per-type retained size diff engine
  retainers.mjs     Retainer chain walker (backward BFS, cycle detection)
  trace.mjs         Chrome JSON Trace Event converter (Perfetto)
  render.mjs        ANSI terminal table renderer + retainer path display
  demo.mjs          Self-contained leak simulation demo script
  test.mjs          45 unit tests covering parsing, diffing, and retainer walking
prompts/
  root_cause.txt    Structured LLM root-cause analysis prompt template
```

## Security

- Inspector binds to `127.0.0.1` only — never `0.0.0.0`
- Rejects privileged ports below 1024
- Never transmits raw `.heapsnapshot` files — only constructor names, counts, and byte sizes
- Auto-deletes snapshot files after analysis

## Requirements

Node.js >= 20. Zero external dependencies.
