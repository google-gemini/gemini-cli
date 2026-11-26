---
name: perf-trace
description: Convert CPU profiles and performance data to Perfetto trace format for visual exploration. Use when the user asks to visualize profiles, create trace files, generate Perfetto traces, or explore performance data visually at ui.perfetto.dev.
---

# Perfetto Trace Generator

Skill for converting Node.js CPU profiles and performance data into Perfetto-compatible trace format for visual exploration.

## Workflow

### 1. Convert a CPU Profile to Perfetto Trace

Use the bundled `scripts/to-perfetto.cjs` to convert a `.cpuprofile` to Perfetto format:

```bash
node <skill-path>/scripts/to-perfetto.cjs --input profile.cpuprofile --output trace.perfetto-trace
```

**Parameters:**
- `--input`: Path to a `.cpuprofile` file (from the `perf-profiler` skill or Chrome DevTools)
- `--output`: Output file path (default: `./trace.perfetto-trace`)

### 2. View the Trace

After conversion, the trace can be loaded at [ui.perfetto.dev](https://ui.perfetto.dev):
1. Open https://ui.perfetto.dev in a browser
2. Click "Open trace file" or drag-and-drop the generated `.perfetto-trace` file
3. Explore the flame chart, call stacks, and timing visually

### 3. Interpret the Visualization

In the Perfetto UI:
- **Flame chart**: Shows nested function calls over time — wider bars = more time spent
- **Tracks**: Each thread/process gets its own track
- **Slices**: Individual function call durations
- Use the search bar to find specific functions
- Click on slices to see detailed timing and call stacks
