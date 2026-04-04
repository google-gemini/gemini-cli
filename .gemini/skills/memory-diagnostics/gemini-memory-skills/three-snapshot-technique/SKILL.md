---
name: three-snapshot-technique
description: >
  Automates the 3-snapshot memory leak detection technique for Node.js processes.
  Use this skill when the user wants to definitively identify memory leaks,
  find objects that are retained across GC cycles, detect leaked objects and
  their retainer chains, or run the "three snapshot" / "3-snapshot" method.
  Requires a running Node.js process with --inspect enabled OR a script path.
---

# Three-Snapshot Technique Skill

You are an expert at the 3-snapshot memory leak detection technique. This is
the most reliable method for identifying true memory leaks in Node.js.

## How the 3-Snapshot Technique Works

```
Snapshot A (baseline)
        ↓  [perform action once]
Snapshot B
        ↓  [perform same action again]
Snapshot C

Leaked objects = objects in B ∩ C that did NOT exist in A
```

The key insight: **transient objects appear in B but not C. Leaked objects
appear in both B and C but not A.**

## When to Use This Skill

- User says "I think my app has a memory leak"
- Memory grows every time an action is performed
- `--max-old-space-size` errors appear after extended runtime
- RSS memory of Node process grows unboundedly

## Setup Requirements

The target process must have the inspector enabled:

```bash
# Option 1: Start process with inspector
node --inspect app.js
node --inspect=9229 app.js   # explicit port

# Option 2: Enable on running process (Linux/macOS only)
kill -USR1 <PID>

# Option 3: Let the skill launch the script
node three_snapshot.js --script app.js
```

## Running the Skill

### Automatic (recommended)
```bash
node .gemini/skills/memory-analyzer/scripts/three_snapshot.js \
  --port 9229 \
  --interval 5000 \
  --output ./heap-snapshots
```

### With a specific script
```bash
node .gemini/skills/memory-analyzer/scripts/three_snapshot.js \
  --script src/server.js \
  --interval 10000
```

### Options
| Flag | Default | Description |
|---|---|---|
| `--port` | 9229 | Inspector port |
| `--script` | — | Launch this script with inspector |
| `--interval` | 5000 | Ms between snapshots |
| `--output` | cwd | Output directory |
| `--no-gc` | — | Skip forced GC between snapshots |

## Interpreting Results

After running, analyze the diff between snapshots A→B→C:

### 🚨 Definitive leak signals
- Object class grows from A→B AND B→C
- Count increases consistently: A=100, B=150, C=200 → **leaking 50/cycle**
- Retained size grows each snapshot

### ✅ Not a leak
- Object grows A→B but stays same B→C (transient allocation, GC'd)
- Size fluctuates without consistent growth pattern

## Interpreting Retainer Chains

A retainer chain shows WHY an object can't be GC'd:

```
leaked EventEmitter
  └── held by: listeners Map
        └── held by: Server instance  
              └── held by: global.servers[]  ← ROOT CAUSE
```

Fix: `global.servers` is never cleaned up → remove listeners before
destroying the Server.

## Common Leak Fixes

| Leaked Type | Likely Cause | Fix |
|---|---|---|
| `EventEmitter` | Listener not removed | `emitter.removeListener()` or `emitter.once()` |
| `closure` | Callback holds outer scope | Nullify references, use WeakRef |
| `Promise` | Never resolved/rejected | Add timeout + reject |
| `Timer` | setInterval never cleared | Store ID, call clearInterval |
| `Array/Map/Set` | Cache unbounded | Add max size + eviction |
| `Buffer` | Stream not consumed | Pipe to writable, handle 'end' |
