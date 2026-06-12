# perf-companion

Terminal-integrated performance and memory investigation engine for Gemini CLI.
Implements the 3-snapshot heap leak detection workflow, CDP-based external
process profiling, retainer chain extraction, root cause classification, and
Perfetto trace export.

## Architecture

```
capture/          CDP WebSocket client + snapshot/profile capture
parse/            Streaming V8 .heapsnapshot parser (handles 200MB+ files)
analyze/          3-snapshot diff, noise filter, retainer chains, root cause
format/           Perfetto Chrome Trace JSON export
bridge/           LLM-optimized output formatting
security/         Loopback enforcement, CDP method allowlist, sensitive data scan
```

## Integration status

This directory contains the type definitions and error classes for the engine.
The remaining modules (capture, parse, analyze, format, bridge, security) are in
the standalone prototype and will be moved here during GSoC integration.

Tool registration (`BaseDeclarativeTool` wrappers in `tools/`) and skill
definitions (`skills/builtin/memory-investigator/`,
`skills/builtin/cpu-profiler/`) are part of the GSoC 2026 integration milestone.

## Dogfood validation

Validated against gemini-cli v0.36.0-nightly:

| Metric              | Value                     |
| ------------------- | ------------------------- |
| Heap snapshot       | 89.1 MB parsed in 1.7s    |
| Nodes               | 885,800                   |
| Edges               | 4,111,751                 |
| Total retained heap | 109.4 MB                  |
| Detached DOM nodes  | 1,894 (Ink/React layer)   |
| Sensitive strings   | 9 (5 API key, 4 password) |

## Related issue

[#23365](https://github.com/google-gemini/gemini-cli/issues/23365)

## Prototype

[gemini-cli-perf-companion](https://github.com/Anjaligarhwal/gemini-cli-perf-companion)
-- 301 tests, zero runtime dependencies.
