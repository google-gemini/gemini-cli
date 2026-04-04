---
name: perfetto-exporter
description: >
  Converts Node.js heap snapshots and CPU profiles into Perfetto trace format
  for visual exploration at ui.perfetto.dev. Use this skill when the user wants
  to visualize memory or performance data in Perfetto, export traces for sharing,
  view a flame chart of memory usage, or prepare data for Android/Flutter
  profiling comparison. Works with .heapsnapshot and .cpuprofile files.
---

# Perfetto Exporter Skill

You convert Node.js diagnostic data into Perfetto trace format, enabling
visual exploration and cross-platform comparison (Node.js → Android → Flutter).

## What is Perfetto?

Perfetto (https://ui.perfetto.dev) is Google's open-source performance
tracing platform. It's the standard tool for:
- Android system traces
- Flutter performance traces  
- Chrome renderer traces
- Custom application traces

By outputting Node.js data in Perfetto format, this skill creates a **unified
profiling workflow** across all platforms.

## Running the Exporter

### Export heap snapshot
```bash
node .gemini/skills/memory-analyzer/scripts/perfetto_export.js \
  --heap heap-A-baseline.heapsnapshot
```

### Export CPU profile
```bash
node .gemini/skills/memory-analyzer/scripts/perfetto_export.js \
  --cpu profile-20260330.cpuprofile
```

### Export both together
```bash
node .gemini/skills/memory-analyzer/scripts/perfetto_export.js \
  --heap heap-A-baseline.heapsnapshot \
  --cpu profile-20260330.cpuprofile \
  --output ./traces
```

## Viewing in Perfetto

1. Go to **https://ui.perfetto.dev**
2. Click **"Open trace file"**
3. Select the exported `.json` file
4. Explore the flame chart and counter tracks

## Perfetto Trace Structure (for Contributors)

The output uses **Trace Event Format**:

```json
{
  "traceEvents": [
    { "ph": "X", "name": "functionName", "ts": 1000, "dur": 500, "pid": 1, "tid": 1 },
    { "ph": "C", "name": "heapClass",    "ts": 0,    "pid": 1, "tid": 1, "args": {"size_kb": 4096} },
    { "ph": "i", "name": "HeapSnapshot", "ts": 0,    "s": "g" }
  ]
}
```

Event types used:
| `ph` | Type | Used for |
|---|---|---|
| `X` | Complete (duration) | CPU samples, memory blocks |
| `C` | Counter | Memory class sizes |
| `i` | Instant | Snapshot markers |

## Path to Android/Flutter Support

The same Perfetto format works for Android and Flutter traces. Future
extensions of this skill can:
1. Ingest Android `.perfetto` traces alongside Node.js data
2. Correlate JS heap pressure with Android memory events
3. Compare Flutter widget rebuild times with Node.js API response times

This cross-platform capability is why Perfetto output was chosen over
Chrome-specific formats.
