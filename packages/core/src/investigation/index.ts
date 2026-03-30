/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
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

export {
  TokenEfficiencyBenchmark,
  type HeapScenario,
  type TokenCost,
  type ReductionMetrics,
  type BenchmarkReport,
  type PerfettoComparison,
  type LLMPromptReductionData,
} from './tokenEfficiencyBenchmark.js';

export {
  StreamingHeapParser,
  parseHeapSnapshot,
  type StreamingParseProgress,
  type StreamingParserOptions,
} from './streamingHeapParser.js';

export {
  PerfettoSqlIntegration,
  SqlParser,
  QueryExecutor,
  type QueryResult,
  type TraceRow,
  type SqlParseResult,
  type WhereClause,
  type OrderByClause,
} from './perfettoSqlIntegration.js';
