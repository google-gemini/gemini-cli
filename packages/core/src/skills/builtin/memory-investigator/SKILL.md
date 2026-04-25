---
name: memory-investigator
description: Detect and diagnose Node.js memory leaks using the 3-snapshot technique. Use when a user reports growing RSS, suspected memory leaks, or asks to analyze heap snapshots. Captures three V8 heap snapshots at intervals, diffs constructor-level growth, extracts retainer chains showing why objects cannot be garbage collected, classifies root causes, and exports Perfetto traces.
---

# Memory Investigator

Automated memory leak detection using the 3-snapshot heap analysis technique.

## Workflow

1. Identify the target Node.js process (self or remote via `--inspect` port)
2. Capture baseline heap snapshot (A) with forced GC
3. Ask the user to perform the suspected leaking operation
4. Capture post-action snapshot (B) with forced GC
5. Ask the user to repeat the operation
6. Capture final snapshot (C) with forced GC
7. Run the analysis pipeline:
   - Three-snapshot diff: find constructors with monotonic growth (A < B < C)
   - Noise filter: remove V8 internals, size floor, single-instance, min-count
   - Retainer chain extraction: BFS from leaked objects to GC roots
   - Root cause classification: event listener, cache, closure, global, timer
   - Perfetto trace export for visual exploration
8. Present results with confidence levels and suggested fixes

## Tools Used

- `heap_snapshot_capture` (Kind.Execute) -- captures heap snapshots to disk
- `heap_snapshot_analyze` (Kind.Read) -- parses and analyzes snapshots

## Output

The analysis produces:
- **Leak candidates** ranked by retained size with growth rates
- **Retainer chains** showing the exact reference path to GC roots
- **Root cause classification** with confidence scores and fix suggestions
- **Perfetto trace** (optional) for visual exploration at ui.perfetto.dev

## Example Interaction

User: "My Express server's memory keeps growing after handling requests"

1. Connect to the server's inspector endpoint
2. Capture snapshot A (baseline)
3. Ask user to send 100 requests
4. Capture snapshot B
5. Ask user to send another 100 requests
6. Capture snapshot C
7. Report: "Found 847 new RequestContext objects retained by EventEmitter._events.
   Root cause: event listener leak. Fix: call removeListener() in request cleanup."
