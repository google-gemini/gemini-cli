/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SessionMetrics } from '../telemetry/uiTelemetry.js';

export enum OutputFormat {
  TEXT = 'text',
  JSON = 'json',
  STREAM_JSON = 'stream-json',
}

export interface JsonError {
  type: string;
  message: string;
  code?: string | number;
}

export interface JsonOutput {
  session_id?: string;
  auth_method?: string;
  user_tier?: string;
  response?: string;
  stats?: SessionMetrics;
  error?: JsonError;
}

// Streaming JSON event types
export enum JsonStreamEventType {
  INIT = 'init',
  MESSAGE = 'message',
  TOOL_USE = 'tool_use',
  TOOL_RESULT = 'tool_result',
  ERROR = 'error',
  RESULT = 'result',
  RETRY = 'retry',
  LOOP_DETECTED = 'loop_detected',
}

export interface BaseJsonStreamEvent {
  type: JsonStreamEventType;
  timestamp: string;
}

export interface InitEvent extends BaseJsonStreamEvent {
  type: JsonStreamEventType.INIT;
  session_id: string;
  model: string;
  auth_method?: string;
  user_tier?: string;
}

export interface MessageEvent extends BaseJsonStreamEvent {
  type: JsonStreamEventType.MESSAGE;
  role: 'user' | 'assistant';
  content: string;
  delta?: boolean;
}

export interface ToolUseEvent extends BaseJsonStreamEvent {
  type: JsonStreamEventType.TOOL_USE;
  tool_name: string;
  tool_id: string;
  parameters: Record<string, unknown>;
}

export interface ToolResultEvent extends BaseJsonStreamEvent {
  type: JsonStreamEventType.TOOL_RESULT;
  tool_id: string;
  status: 'success' | 'error';
  output?: string;
  error?: {
    type: string;
    message: string;
  };
}

export interface ErrorEvent extends BaseJsonStreamEvent {
  type: JsonStreamEventType.ERROR;
  severity: 'warning' | 'error';
  message: string;
}

export interface StreamStats {
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  // Breakdown of input_tokens
  cached: number;
  input: number;
  duration_ms: number;
  tool_calls: number;
  api_requests?: number;
  api_errors?: number;
  retry_count?: number;
}

export interface ResultEvent extends BaseJsonStreamEvent {
  type: JsonStreamEventType.RESULT;
  status: 'success' | 'error';
  error?: {
    type: string;
    message: string;
  };
  stats?: StreamStats;
}

export interface RetryEvent extends BaseJsonStreamEvent {
  type: JsonStreamEventType.RETRY;
  attempt: number;
  max_attempts: number;
  delay_ms: number;
  error?: string;
  model: string;
}

export interface LoopDetectedStreamEvent extends BaseJsonStreamEvent {
  type: JsonStreamEventType.LOOP_DETECTED;
  loop_type?: string;
}

export type JsonStreamEvent =
  | InitEvent
  | MessageEvent
  | ToolUseEvent
  | ToolResultEvent
  | ErrorEvent
  | ResultEvent
  | RetryEvent
  | LoopDetectedStreamEvent;
