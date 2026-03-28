/**
 * Investigation module — Memory investigation, performance profiling,
 * and diagnostic tooling for Gemini CLI.
 *
 * Core capabilities:
 *   - V8 heap snapshot parsing and 3-snapshot leak detection
 *   - Perfetto-compatible trace export for visualization
 *   - Chrome DevTools Protocol client for batch diagnostic operations
 *   - Automated root-cause analysis with pattern matching
 *   - LLM-powered retainer chain explanation and fix suggestions
 *   - Heap growth trend forecasting with OOM prediction
 *   - Memory allocation flame graph generation (HTML/SVG/ASCII)
 *   - Smart snapshot diffing with change stories and attribution
 *   - Gemini CLI skill wrapper for agent integration
 *
 * Architecture (12 modules):
 *   heapSnapshotAnalyzer      — Parse, diff, and detect leaks in V8 heap snapshots
 *   perfettoExporter          — Export to Perfetto-compatible Chrome Trace Event format
 *   cdpClient                 — Chrome DevTools Protocol client for live debugging
 *   rootCauseAnalyzer         — Pattern-matching root cause analysis (9 detectors)
 *   llmExplainer              — LLM prompt generation for Gemini-powered explanations
 *   trendForecaster           — Statistical trend analysis with OOM time prediction
 *   flameGraphGenerator       — Memory flame graph (HTML/SVG/ASCII/folded stacks)
 *   smartDiff                 — Intelligent snapshot comparison with change stories
 *   gcPressureAnalyzer        — V8 GC tuning advisor with pattern detection [ORIGINAL]
 *   memoryRegressionGuard     — CI/CD memory baseline & regression detection [ORIGINAL]
 *   allocationHotspotProfiler — Allocation rate analysis by call site [ORIGINAL]
 *   investigationTool         — Gemini CLI tool wrapper with stateful executor
 *
 * @module investigation
 */

export {
  HeapSnapshotAnalyzer,
  type RawHeapSnapshot,
  type HeapNode,
  type HeapEdge,
  type HeapNodeType,
  type HeapEdgeType,
  type ClassSummary,
  type SnapshotDiff,
  type DiffEntry,
  type GrowthEntry,
  type RetainerChain,
  type RetainerStep,
  type LeakReport,
  type LeakCandidate,
} from './heapSnapshotAnalyzer.js';

export {
  PerfettoExporter,
  type TraceEvent,
  type PerfettoTrace,
  type PerfettoExportOptions,
  type V8CpuProfile,
  type V8CpuProfileNode,
} from './perfettoExporter.js';

export {
  CDPClient,
  type CDPTarget,
  type CDPClientState,
  type HeapSnapshotProgress,
  type CPUProfileResult,
  type HeapUsage,
  type SamplingHeapProfile,
  type SamplingHeapProfileNode,
} from './cdpClient.js';

export {
  RootCauseAnalyzer,
  type RootCauseReport,
  type RootCauseFinding,
  type Confidence,
  type IssueCategory,
} from './rootCauseAnalyzer.js';

export {
  LLMExplainer,
  type RetainerExplanation,
  type CodeFix,
  type InvestigationNarrative,
  type ActionItem,
  type ConversationState,
  type ConversationTurn,
  type ToolCallRecord,
  type InvestigationContext,
} from './llmExplainer.js';

export {
  TrendForecaster,
  type HeapDataPoint,
  type TrendReport,
  type ClassGrowthEntry,
  type TrendStatistics,
} from './trendForecaster.js';

export {
  FlameGraphGenerator,
  type FlameNode,
  type FlameGraphOptions,
  type FoldedStack,
} from './flameGraphGenerator.js';

export {
  SmartDiffEngine,
  type ChangeStory,
  type DetailedChange,
  type SmartDiffReport,
  type ClassGrowthSummary,
  type GrowthAttribution,
} from './smartDiff.js';

export {
  GCPressureAnalyzer,
  type GCEvent,
  type GCCategorySummary,
  type GCPressurePattern,
  type V8TuningRecommendation,
  type GCHealthReport,
} from './gcPressureAnalyzer.js';

export {
  MemoryRegressionGuard,
  type MemoryFingerprint,
  type ClassFingerprint,
  type RetainerFingerprint,
  type MemoryBudget,
  type RegressionResult,
  type RegressionViolation,
  type FingerprintComparison,
  type BaselineEntry,
  type TrendAnalysis,
} from './memoryRegressionGuard.js';

export {
  AllocationHotspotProfiler,
  type AllocationSample,
  type StackFrame,
  type AllocationNode,
  type AllocationHotspot,
  type AllocationStorm,
  type AllocationProfileReport,
} from './allocationHotspotProfiler.js';

export {
  InvestigationExecutor,
  INVESTIGATION_TOOL_NAME,
  INVESTIGATION_TOOL_DESCRIPTION,
  INVESTIGATION_PARAMETER_SCHEMA,
  type InvestigationAction,
  type InvestigationToolParams,
  type InvestigationResult,
} from './investigationTool.js';
