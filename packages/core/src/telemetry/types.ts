/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface UserPromptEvent {
  'event.name': 'user_prompt';
  'event.timestamp': string; // ISO 8601
  prompt_char_count: number;
  prompt?: string;
}

export interface ToolCallEvent {
  'event.name': 'tool_call';
  'event.timestamp': string; // ISO 8601
  function_name: string;
  function_args: Record<string, unknown>;
  duration_ms: number;
  success: boolean;
  error?: string;
  error_type?: string;
}

export interface ApiRequestEvent {
  'event.name': 'api_request';
  'event.timestamp': string; // ISO 8601
  model: string;
  duration_ms: number;
  input_token_count: number;
}

export interface ApiErrorEvent {
  'event.name': 'api_error';
  'event.timestamp': string; // ISO 8601
  model: string;
  error: string;
  error_type?: string;
  status_code?: number | string;
  duration_ms: number;
  attempt: number;
}

export interface ApiResponseEvent {
  'event.name': 'api_response';
  'event.timestamp': string; // ISO 8601
  model: string;
  status_code?: number | string;
  duration_ms: number;
  error?: string;
  attempt: number;
  output_token_count: number;
  cached_content_token_count: number;
  thoughts_token_count: number;
  tool_token_count: number;
}

export interface CliConfigEvent {
  'event.name': 'cli_config';
  'event.timestamp': string; // ISO 8601
  model: string;
  sandbox_enabled: boolean;
  core_tools_enabled: string;
  approval_mode: string;
  vertex_ai_enabled: boolean;
  log_user_prompts_enabled: boolean;
  file_filtering_respect_git_ignore: boolean;
  file_filtering_allow_build_artifacts: boolean;
}

export type TelemetryEvent =
  | UserPromptEvent
  | ToolCallEvent
  | ApiRequestEvent
  | ApiErrorEvent
  | ApiResponseEvent
  | CliConfigEvent;
