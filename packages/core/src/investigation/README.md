# Terminal-Integrated Performance & Memory Investigation Companion

> **GSoC 2026 Prototype** | [Google Issue #23365](https://github.com/google-gemini/gemini-cli/issues/23365) | Author: [@SUNDRAM07](https://github.com/SUNDRAM07)

A comprehensive V8 memory investigation toolkit for the Gemini CLI that transforms opaque heap snapshots into structured, LLM-ready diagnostics. The module provides zero-config memory leak detection, allocation profiling, GC pressure analysis, and regression guarding — all from within the terminal.

---

## Architecture

<p align="center">
  <img src="./docs/images/architecture-diagram-v2.png" alt="System Architecture" width="700"/>
</p>

The system follows a layered pipeline design:

```
Heap Snapshot (.heapsnapshot)
    |
    v
HeapSnapshotAnalyzer ──> ClassSummary[], LeakReport, DominatorTree
    |                         |                |
    v                         v                v
RootCauseAnalyzer      SmartDiff          TrendForecaster
    |                     |                    |
    v                     v                    v
LLMExplainer ──────> Structured Prompts ──> Gemini (weeks 7-8)
    |
    v
PerfettoExporter ──> Chrome Trace Events ──> Perfetto UI / SQL
```

---

## Modules at a Glance

| Module | Lines | Purpose |
|--------|------:|---------|
| `heapSnapshotAnalyzer` | 1,043 | Parse V8 `.heapsnapshot`, extract class summaries, detect leaks, build dominator trees |
| `llmExplainer` | 1,055 | Generate structured prompts for Gemini, parse responses, local heuristic fallback |
| `gcPressureAnalyzer` | 896 | Analyze GC events, detect thrashing/long pauses, V8 tuning recommendations |
| `allocationHotspotProfiler` | 826 | Identify allocation hotspots, storm detection, flamegraph generation |
| `rootCauseAnalyzer` | 822 | 9 pattern detectors with confidence scoring (closures, DOM detach, timers, etc.) |
| `memoryRegressionGuard` | 809 | Fingerprint heaps, detect regressions in CI, trend analysis, budget enforcement |
| `smartDiff` | 761 | Structural diff of heap snapshots with growth/shrink classification |
| `trendForecaster` | 720 | Time-series forecasting for heap growth, OOM prediction |
| `perfettoSqlIntegration` | 664 | Load Chrome traces, run SQL queries via Perfetto engine |
| `investigationTool` | 609 | Orchestrator — wires all modules into a single `investigate` command |
| `cdpClient` | 581 | Chrome DevTools Protocol client with 3-snapshot leak capture |
| `flameGraphGenerator` | 548 | Generate interactive flamegraphs from allocation profiles |
| `tokenEfficiencyBenchmark` | 514 | Measure token compression ratios for LLM context efficiency |
| `perfettoExporter` | 489 | Export leak reports, class summaries, CPU profiles to Perfetto format |
| `index` | 151 | Public API barrel exports |
| **Source Total** | **10,488** | |
| **Tests (15 files)** | **6,926** | |
| **Grand Total** | **17,414** | |

---

## Key Features

### 3-Snapshot Leak Detection

The CDP client captures three heap snapshots with forced GC between each, then cross-references surviving objects to eliminate false positives.

<p align="center">
  <img src="./docs/images/screenshot-3snapshot.png" alt="3-Snapshot Leak Detection" width="680"/>
</p>

```typescript
import { CDPClient, HeapSnapshotAnalyzer } from './investigation';

const client = new CDPClient();
await client.connect('ws://localhost:9229');

// Captures 3 snapshots with GC between each
const { snapshots, leaks } = await client.threeSnapshotCapture();

// Objects surviving all 3 snapshots are true leaks
const leakReport = HeapSnapshotAnalyzer.detectLeaks(
  snapshots[0], snapshots[1], snapshots[2]
);
```

### 9 Root-Cause Pattern Detectors

Each detector returns a confidence score (0-1) and structured evidence:

<p align="center">
  <img src="./docs/images/screenshot-rootcause.png" alt="Root Cause Analysis" width="680"/>
</p>

```typescript
import { RootCauseAnalyzer } from './investigation';

const rca = new RootCauseAnalyzer();
const causes = rca.analyzeSnapshot(classSummaries, snapshot.nodeCount);

// Returns: [
//   { pattern: 'unbounded-collection', confidence: 0.92, evidence: {...} },
//   { pattern: 'closure-capture', confidence: 0.78, evidence: {...} },
//   ...
// ]
```

**Detectors:** Event Listener Leaks, Unbounded Collections, Closure Captures, String Accumulation, Buffer Accumulation, Large Retained Trees, Excessive Allocations, Detached DOM, Timer Leaks

### Perfetto Trace Integration

Export investigation data as Chrome Trace Events and query with SQL:

<p align="center">
  <img src="./docs/images/screenshot-perfetto.png" alt="Perfetto Integration" width="680"/>
</p>

```typescript
import { PerfettoExporter, PerfettoSqlIntegration } from './investigation';

const exporter = new PerfettoExporter();
const trace = exporter.exportLeakReport(leakReport);
const classTrace = exporter.exportClassSummaries(summaries);

const sql = new PerfettoSqlIntegration();
await sql.loadTrace(trace);
const results = await sql.query('SELECT name, size FROM heap_classes ORDER BY size DESC LIMIT 10');
```

### CDP Client with Live Debugging

<p align="center">
  <img src="./docs/images/screenshot-cdp.png" alt="CDP Client" width="680"/>
</p>

```typescript
const targets = await CDPClient.discoverTargets('localhost', 9229);
const client = new CDPClient();
await client.connect(targets[0].webSocketDebuggerUrl);

const state = await client.getState();       // Connection + heap state
const usage = await client.getHeapUsage();    // Live heap metrics
const snap  = await client.takeHeapSnapshot(); // Full snapshot capture
```

### Token Efficiency: 85,106x Compression

V8 heap snapshots are massive — a 302MB snapshot contains ~79M raw tokens. The structured analysis pipeline compresses this to ~930 tokens while preserving all diagnostic value:

```
Raw .heapsnapshot:  302 MB  (79,148,821 tokens)
Structured output:  ~930 tokens
Compression:        85,106x
```

This means a full memory investigation fits comfortably within a single LLM context window, enabling the Gemini agent to reason about heap state without token budget issues.

### GC Pressure Analysis

```typescript
import { GCPressureAnalyzer } from './investigation';

const analyzer = new GCPressureAnalyzer();
const events = GCPressureAnalyzer.parseTraceEvents(chromeTraceData);
const report = analyzer.analyze(events, wallTimeMs);

// report.healthScore: 0-100
// report.patterns: [{ pattern: 'gc-thrashing', severity: 'critical', ... }]
// report.recommendations: [{ text: 'Increase --max-semi-space-size', priority: 'high' }]
```

### Memory Regression Guard (CI Integration)

```typescript
import { MemoryRegressionGuard } from './investigation';

const guard = new MemoryRegressionGuard();
const fingerprint = guard.createFingerprint(classSummaries);

guard.setBaseline('main', fingerprint);

// On PR:
const result = guard.checkRegression('main', newFingerprint);
// result.status: 'pass' | 'warning' | 'failure'
// result.summary: "Heap grew 23% (10MB → 12.3MB) — 2 new classes detected"

// GitHub Actions integration:
const annotations = guard.toGitHubAnnotations(result);
const ciReport = guard.toCIReport(result);
```

---

## Test Coverage

All 15 test files pass with **410+ tests** covering every public API:

<p align="center">
  <img src="./docs/images/screenshot-tests-v3.png" alt="Test Results" width="680"/>
</p>

```bash
# Run all investigation tests
npx vitest run packages/core/src/investigation/ --reporter=verbose

# Run specific module tests
npx vitest run packages/core/src/investigation/heapSnapshotAnalyzer.test.ts
```

| Test Suite | Tests | Coverage |
|-----------|------:|----------|
| heapSnapshotAnalyzer | 62 | Parsing, class summaries, leak detection, dominator trees |
| rootCauseAnalyzer | 45 | All 9 pattern detectors, confidence scoring |
| cdpClient | 38 | Connection, snapshots, 3-snapshot capture, error handling |
| smartDiff | 35 | Structural diffs, growth classification, edge cases |
| llmExplainer | 32 | Prompt generation, response parsing, local analysis |
| trendForecaster | 30 | Forecasting, OOM prediction, trend detection |
| gcPressureAnalyzer | 28 | GC events, pattern detection, health scoring |
| allocationHotspotProfiler | 25 | Hotspots, storms, category classification |
| perfettoExporter | 22 | Trace export, format validation |
| memoryRegressionGuard | 20 | Fingerprinting, regression detection, CI output |
| tokenEfficiencyBenchmark | 18 | Compression ratios, benchmark validation |
| flameGraphGenerator | 15 | SVG generation, folded stacks |
| perfettoSqlIntegration | 14 | SQL queries, trace loading |
| investigationTool | 12 | Orchestration, end-to-end flows |
| real-integration | 14 | Cross-module integration scenarios |

---

## GSoC Issue #23365 Deliverable Mapping

| Deliverable | Status | Module |
|-------------|--------|--------|
| Parse V8 heap snapshots | Done | `heapSnapshotAnalyzer` |
| Identify memory leaks | Done | `heapSnapshotAnalyzer.detectLeaks()` + `cdpClient.threeSnapshotCapture()` |
| Root cause analysis | Done | `rootCauseAnalyzer` (9 detectors) |
| Suggest fixes | Done | `llmExplainer` (prompt gen) + `rootCauseAnalyzer` (heuristic fixes) |
| Integrate with Gemini CLI | Done | `investigationTool` registered as tool |
| Visualize with Perfetto | Done | `perfettoExporter` + `perfettoSqlIntegration` |

---

## Quick Start

```typescript
import { InvestigationTool } from './investigation';

const tool = new InvestigationTool();

// Full investigation from a heap snapshot file
const report = await tool.investigate({
  snapshotPath: './heap-snapshot.heapsnapshot',
  previousSnapshotPath: './baseline.heapsnapshot', // optional
  format: 'terminal', // or 'json', 'perfetto'
});

console.log(report);
```

---

## Pull Requests

| PR | Title | Status |
|----|-------|--------|
| [#24121](https://github.com/google-gemini/gemini-cli/pull/24121) | [GSoC 2026] Terminal-Integrated Performance & Memory Investigation Companion — Prototype | Open |
| [#20004](https://github.com/google-gemini/gemini-cli/pull/20004) | fix: trap SIGHUP in shell execution to prevent WSL2 signal 1 termination | Open |
| [#24119](https://github.com/google-gemini/gemini-cli/pull/24119) | [GSoC 2026] Terminal-Integrated Performance & Memory Investigation Companion — Prototype | Closed |
| [#22472](https://github.com/google-gemini/gemini-cli/pull/22472) | feat(debug): add Debug Companion — AI-powered debugging for Gemini CLI | Closed |
| [#22469](https://github.com/google-gemini/gemini-cli/pull/22469) | feat(debug): add Debug Companion — AI-powered debugging for Gemini CLI | Closed |
| [#21262](https://github.com/google-gemini/gemini-cli/pull/21262) | feat(telemetry): performance monitoring dashboard with cost estimation and export | Closed |
| [#21074](https://github.com/google-gemini/gemini-cli/pull/21074) | fix(core): generalize structuredContent fix for all MCP servers | Closed |
| [#20954](https://github.com/google-gemini/gemini-cli/pull/20954) | fix(core): use platform-aware command separator in git prompt | Closed |
| [#20862](https://github.com/google-gemini/gemini-cli/pull/20862) | fix(cli): emit STREAM_JSON event for AgentExecutionBlocked in non-interactive mode | Closed |
| [#20699](https://github.com/google-gemini/gemini-cli/pull/20699) | fix(policy): reject policy entries with unknown fields | Closed |
| [#20454](https://github.com/google-gemini/gemini-cli/pull/20454) | fix: add missing JSON output for AgentExecutionStopped in non-interactive mode | Closed |
| [#20185](https://github.com/google-gemini/gemini-cli/pull/20185) | fix: handle STREAM_JSON output format in validateNonInteractiveAuth | Closed |
| [#19935](https://github.com/google-gemini/gemini-cli/pull/19935) | fix(core): parse callCommand with shell-quote matching discoveryCommand | Closed |

---

## License

```
Copyright 2026 Google LLC
SPDX-License-Identifier: Apache-2.0
```
