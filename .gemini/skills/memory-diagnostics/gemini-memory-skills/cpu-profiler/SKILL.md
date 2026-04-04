---
name: cpu-profiler
description: >
  Records and analyzes Node.js CPU profiles to find performance bottlenecks,
  hot functions, and CPU regressions. Use this skill when the user asks about
  slow performance, high CPU usage, identifying bottlenecks, profiling a
  function or endpoint, or comparing performance before/after a change.
  Works via Chrome DevTools Protocol — no GUI needed.
---

# CPU Profiler Skill

You are an expert Node.js performance profiler. You use V8's sampling CPU
profiler via CDP to record what code is actually consuming CPU time.

## When to Use This Skill

- "My app feels slow" / "This function is slow"
- "What's taking so much CPU?"
- "I want to profile before and after my optimization"
- High CPU load in production (use on a staging replica)
- Build process is slow (profile the build script itself)

## Running the Profiler

### Basic usage
```bash
node .gemini/skills/memory-analyzer/scripts/cpu_profiler.js \
  --port 9229 \
  --duration 10000
```

### Profile a specific script
```bash
node .gemini/skills/memory-analyzer/scripts/cpu_profiler.js \
  --script src/server.js \
  --duration 15000
```

### Options
| Flag | Default | Description |
|---|---|---|
| `--port` | 9229 | Inspector port of running process |
| `--script` | — | Launch and profile this script |
| `--duration` | 10000 | Profile duration in ms |
| `--output` | cwd | Output directory |

## Interpreting CPU Profile Output

### Self Time vs Total Time
- **Self time**: time spent in this function's own code
- **Total time**: self + time in functions it called
- **Focus on HIGH SELF TIME** — these are the actual bottlenecks

### Reading the Report
```
Function                              Samples       CPU %
────────────────────────────────────  ────────   ───────
JSON.parse                               4821      24.1%   ← HOT SPOT
TypeScript.emit                          2100      10.5%
fs.readFileSync                          1800       9.0%
```

Functions with >5% self CPU time are worth investigating.

### Common Bottleneck Patterns

| Pattern | CPU% | Likely Cause | Fix |
|---|---|---|---|
| `JSON.parse/stringify` | >10% | Repeated serialization | Cache results, use streaming JSON |
| `fs.readFileSync` | >5% | Sync I/O blocking event loop | Use async fs, add caching |
| `RegExp.exec` | >10% | Expensive regex in hot path | Compile once, simplify pattern |
| Anonymous closures | >15% | Tight loops creating functions | Move function outside loop |
| GC/Scavenge | >20% | Memory pressure | See memory-analyzer skill |
| TypeScript compiler | >30% | Large build | Use incremental, project refs |

## Performance Regression Workflow

1. Checkout baseline commit → profile → save as `profile-baseline.cpuprofile`
2. Checkout new commit → profile same workload → save as `profile-new.cpuprofile`
3. Load both in Chrome DevTools → Performance → compare flame charts
4. Or run analyze_snapshot.js on both and diff the top-function lists

## Profiling the Gemini CLI Build (Directly Applicable!)

Since you saw OOM errors during `npm run build`:

```bash
# Start the build with inspector
node --inspect=9229 scripts/build_package.js &

# In another terminal, immediately start profiling
node .gemini/skills/memory-analyzer/scripts/cpu_profiler.js \
  --port 9229 \
  --duration 60000 \
  --output ./build-profiles
```

This will show exactly which TypeScript compilation steps are the most
expensive, helping you optimize the build.

## Viewing Results Visually

The `.cpuprofile` file can be loaded in:
1. **Chrome DevTools** → Performance tab → Load profile button
2. **VS Code** → JS Profile Viewer extension
3. **Speedscope** → https://www.speedscope.app (drag and drop)
4. **Perfetto** → Use `perfetto_export.js --cpu profile.cpuprofile`
