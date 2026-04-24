---
name: cpu-profiler
description: CPU profiling and performance analysis for Node.js applications. Captures CPU profiles, analyzes hot paths, detects performance regressions, and generates Perfetto traces for timeline visualization.
---

# CPU Profiler Skill

Performance profiling and analysis for Node.js applications.

## Capabilities

- **CPU Sampling**: Capture CPU profiles at configurable intervals
- **Hot Path Analysis**: Identify functions consuming most CPU time
- **Regression Detection**: Compare profiles to detect performance degradation
- **Flame Graph Generation**: Visual representation of call stacks
- **Perfetto Integration**: Timeline view for detailed analysis
- **Async Tracking**: Follow async operations and event loop delays

## Usage

```bash
# Profile running process
@cpu-profiler capture --pid 12345 --duration 10000 --output profile.cpuprofile

# Profile and generate flame graph
@cpu-profiler flame --pid 12345 --duration 5000 --output flame.svg

# Compare two profiles for regression
@cpu-profiler compare --baseline baseline.cpuprofile --current current.cpuprofile

# Detect event loop blocking
@cpu-profiler event-loop --pid 12345 --duration 30000

# Generate Perfetto trace from profile
@cpu-profiler to-perfetto --input profile.cpuprofile --output trace.json
```

## Analysis Dimensions

### 1. Self vs Total Time
- **Self Time**: Time spent in function itself (excluding callees)
- **Total Time**: Time including all called functions

High self time = function itself is slow
High total time = function calls slow code

### 2. Hot Paths
Most frequently executed call chains:
```
48%  handleRequest → processQuery → database.query
23%  renderComponent → ReactDOM.render → flushSync
15%  processMessage → JSON.parse → validateSchema
```

### 3. Async Patterns
- Event loop delay spikes
- Promise resolution times
- Async/await overhead
- Callback queue depth

### 4. Regression Detection
Comparing profiles:
```
Function               Baseline    Current    Change
--------------------- ---------- ---------- --------
database.query        200ms      850ms      +325% 
JSON.parse            50ms       52ms       +4%
renderTemplate        120ms      125ms      +4%

database.query shows significant regression
```

## Output Formats

### Summary Report
```
CPU Profile Analysis
====================
Duration: 10,000ms
Samples: 4,523

Top by Self Time:
1. database.query (3400 samples, 75.2%)
2. JSON.stringify (234 samples, 5.2%)
3. crypto.hash (189 samples, 4.2%)

Top by Total Time:
1. handleRequest (4300 samples, 95.1%)
2. processQuery (4100 samples, 90.7%)
3. database.query (3400 samples, 75.2%)

Recommendations:
- Optimize database.query (75% of CPU time)
- Consider query caching
- Check for N+1 query pattern
```

### Perfetto Trace
Timeline view showing:
- Function call stacks over time
- CPU utilization per thread
- Event loop phases
- Async operation boundaries
- GC pauses

### Flame Graph
SVG visualization:
- Width = time spent
- Color = hot/cold
- Height = call stack depth
- Click to zoom

## Example Workflows

### Performance Regression Investigation
```
User: "The API is slower after the last deploy"

1. Profile current: @cpu-profiler capture --pid $PID --duration 10000 --output current.cpuprofile
2. Get baseline from git: git show HEAD~1:profile.cpuprofile > baseline.cpuprofile
3. Compare: @cpu-profiler compare --baseline baseline.cpuprofile --current current.cpuprofile
4. Result: database.query increased from 200ms to 850ms
5. Check query: @node-debugger batch --breakpoints "db.js:45" --capture-console
6. Find: Missing index on new query pattern
```

### Event Loop Blocking
```
User: "The server has latency spikes"

1. Monitor event loop: @cpu-profiler event-loop --pid $PID --duration 60000
2. Result: 50ms+ blocks every 5 seconds
3. Profile during block: @cpu-profiler capture --pid $PID --duration 5000
4. Find: Synchronous file read in request handler
5. Fix: Convert to async
```

### Optimization Verification
```
User: "Did my optimization work?"

1. Before: @cpu-profiler capture --pid $PID --duration 10000 --output before.cpuprofile
2. Apply optimization
3. After: @cpu-profiler capture --pid $PID --duration 10000 --output after.cpuprofile
4. Compare: @cpu-profiler compare --baseline before.cpuprofile --current after.cpuprofile
5. Report: 40% reduction in hot function self time
```

## Implementation

Uses Node.js --inspect and Chrome DevTools Protocol:
- `Profiler.start` / `Profiler.stop` for CPU profiles
- Custom sampling for event loop monitoring
- Shared `PerfettoTraceBuilder` for trace generation

## Profile Format

Node.js CPU profiles follow Chrome DevTools format:
```json
{
  "nodes": [{ "id": 1, "callFrame": {...}, "children": [2, 3] }],
  "samples": [1, 1, 2, 1, 3, ...],
  "timeDeltas": [100, 50, 100, 100, 50, ...],
  "startTime": 1234567890000,
  "endTime": 1234567900000
}
```

## Best Practices

1. **Profile in production-like conditions**: Real data, real load
2. **Long enough duration**: At least 10 seconds for statistical significance
3. **Multiple samples**: Profile 3 times, look for consistent patterns
4. **Focus on self time**: Functions with high self time are optimization targets
5. **Check call stacks**: High total time may indicate architectural issues

## Scripts

- `scripts/cpu-profile.ts`: CDP-based CPU profiling
- `scripts/flamegraph.ts`: SVG flame graph generation
- `scripts/compare-profiles.ts`: Profile comparison and regression detection
