---
name: memory-investigator
description: Investigate memory leaks and analyze heap snapshots in Node.js applications. Use when the user asks to debug memory issues, find memory leaks, analyze heap snapshots, or perform the 3-snapshot technique for leak detection. Also useful for diagnosing memory bloat, identifying large object clusters, and finding detached DOM nodes.
---

# Memory Investigator

Skill for automated memory leak detection and heap snapshot analysis in Node.js applications.

## Workflow

### 1. Determine Investigation Target

- **Running process**: If the user provides a PID or URL, connect via `--inspect` to capture live snapshots.
- **Existing snapshots**: If the user provides `.heapsnapshot` files, skip to analysis.

### 2. Capture Heap Snapshots (3-Snapshot Technique)

Use the bundled `scripts/capture-snapshots.cjs` to automate the 3-snapshot technique:

```bash
node <skill-path>/scripts/capture-snapshots.cjs --pid <PID> --interval 5000 --output ./snapshots
```

**Parameters:**
- `--pid`: Process ID of the target Node.js process (must have `--inspect` enabled)
- `--port`: DevTools debugging port (default: 9229)
- `--interval`: Milliseconds between snapshots (default: 5000)
- `--output`: Directory to save snapshots (default: `./snapshots`)

The script captures 3 snapshots and outputs a summary of heap size and object count for each.

### 3. Diff and Analyze Snapshots

Use the bundled `scripts/diff-snapshots.cjs` to compare snapshots and identify leaks:

```bash
node <skill-path>/scripts/diff-snapshots.cjs --baseline snapshot1.heapsnapshot --target snapshot3.heapsnapshot --top 20
```

**Parameters:**
- `--baseline`: Path to the first/baseline snapshot
- `--target`: Path to the later snapshot to compare against
- `--top`: Number of top growing constructors to show (default: 20)

The script outputs:
- Overall memory growth between snapshots
- Top constructors by instance count growth
- Top constructors by size growth
- Suspected leak candidates (objects that grew consistently)

### 4. Interpret Results

After running the diff script, analyze the output to:
- Identify constructor names that show consistent growth across snapshots
- Look for well-known leak patterns (event listeners, closures, caches without eviction)
- Suggest specific code areas to investigate based on constructor names
- Recommend fixes (WeakRef, WeakMap, proper cleanup, cache eviction)

For background on the 3-snapshot technique, see [references/3-snapshot-technique.md](references/3-snapshot-technique.md).
