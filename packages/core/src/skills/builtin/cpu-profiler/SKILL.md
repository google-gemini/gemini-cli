---
name: cpu-profiler
description: Profile Node.js CPU usage and identify hot functions. Use when a user reports slow performance, high CPU usage, or wants to find bottleneck functions. Captures V8 CPU profiles via the inspector protocol, ranks functions by self-time, detects GC pressure, and exports Perfetto flame charts.
---

# CPU Profiler

V8 CPU profiling with hot function analysis and flame chart generation.

## Workflow

1. Identify the target Node.js process (self or remote via `--inspect` port)
2. Start the V8 CPU profiler with configurable sampling interval
3. Wait for the specified duration (or until the user says stop)
4. Stop the profiler and retrieve the profile data
5. Analyze:
   - Rank functions by self-time and total-time
   - Detect GC pressure (percentage of time in garbage collection)
   - Break down CPU time by category (user code, node internals, native)
   - Generate Perfetto flame chart for visual exploration
6. Present top-N functions with file:line references and optimization suggestions

## Tools Used

- `cpu_profile_capture` (Kind.Execute) -- records V8 CPU profiles
- `cpu_profile_analyze` (Kind.Read) -- analyzes profiles and generates flame charts

## Output

- **Hot functions** ranked by self-time with script:line references
- **GC pressure** percentage and assessment
- **Category breakdown** (user code vs. node internals vs. native)
- **Perfetto flame chart** (optional) for visual exploration at ui.perfetto.dev

## Example Interaction

User: "My API endpoint is taking 3 seconds to respond, help me find the bottleneck"

1. Connect to the server's inspector endpoint
2. Profile for 10 seconds while user sends requests
3. Report: "72% of CPU time in JSON.parse at api/handler.ts:145.
   The function parses a 12MB response body synchronously on every request.
   Consider streaming the parse or caching the result."
