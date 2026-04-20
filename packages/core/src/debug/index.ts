/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export { DapClient } from './dapClient.js';
export {
  analyzeStackTrace,
  formatVariablesForDisplay,
  formatStackForDisplay,
} from './stackAnalyzer.js';
export type { StackAnalysis } from './stackAnalyzer.js';
export {
  BUILTIN_ADAPTERS,
  getAdapterForRuntime,
  detectRuntime,
} from './adapters.js';
export { DebugSessionState } from './types.js';
export type {
  DapMessage,
  DapRequest,
  DapResponse,
  DapEvent,
  StackFrame,
  Source,
  Scope,
  Variable,
  Breakpoint,
  Thread,
  DebugAdapterConfig,
  BreakpointRequest,
} from './types.js';
