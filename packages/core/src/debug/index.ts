/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export { DAPClient } from './dapClient.js';
export type {
    DAPMessage, DAPRequest, DAPResponse, DAPEvent,
    Capabilities, ExceptionBreakpointFilter, Breakpoint,
    StackFrame, Source, Scope, Variable, OutputEntry, DAPClientState,
} from './dapClient.js';

export { StackTraceAnalyzer } from './stackTraceAnalyzer.js';
export type { DebugAnalysis, LocationInfo, FrameInfo, VariableInfo, SourceContext } from './stackTraceAnalyzer.js';

export { FixSuggestionEngine } from './fixSuggestionEngine.js';
export type { FixSuggestion, FixSuggestionResult } from './fixSuggestionEngine.js';

export { DebugAdapterRegistry } from './debugAdapterRegistry.js';
export type { AdapterConfig } from './debugAdapterRegistry.js';

export { BreakpointStore } from './breakpointStore.js';
export type { StoredBreakpoint, BreakpointStoreData } from './breakpointStore.js';

export { DebugWorkflowOrchestrator } from './debugWorkflowOrchestrator.js';
export type { DiagnosticReport, DiagnoseOptions } from './debugWorkflowOrchestrator.js';

export { DebugSessionHistory } from './debugSessionHistory.js';
export type { DebugAction, LoopDetection } from './debugSessionHistory.js';

export { WatchExpressionManager } from './watchExpressionManager.js';
export type { WatchExpression, WatchValue, WatchSnapshot } from './watchExpressionManager.js';

export { getDebugSystemPrompt, getDebugCapabilitiesSummary } from './debugPrompt.js';

export { SmartBreakpointSuggester } from './smartBreakpointSuggester.js';
export type { BreakpointSuggestion } from './smartBreakpointSuggester.js';

export { DebugConfigPresets } from './debugConfigPresets.js';
export type { DebugPreset, DetectionRule } from './debugConfigPresets.js';

export { InlineFixPreview } from './inlineFixPreview.js';
export type { FixPreview } from './inlineFixPreview.js';

export { ErrorKnowledgeBase } from './errorKnowledgeBase.js';
export type { KnowledgeEntry } from './errorKnowledgeBase.js';

export { DebugTestGenerator } from './debugTestGenerator.js';
export type { GeneratedTest } from './debugTestGenerator.js';

export { DebugPolicyGuard } from './debugPolicyGuard.js';
export type { RiskLevel, PolicyDecision, PolicyConfig } from './debugPolicyGuard.js';

export { DataBreakpointManager } from './dataBreakpointManager.js';
export type { DataBreakpoint, DataBreakpointInfo, DataAccessType, DebugProtocol } from './dataBreakpointManager.js';

export { PerformanceProfiler } from './performanceProfiler.js';
export type { TimingEntry, FunctionTiming, PerformanceReport } from './performanceProfiler.js';

export { ConditionalStepRunner } from './conditionalStepRunner.js';
export type { StepUntilOptions, StepUntilResult, ExpressionEvaluator, StepController } from './conditionalStepRunner.js';

export { DebugSessionSerializer } from './debugSessionSerializer.js';
export type { DebugSessionSnapshot, SessionEvent } from './debugSessionSerializer.js';

export { SourceMapResolver } from './sourceMapResolver.js';
export type { SourceMapping, SourceMapData } from './sourceMapResolver.js';

export { DebugInputSanitizer } from './debugInputSanitizer.js';
export type { SanitizeResult, SanitizeOptions } from './debugInputSanitizer.js';

export { DebugTelemetryCollector } from './debugTelemetryCollector.js';
export type { ToolMetric, SessionMetric, TelemetrySummary } from './debugTelemetryCollector.js';

export { ExceptionBreakpointManager } from './exceptionBreakpointManager.js';
export type { ExceptionFilter, ExceptionBreakpoint, ExceptionBreakpointResult, ExceptionInfo } from './exceptionBreakpointManager.js';

export { VariableDiffTracker } from './variableDiffTracker.js';
export type { VariableSnapshot, VariableChange, SnapshotDiff, VariableTimeline } from './variableDiffTracker.js';

export { DebugSessionStateMachine, DebugState } from './debugSessionStateMachine.js';
export type { StateTransition, StateChangeListener } from './debugSessionStateMachine.js';

export { AdapterProcessManager } from './adapterProcessManager.js';
export type { AdapterLanguage, AdapterSpawnConfig, RunningAdapter, AdapterCheckResult } from './adapterProcessManager.js';

export { DebugContextBuilder } from './debugContextBuilder.js';
export type { DebugSnapshot, ContextBuildOptions } from './debugContextBuilder.js';

export { BreakpointValidator } from './breakpointValidator.js';
export type { ValidationResult, FileAnalysis } from './breakpointValidator.js';

export { DebugErrorClassifier, ErrorCategory, ErrorSeverity } from './debugErrorClassifier.js';
export type { ClassifiedError } from './debugErrorClassifier.js';

export { RootCauseAnalyzer, RootCauseType } from './rootCauseAnalyzer.js';
export type { ExceptionInfo as RCAExceptionInfo, RootCauseHypothesis, AnalysisResult } from './rootCauseAnalyzer.js';
