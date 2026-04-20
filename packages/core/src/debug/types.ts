/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Debug Adapter Protocol (DAP) types for Terminal Debugging Companion.
 * GSoC 2026 Idea #7
 */

export interface DapMessage {
  seq: number;
  type: 'request' | 'response' | 'event';
}

export interface DapRequest extends DapMessage {
  type: 'request';
  command: string;
  arguments?: Record<string, unknown>;
}

export interface DapResponse extends DapMessage {
  type: 'response';
  request_seq: number;
  command: string;
  success: boolean;
  message?: string;
  body?: Record<string, unknown>;
}

export interface DapEvent extends DapMessage {
  type: 'event';
  event: string;
  body?: Record<string, unknown>;
}

export interface StackFrame {
  id: number;
  name: string;
  source?: Source;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}

export interface Source {
  name?: string;
  path?: string;
  sourceReference?: number;
}

export interface Scope {
  name: string;
  variablesReference: number;
  expensive: boolean;
}

export interface Variable {
  name: string;
  value: string;
  type?: string;
  variablesReference: number;
  evaluateName?: string;
}

export interface Breakpoint {
  id?: number;
  verified: boolean;
  line?: number;
  source?: Source;
  message?: string;
}

export interface Thread {
  id: number;
  name: string;
}

export enum DebugSessionState {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
  Running = 'running',
  Stopped = 'stopped',
  Terminated = 'terminated',
}

export interface DebugAdapterConfig {
  name: string;
  runtime: string;
  program?: string;
  launchCommand: string[];
  attachArgs?: Record<string, unknown>;
  port?: number;
}

export interface BreakpointRequest {
  path: string;
  line: number;
  condition?: string;
  hitCondition?: string;
}
