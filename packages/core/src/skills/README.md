# Gemini CLI Investigative Workflow Skills

This directory contains a suite of built-in skills for memory analysis,
profiling, and performance diagnostics directly within the terminal.

## Overview

These skills focus on areas where LLM + tooling is uniquely powerful:
interpreting complex, low-level diagnostic data like memory snapshots, heap
profiles, and performance traces that humans historically struggle to parse.

## Skills

### 1. 3-Snapshot Technique (`3-snapshot-technique/`)

**Purpose**: Automated 3-Snapshot Technique for Node.js memory leak detection

**What it does**:

- Captures three heap snapshots at defined intervals
- Diffs them to identify leaked objects
- Identifies retainer chains
- Outputs results in Perfetto trace format

**Usage**:

```bash
@3-snapshot-technique analyze --target <PID> --interval 5000
@3-snapshot-technique diff --snapshot1 <path> --snapshot2 <path> --snapshot3 <path>
```

**Key Features**:

- Forces GC between snapshots to identify true leaks
- Automated diff analysis
- Retainer chain tracing

---

### 2. Heap Snapshot Analyzer (`heap-snapshot-analyzer/`)

**Purpose**: Analyze Node.js heap snapshots (.heapsnapshot files)

**What it does**:

- Ingests .heapsnapshot files
- Identifies suspicious growth patterns
- Finds large object clusters
- Detects detached DOM nodes
- Summarizes findings

**Usage**:

```bash
@heap-snapshot-analyzer analyze <snapshot.heapsnapshot>
@heap-snapshot-analyzer compare <before.heapsnapshot> <after.heapsnapshot>
@heap-snapshot-analyzer to-perfetto --input <snapshot> --output <trace.json>
```

**Key Features**:

- Object cluster analysis
- Type distribution reporting
- Suspicious pattern detection

---

### 3. Node Debugger (`node-debugger/`)

**Purpose**: Scriptable Node.js debugger using Chrome DevTools Protocol

**What it does**:

- Captures heap snapshots programmatically
- CPU profiling via CDP
- Batch breakpoint debugging
- Runtime evaluation
- Console/exception capture

**Philosophy**: Unlike DAP-based debugging (which requires 10-50 agent turns),
this executes commands in bulk/script mode, returning aggregated results for LLM
analysis.

**Usage**:

```bash
@node-debugger heap-snapshot --pid 12345 --output ./snapshot.heapsnapshot
@node-debugger cpu-profile --pid 12345 --duration 10000
@node-debugger batch --script ./app.js --breakpoints "file.ts:42,file.ts:128"
```

---

### 4. CPU Profiler (`cpu-profiler/`)

**Purpose**: CPU profiling and performance analysis

**What it does**:

- Captures CPU profiles
- Analyzes hot paths
- Detects performance regressions
- Generates flame graphs
- Creates Perfetto traces

**Usage**:

```bash
@cpu-profiler capture --pid 12345 --duration 10000
@cpu-profiler flame --input profile.cpuprofile --output flame.svg
@cpu-profiler compare --baseline baseline.cpuprofile --current current.cpuprofile
@cpu-profiler to-perfetto --input profile.cpuprofile --output trace.json
```

**Key Features**:

- Self vs Total time analysis
- Regression detection (>5% threshold)
- Hot path identification
- Flame graph generation

---

## Shared Utilities (`shared/`)

### `perfetto.ts`

Core utilities for:

- **Perfetto Trace Format**: Generate traces for ui.perfetto.dev
- **Heap Snapshot Parsing**: Parse Node.js .heapsnapshot format
- **Diff Analysis**: Compare snapshots for leak detection
- **Pattern Detection**: Find detached DOM, large arrays, etc.

Key exports:

- `PerfettoTraceBuilder` - Build Perfetto-compatible traces
- `analyzeHeapSnapshot()` - Analyze heap for suspicious patterns
- `diffHeapSnapshots()` - Compare before/after snapshots

## Architecture

```
packages/core/src/skills/
├── builtin/
│   ├── 3-snapshot-technique/
│   │   ├── SKILL.md              # Skill definition & workflow
│   │   └── scripts/
│   │       └── cdp-client.ts   # CDP-based heap capture
│   ├── heap-snapshot-analyzer/
│   │   └── SKILL.md              # Analysis workflows
│   ├── node-debugger/
│   │   └── SKILL.md              # CDP debugging guide
│   └── cpu-profiler/
│       ├── SKILL.md              # Profiling workflows
│       └── scripts/
│           └── cpu-profile.ts    # CPU profiling implementation
├── shared/
│   ├── perfetto.ts              # Core analysis utilities
│   └── perfetto.test.ts         # Unit tests
```

## Why Not DAP?

Debug Adapter Protocol (DAP) integration was intentionally avoided because:

1. **Agent Turn Efficiency**: DAP requires 10-50 turns for complex debugging
   (step, evaluate, step, evaluate...)
2. **Slower than Logging**: For most scenarios, adding logs and re-running is
   faster
3. **LLM Strength**: LLMs excel at analyzing aggregated data, not sequential
   step-through

Instead, these skills use:

- **Scriptable CLIs**: Execute command sequences in bulk
- **Aggregated Results**: Return structured data for LLM analysis
- **Chrome DevTools Protocol**: Direct programmatic access to Node.js internals

## Perfetto Integration

All skills output results in Perfetto-compatible format for visualization:

1. Capture data with skill
2. Generate trace: `@<skill> to-perfetto --input <data> --output trace.json`
3. Open in [ui.perfetto.dev](https://ui.perfetto.dev)
4. Visualize timeline, memory growth, call stacks

## Future: Android & Flutter

The Perfetto trace format is the same used by Android and Flutter tracing.
Future work:

- `android-memory-profiler/` skill
- `flutter-devtools/` skill
- Unified trace analysis across platforms

## Testing

Run tests:

```bash
npm test -- packages/core/src/skills/shared/perfetto.test.ts
```

## Usage Example: Diagnosing a Memory Leak

```
User: "My Express server has a memory leak"

1. Find process: ps aux | grep node
2. @3-snapshot-technique analyze --pid 12345 --interval 30000
3. Review results showing growing Array instances
4. @node-debugger batch --script server.js --breakpoints "routes/api.js:45"
5. Identify: Uncached database query in loop
6. Fix: Add query result caching
7. Verify: @3-snapshot-technique analyze --pid 12345 (memory stable)
```

## License

Apache 2.0 - See LICENSE file
