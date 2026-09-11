---
name: perf-profiler
description: Profile CPU performance and analyze hot paths in Node.js applications. Use when the user asks to profile, find slow code, analyze CPU usage, identify hot functions, or diagnose performance bottlenecks.
---

# Performance Profiler

Skill for CPU profiling and hot path analysis in Node.js applications.

## Workflow

### 1. Determine Profiling Target

- **Running process**: Connect via `--inspect` to capture a live CPU profile.
- **Existing profile**: If the user provides a `.cpuprofile` file, skip to analysis.

### 2. Capture CPU Profile

Use the bundled `scripts/cpu-profile.cjs` to capture a CPU profile:

```bash
node <skill-path>/scripts/cpu-profile.cjs --port 9229 --duration 10000 --output ./profile.cpuprofile
```

**Parameters:**
- `--port`: DevTools debugging port (default: 9229)
- `--duration`: Profiling duration in milliseconds (default: 10000)
- `--output`: Output file path (default: `./profile.cpuprofile`)

### 3. Analyze the Profile

Use the bundled `scripts/analyze-profile.cjs` to extract hot paths:

```bash
node <skill-path>/scripts/analyze-profile.cjs --input ./profile.cpuprofile --top 20
```

The script outputs:
- Top functions by self-time (time spent in the function itself)
- Top functions by total-time (including callees)
- Call tree summary showing the heaviest execution paths
- Optimization suggestions for common patterns

### 4. Interpret Results

After analysis:
- Focus on functions with high self-time — these are direct CPU consumers
- Check total-time for functions that delegate to expensive subroutines
- Look for unexpected entries (e.g., GC, JSON.parse, regex) that indicate optimization opportunities
- Suggest converting to Perfetto traces for visual exploration using the `perf-trace` skill
