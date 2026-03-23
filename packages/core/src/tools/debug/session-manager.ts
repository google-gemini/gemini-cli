/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared debug session manager — singleton managed across tool invocations.
 *
 * This module provides a single active DAPClient session that all debug tools
 * share. It also exposes the intelligence-layer instances (StackTraceAnalyzer,
 * FixSuggestionEngine) so that each tool can produce LLM-optimised output.
 */

import type { DAPClient , Breakpoint, StackFrame, Variable } from '../../debug/index.js';
import { StackTraceAnalyzer } from '../../debug/stackTraceAnalyzer.js';
import { FixSuggestionEngine } from '../../debug/fixSuggestionEngine.js';
import type { ToolResult } from '../tools.js';
import { ToolErrorType } from '../tool-error.js';

// ---------------------------------------------------------------------------
// Singleton session
// ---------------------------------------------------------------------------

let activeSession: DAPClient | null = null;

export function getSession(): DAPClient {
  if (!activeSession) {
    throw new Error(
      'No active debug session. Use debug_launch to start one first.',
    );
  }
  return activeSession;
}

export function getActiveSession(): DAPClient | null {
  return activeSession;
}

export function setSession(client: DAPClient): void {
  activeSession = client;
}

export function clearSession(): void {
  activeSession = null;
}

// ---------------------------------------------------------------------------
// Intelligence layer (shared instances)
// ---------------------------------------------------------------------------

export const stackTraceAnalyzer = new StackTraceAnalyzer();
export const fixSuggestionEngine = new FixSuggestionEngine();

/** Track last stop reason for intelligence layer. */
let _lastStopReason = 'entry';

export function getLastStopReason(): string {
  return _lastStopReason;
}

export function setLastStopReason(reason: string): void {
  _lastStopReason = reason;
}

// ---------------------------------------------------------------------------
// Shared formatting helpers
// ---------------------------------------------------------------------------

export function formatStackFrame(frame: StackFrame, index: number): string {
  const location = frame.source?.path
    ? `${frame.source.path}:${String(frame.line)}`
    : '<unknown>';
  return `#${String(index)} ${frame.name} at ${location}`;
}

export function formatVariable(v: Variable): string {
  const typeStr = v.type ? ` (${v.type})` : '';
  return `${v.name}${typeStr} = ${v.value}`;
}

export function formatBreakpoint(bp: Breakpoint): string {
  const verified = bp.verified ? '✓' : '✗';
  return `[${verified}] id=${String(bp.id)} line=${String(bp.line ?? '?')}`;
}

export function errorResult(message: string): ToolResult {
  return {
    llmContent: `Error: ${message}`,
    returnDisplay: 'Debug operation failed.',
    error: {
      message,
      type: ToolErrorType.EXECUTION_FAILED,
    },
  };
}
