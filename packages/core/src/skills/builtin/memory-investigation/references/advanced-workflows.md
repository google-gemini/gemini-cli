# Advanced Memory Investigation Workflows

## Trend Forecasting

Use `TrendForecaster` when you have multiple heap data points over time and want to predict when the heap will reach a critical threshold.

### When to use
- User says "my app's memory grows slowly over hours"
- Long-running server with gradual memory increase
- Want to know "when will this OOM?"

### Workflow

1. Collect heap sizes over time (via `capture_memory_report` every N minutes, or from user-provided data points)
2. Use `TrendForecaster.forecast()` with the collected `HeapDataPoint[]` array
3. Report the predicted time-to-threshold and recommended action

### Data format
```ts
interface HeapDataPoint {
  timestamp: number;    // Unix ms
  heapUsed: number;    // bytes
  heapTotal: number;   // bytes
  label?: string;      // optional snapshot label
}
```

### Interpreting forecast output
- `willOOM`: boolean — will the process OOM before `forecastHorizonMs`?
- `estimatedOOMTime`: Date — when OOM is predicted
- `confidenceInterval`: { lower, upper } — uncertainty range
- `recommendation`: string — actionable advice

---

## Memory Regression Guard

Use `MemoryRegressionGuard` to detect when a code change causes memory regressions in CI or pre-release testing.

### When to use
- "Did my PR cause a memory regression?"
- Setting memory budgets per class
- Automated CI memory checks

### Workflow

**Step 1: Save a baseline fingerprint**
```ts
const guard = new MemoryRegressionGuard();
const baseline = guard.createFingerprint(snapshot, 'v1.2.3');
guard.saveBaseline('production', baseline);
```

**Step 2: Compare new snapshot against baseline**
```ts
const result = guard.compareToBaseline('production', newSnapshot);
```

**Step 3: Interpret violations**
```ts
result.violations.forEach(v => {
  // v.className, v.budgetType ('heap' | 'count' | 'growth')
  // v.actual, v.budget, v.severity
});
```

### Setting memory budgets
```ts
const budgets: MemoryBudget[] = [
  { className: 'EventEmitter', maxCount: 1000, maxHeapBytes: 50_000_000 },
  { className: 'Buffer', maxGrowthRate: 0.05 }, // max 5% growth per release
];
const result = guard.compareToBaseline('prod', newSnapshot, budgets);
```

---

## Allocation Hotspot Profiler

Use `AllocationHotspotProfiler` to find the exact call sites allocating the most memory.

### When to use
- "What code is allocating so much memory?"
- Want to know which function is creating the most objects
- Identifying allocation storms (sudden spikes)

### Workflow

1. Capture a sampling heap profile via CDP: `investigate(action="capture_memory_report", port=9229)`
2. The `AllocationHotspotProfiler` processes the sampling data to rank hotspots
3. Output: ranked list of `AllocationHotspot[]` with stack frames, byte counts, and sample rates

### Output fields
```ts
interface AllocationHotspot {
  functionName: string;
  url: string;
  lineNumber: number;
  totalAllocatedBytes: number;
  sampleCount: number;
  selfBytes: number;         // bytes allocated directly (not in callees)
  stackTrace: StackFrame[];
}
```

---

## GC Pressure Analysis

Use `GCPressureAnalyzer` when the process feels slow due to excessive garbage collection.

### When to use
- App is "janky" or has high latency spikes
- "GC is killing performance"
- Want V8 flag recommendations

### Workflow

1. Export a Perfetto trace with GC events: `investigate(action="export_perfetto", include_memory_counters=true)`
2. Parse GC events from the trace
3. `GCPressureAnalyzer.analyze(gcEvents)` returns a `GCHealthReport`

### GCHealthReport fields
- `overallHealth`: 'healthy' | 'moderate' | 'stressed' | 'critical'
- `patterns`: detected GC pressure patterns (e.g., "scavenger thrashing", "major GC domination")
- `v8Tuning`: recommended V8 flags (e.g., `--max-old-space-size`, `--expose-gc`)
- `categorySummary`: breakdown by GC type (Scavenger, MarkSweepCompact, etc.)
