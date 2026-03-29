---
name: 3-snapshot-technique
description: Automated 3-Snapshot Technique for Node.js memory leak detection. Captures three heap snapshots at intervals, diffs them to identify leaked objects and their retainer chains. Outputs results in Perfetto trace format for visualization.
---

# 3-Snapshot Technique for Memory Leak Detection

This skill implements the classic 3-snapshot technique for identifying memory leaks in Node.js applications.

## Overview

The 3-snapshot technique works by:
1. Capturing heap snapshot #1 (baseline)
2. Performing actions that may leak memory
3. Capturing heap snapshot #2 (after operation)
4. Forcing GC and capturing heap snapshot #3 (stabilized)
5. Comparing snapshots to find objects that survived GC

## Usage

```bash
# Run automated 3-snapshot analysis
@3-snapshot-technique analyze --target <PID or script> --interval 5000 --output ./leak-analysis

# Analyze existing heap snapshots
@3-snapshot-technique diff --snapshot1 <path> --snapshot2 <path> --snapshot3 <path>

# Generate Perfetto trace from results
@3-snapshot-technique to-perfetto --input <analysis.json> --output <trace.json>
```

## Workflow

When user requests memory leak analysis:

1. **Identify Target**: Get Node.js process PID or script path to analyze
2. **Capture Snapshots**: Use Chrome DevTools Protocol (CDP) to capture 3 snapshots
3. **Diff Analysis**: Compare snapshots to find:
   - Objects present in all 3 snapshots (likely leaked)
   - Objects growing between snapshots
   - Retainer chains keeping objects alive
4. **Generate Report**: 
   - Text summary of suspected leaks
   - Perfetto trace for timeline visualization
   - Object cluster analysis

## Key Indicators of Leaks

- **Survivors**: Objects present in all 3 snapshots after forced GC
- **Growth Pattern**: Object counts increasing between snapshots
- **Detached DOM**: Detached HTML elements (if analyzing browser context)
- **Event Listeners**: Accumulating listeners without removal
- **Closures**: Unreleased closure scopes

## Analysis Output

Results include:
- **Summary**: Top leaked object types with counts and sizes
- **Retainer Chains**: Path from GC roots to leaked objects
- **Growth Rate**: % increase between snapshots
- **Perfetto Trace**: Timeline view for ui.perfetto.dev
- **Recommendations**: Suggested fixes based on patterns

## CLI Tools Used

- `node --inspect` - Enable debugging on target process
- Chrome DevTools Protocol - Heap snapshot capture
- Built-in `v8.writeHeapSnapshot()` - Direct Node.js API

## Example

```
User: "I think my Express server has a memory leak"

Assistant workflow:
1. Check if server is running: `ps aux | grep node`
2. Connect via CDP: Use scripts/heap-capturer.ts
3. Capture snapshot 1 (baseline)
4. Wait 30 seconds / simulate requests
5. Capture snapshot 2
6. Force GC via CDP
7. Capture snapshot 3
8. Run diff analysis using shared/perfetto.ts
9. Present findings with Perfetto trace
```

## Implementation Notes

- Uses `chrome-launcher` and `chrome-remote-interface` for CDP
- Supports both live process analysis and offline snapshot analysis
- Perfetto output includes memory timeline and object retention graph
