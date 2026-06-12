---
name: node-debugger
description: Scriptable Node.js debugger skill using --inspect and Chrome DevTools Protocol. Captures heap snapshots, profiles CPU, sets breakpoints in batch mode, and extracts diagnostic data without interactive debugging. Minimizes agent turns by executing command sequences in bulk.
---

# Node.js Debugger Skill

CLI-based debugger skill using Chrome DevTools Protocol (CDP) instead of DAP.

## Philosophy

Unlike DAP-based debugging which requires many agent turns for stepping, this skill:
- Executes command sequences in **bulk/script mode**
- Captures diagnostic data **programmatically**
- Returns **aggregated results** for LLM analysis
- Minimizes back-and-forth by being **scriptable**

## Capabilities

| Feature | Description |
|---------|-------------|
| Heap Snapshots | Capture and analyze memory snapshots |
| CPU Profiling | Profile execution with sampling |
| Coverage | Code coverage analysis |
| Breakpoint Batch | Set multiple breakpoints, run, collect results |
| Console Capture | Capture console output and errors |
| Runtime Evaluation | Execute code in target context |

## Usage

### Heap Operations
```bash
# Capture heap snapshot from running process
@node-debugger heap-snapshot --pid 12345 --output ./snapshot.heapsnapshot

# Force garbage collection then capture
@node-debugger heap-snapshot --pid 12345 --gc-first --output ./snapshot.heapsnapshot
```

### CPU Profiling
```bash
# Profile for 10 seconds
@node-debugger cpu-profile --pid 12345 --duration 10000 --output ./profile.cpuprofile

# Profile specific function execution
@node-debugger cpu-profile --pid 12345 --expression "heavyComputation()" --output ./profile.cpuprofile
```

### Batch Debugging
```bash
# Set breakpoints and run to completion
@node-debugger batch \
  --script ./app.js \
  --breakpoints "src/utils.ts:42,src/api.ts:128" \
  --capture-console \
  --output ./debug-results.json
```

### Coverage Analysis
```bash
# Collect code coverage
@node-debugger coverage \
  --script ./test.js \
  --output ./coverage.json
```

## Workflow Example

```
User: "Debug why my API route is slow"

1. Start target with inspect: node --inspect-brk=9229 server.js
2. @node-debugger cpu-profile --port 9229 --duration 5000 --output api-profile.cpuprofile
3. Results show 80% time in database query
4. @node-debugger heap-snapshot --port 9229 --output api-heap.heapsnapshot
5. Heap analysis shows 10,000 connection objects retained
6. Recommend connection pooling fix
```

## Command Reference

### Connection
- `--pid <number>` - Connect to process by PID
- `--port <number>` - Connect to debugger on port (default 9229)
- `--host <string>` - Debugger host (default localhost)
- `--timeout <number>` - Connection timeout in ms

### Heap Commands
- `heap-snapshot` - Capture heap snapshot
  - `--gc-first` - Force GC before capture
  - `--output <path>` - Save path

### CPU Commands
- `cpu-profile` - Profile CPU usage
  - `--duration <ms>` - Profile duration
  - `--sampling-interval <μs>` - Sample every N microseconds
  - `--expression <code>` - Profile specific expression

### Batch Debugging
- `batch` - Execute debug sequence
  - `--script <path>` - Script to debug
  - `--breakpoints <list>` - Comma-separated file:line pairs
  - `--capture-console` - Capture console output
  - `--capture-exceptions` - Capture exception details
  - `--max-steps <n>` - Max steps before abort

## Output Formats

All commands produce structured JSON for LLM consumption:

```json
{
  "success": true,
  "command": "cpu-profile",
  "duration": 5000,
  "result": {
    "profileFile": "./profile.cpuprofile",
    "summary": {
      "totalSamples": 5234,
      "topFunctions": [
        { "name": "databaseQuery", "self": 3400, "total": 4100 },
        { "name": "handleRequest", "self": 200, "total": 4300 }
      ]
    }
  }
}
```

## Implementation

Uses Chrome Remote Interface (`chrome-remote-interface`):
- Connects to Node.js --inspect
- Programmatically controls debugger
- Executes commands without UI
- Returns structured data

## Comparison: DAP vs This Approach

| Aspect | DAP | This Skill |
|--------|-----|-----------|
| Agent turns | 10-50 for complex debug | 2-3 for bulk execution |
| Human-like? | Mimics IDE debugging | Scriptable automation |
| Best for | Interactive step-through | Diagnostic data collection |
| LLM strength | Weak (sequential steps) | Strong (analyze aggregated data) |

## When to Use

**Use this skill for:**
- Capturing heap snapshots
- CPU profiling
- Coverage analysis
- Batch breakpoint debugging
- Automated diagnostics

**Use DAP for:**
- Interactive step-through debugging
- Complex conditional breakpoints
- Watch expressions requiring UI

## Scripts

Implementation in `scripts/cdp-client.ts`:
- CDP connection management
- Command batching
- Output formatting
- Error handling
