/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Lean subset of DAP (Debug Adapter Protocol) type definitions.
 *
 * Based on the official specification:
 * https://microsoft.github.io/debug-adapter-protocol/specification
 *
 * We define our own types instead of importing @vscode/debugadapter to
 * avoid pulling in the full VS Code dependency tree.
 */

// ============================================================================
// Base Protocol Messages
// ============================================================================

export interface DapProtocolMessage {
  seq: number;
  type: 'request' | 'response' | 'event';
}

export interface DapRequest extends DapProtocolMessage {
  type: 'request';
  command: string;
  arguments?: unknown;
}

export interface DapResponse extends DapProtocolMessage {
  type: 'response';
  request_seq: number;
  success: boolean;
  command: string;
  message?: string;
  body?: unknown;
}

export interface DapEvent extends DapProtocolMessage {
  type: 'event';
  event: string;
  body?: unknown;
}

// ============================================================================
// Initialization
// ============================================================================

export interface InitializeRequestArguments {
  clientID?: string;
  clientName?: string;
  adapterID: string;
  linesStartAt1?: boolean;
  columnsStartAt1?: boolean;
  pathFormat?: 'path' | 'uri';
  supportsVariableType?: boolean;
  supportsVariablePaging?: boolean;
  supportsRunInTerminalRequest?: boolean;
  supportsProgressReporting?: boolean;
}

export interface Capabilities {
  supportsConfigurationDoneRequest?: boolean;
  supportsFunctionBreakpoints?: boolean;
  supportsConditionalBreakpoints?: boolean;
  supportsHitConditionalBreakpoints?: boolean;
  supportsEvaluateForHovers?: boolean;
  supportsSetVariable?: boolean;
  supportsStepBack?: boolean;
  supportsRestartFrame?: boolean;
  supportsGotoTargetsRequest?: boolean;
  supportsStepInTargetsRequest?: boolean;
  supportsCompletionsRequest?: boolean;
  supportsTerminateRequest?: boolean;
  supportsDelayedStackTraceLoading?: boolean;
}

// ============================================================================
// Launch / Attach
// ============================================================================

export interface LaunchRequestArguments {
  noDebug?: boolean;
  /** Runtime-specific arguments are spread onto this. */
  [key: string]: unknown;
}

export interface AttachRequestArguments {
  /** Runtime-specific arguments are spread onto this. */
  [key: string]: unknown;
}

export interface DisconnectArguments {
  restart?: boolean;
  terminateDebuggee?: boolean;
}

// ============================================================================
// Breakpoints
// ============================================================================

export interface Source {
  name?: string;
  path?: string;
  sourceReference?: number;
}

export interface SourceBreakpoint {
  line: number;
  column?: number;
  condition?: string;
  hitCondition?: string;
  logMessage?: string;
}

export interface SetBreakpointsArguments {
  source: Source;
  breakpoints?: SourceBreakpoint[];
  sourceModified?: boolean;
}

export interface Breakpoint {
  id?: number;
  verified: boolean;
  message?: string;
  source?: Source;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
}

// ============================================================================
// Execution Control
// ============================================================================

export interface ContinueArguments {
  threadId: number;
}

export interface ContinueResponseBody {
  allThreadsContinued?: boolean;
}

export interface NextArguments {
  threadId: number;
  granularity?: 'statement' | 'line' | 'instruction';
}

export interface StepInArguments {
  threadId: number;
  targetId?: number;
  granularity?: 'statement' | 'line' | 'instruction';
}

export interface StepOutArguments {
  threadId: number;
  granularity?: 'statement' | 'line' | 'instruction';
}

// ============================================================================
// Stack Traces & Threads
// ============================================================================

export interface Thread {
  id: number;
  name: string;
}

export interface StackTraceArguments {
  threadId: number;
  startFrame?: number;
  levels?: number;
}

export interface StackFrame {
  id: number;
  name: string;
  source?: Source;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  moduleId?: number | string;
  presentationHint?: 'normal' | 'label' | 'subtle';
}

export interface StackTraceResponseBody {
  stackFrames: StackFrame[];
  totalFrames?: number;
}

// ============================================================================
// Scopes & Variables
// ============================================================================

export interface ScopesArguments {
  frameId: number;
}

export interface Scope {
  name: string;
  presentationHint?: 'arguments' | 'locals' | 'registers' | string;
  variablesReference: number;
  namedVariables?: number;
  indexedVariables?: number;
  expensive: boolean;
  source?: Source;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
}

export interface VariablesArguments {
  variablesReference: number;
  filter?: 'indexed' | 'named';
  start?: number;
  count?: number;
}

export interface Variable {
  name: string;
  value: string;
  type?: string;
  variablesReference: number;
  namedVariables?: number;
  indexedVariables?: number;
  evaluateName?: string;
  presentationHint?: VariablePresentationHint;
}

export interface VariablePresentationHint {
  kind?: string;
  attributes?: string[];
  visibility?: 'public' | 'private' | 'protected' | 'internal' | 'final';
}

// ============================================================================
// Evaluation
// ============================================================================

export interface EvaluateArguments {
  expression: string;
  frameId?: number;
  context?: 'watch' | 'repl' | 'hover' | 'clipboard' | string;
}

export interface EvaluateResponseBody {
  result: string;
  type?: string;
  variablesReference: number;
  namedVariables?: number;
  indexedVariables?: number;
  presentationHint?: VariablePresentationHint;
}

// ============================================================================
// Events
// ============================================================================

export interface StoppedEventBody {
  reason:
    | 'step'
    | 'breakpoint'
    | 'exception'
    | 'pause'
    | 'entry'
    | 'goto'
    | 'function breakpoint'
    | 'data breakpoint'
    | 'instruction breakpoint'
    | string;
  description?: string;
  threadId?: number;
  preserveFocusHint?: boolean;
  text?: string;
  allThreadsStopped?: boolean;
  hitBreakpointIds?: number[];
}

export interface TerminatedEventBody {
  restart?: boolean;
}

export interface OutputEventBody {
  category?: 'console' | 'important' | 'stdout' | 'stderr' | 'telemetry';
  output: string;
  group?: 'start' | 'startCollapsed' | 'end';
  variablesReference?: number;
  source?: Source;
  line?: number;
  column?: number;
}

export interface ExitedEventBody {
  exitCode: number;
}

// ============================================================================
// Session Configuration
// ============================================================================

export type DebugRuntime = 'node' | 'python' | 'go';

export interface DebugLaunchConfig {
  runtime: DebugRuntime;
  program: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  stopOnEntry?: boolean;
}

export interface DebugAttachConfig {
  runtime: DebugRuntime;
  host?: string;
  port?: number;
  pid?: number;
}

/** Default debug ports per runtime. */
export const DEFAULT_DEBUG_PORTS: Record<DebugRuntime, number> = {
  node: 9229,
  python: 5678,
  go: 4040,
};
