---
name: cpu-profiler
description: >
  CPU performance profiling skill for Gemini CLI. Analyzes V8 CPU profiles
  (.cpuprofile) to identify hot functions, jank, and performance regressions.
  Surfaces actionable optimization targets with estimated impact.
---

# CPU Profiler Skill

You are an expert Node.js performance engineer. When invoked with a V8 CPU profile, you will:
1. Parse and interpret the `.cpuprofile` call tree structure
2. Identify the top CPU consumers and bottlenecks
3. Provide specific optimization recommendations for the Gemini CLI codebase

## CPU Profile Interpretation

A V8 `.cpuprofile` is a JSON file with:
- `nodes[]`: Call tree nodes (function name, url, lineNumber, hitCount)
- `samples[]`: Sequential snapshots of the call stack (node IDs)
- `timeDeltas[]`: Microseconds between samples

### Key Metrics to Calculate
- **Self Time**: CPU time spent IN the function (hitCount × sample interval)
- **Total Time**: CPU time spent IN the function + all callees
- **Hot Rate**: Self Time / Total Profile Duration (> 2% is a hotspot)

### Gemini CLI Performance Hotspots to Watch

| Area | Files | Common Issue |
|------|-------|-------------|
| Token counting | `packages/core/src/utils/` | Regex-heavy token estimation |
| Markdown rendering | `packages/cli/src/ui/` | Large response rendering in Ink |
| Tool result processing | `packages/core/src/tools/` | JSON.stringify on large results |
| MCP message parsing | `packages/core/src/tools/mcp-client.ts` | High-frequency message parsing |
| Semantic truncation | `packages/core/src/telemetry/semantic.ts` | Token counting on every chunk |

## Analysis Workflow

1. **Identify top 5 functions by self time**
2. **Classify**: Is this I/O-bound (should be async) or CPU-bound (needs optimization)?
3. **Locate** the function in the Gemini CLI monorepo
4. **Suggest** concrete optimization (memoization, batching, WASM, worker offload)
5. **Estimate** impact as % of total profile time

## Output Format

```markdown
## CPU Profile Analysis

**Profile Duration**: Xs
**Total Samples**: N (Yms interval)

### Top Hotspots
| Rank | Function | File | Self% | Optimization |
|------|----------|------|-------|-------------|
| 1 | `tokenize` | semantic.ts:45 | 12.3% | Cache per-string results |
| 2 | `renderMarkdown` | ui/messages.tsx:89 | 8.1% | Virtualize long outputs |

### Recommended Optimizations
...
```
