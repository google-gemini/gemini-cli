---
name: memory-investigation
description: >-
  V8 memory leak detection, heap snapshot analysis, CPU profiling, and
  performance investigation for Node.js processes. Use when the user mentions
  memory leaks, high heap usage, "my app is slow", "out of memory", heap
  snapshots (.heapsnapshot files), Perfetto traces, allocation hotspots, GC
  pressure, memory regressions, or wants to debug a running Node.js process.
  Triggers on memory leak, heap, OOM, slow process, CPU profile, GC,
  allocation, V8, CDP, investigate memory, performance investigation.
---

# Memory Investigation Skill

Gemini CLI ships a full-featured V8 memory and performance investigation module. Use the `investigate` tool for all memory and CPU investigation tasks.

## Tool: `investigate`

All investigation actions share a single tool with an `action` parameter.

### Actions

| Action | What it does | Key params |
|--------|-------------|-----------|
| `analyze_heap_snapshot` | Parse & summarize a `.heapsnapshot` file | `file_path` |
| `diagnose_memory` | Run 9-pattern root-cause analysis on a snapshot | `file_path` |
| `take_heap_snapshots` | 3-snapshot leak detection via CDP on a live process | `port` (default 9229), `interval_ms` |
| `capture_cpu_profile` | CPU flame graph capture via CDP | `port`, `duration_ms` (default 5000) |
| `capture_memory_report` | Full report: heap + sampling profile + snapshot | `port` |
| `export_perfetto` | Export last analysis as Perfetto JSON trace | `output_path` |

## Common Workflows

### 1. User has a `.heapsnapshot` file

```
investigate(action="diagnose_memory", file_path="/path/to/app.heapsnapshot")
```

This runs all 9 root-cause pattern detectors and returns a ranked report with confidence scores. Follow up with `analyze_heap_snapshot` for the full class breakdown.

### 2. User suspects a live process is leaking

First, confirm the process is running with `--inspect` or `--inspect-brk`:
```
node --inspect app.js   # exposes CDP on port 9229
```
Then:
```
investigate(action="take_heap_snapshots", port=9229, interval_ms=30000)
```
This uses the 3-snapshot technique: snapshot → wait → snapshot → wait → snapshot. Only objects surviving all 3 are true leak candidates.

### 3. CPU profiling

```
investigate(action="capture_cpu_profile", port=9229, duration_ms=10000)
```
Then export to Perfetto for visualization:
```
investigate(action="export_perfetto", output_path="trace.json")
```

### 4. Full memory report on a live process

```
investigate(action="capture_memory_report", port=9229)
```

## Interpreting Results

- **Confidence scores**: HIGH / MEDIUM / LOW — focus on HIGH findings first
- **Retainer chains**: The `retainedBy` path shows exactly which objects prevent GC
- **Token efficiency**: Snapshots are compressed ~85,000x before being sent to Gemini, so even 300MB heap files are safe to analyze
- **Class breakdown**: Look for classes growing across snapshots — these are your leak candidates

## When CDP Connection Fails

If `take_heap_snapshots` fails to connect:
1. Ensure the target process was started with `--inspect` flag
2. Check the port: `lsof -i :9229`
3. Try `--inspect=0.0.0.0:9229` for remote processes
4. The process must be a Node.js process (not Deno, Bun, or browser)

## Advanced: Trend Forecasting & Regression Guards

After collecting multiple snapshots over time, the module can:
- **Forecast** when the heap will hit a critical threshold (`TrendForecaster`)
- **Guard** against regressions by comparing a new snapshot against a saved baseline (`MemoryRegressionGuard`)

See [references/advanced-workflows.md](references/advanced-workflows.md) for details on these advanced scenarios.

## Advanced: Perfetto SQL Queries

After exporting a trace, run SQL queries directly against the Perfetto trace:
```
investigate(action="export_perfetto", output_path="trace.json", include_memory_counters=true, include_leak_annotations=true)
```
Then use `PerfettoSqlIntegration` to query with standard SQL — see [references/perfetto-sql.md](references/perfetto-sql.md).
