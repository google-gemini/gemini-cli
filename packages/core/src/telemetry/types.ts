/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GenerateContentResponseUsageMetadata } from '@google/genai';
import type { Config } from '../config/config.js';
import type { ApprovalMode } from '../config/config.js';
import type { CompletedToolCall } from '../core/coreToolScheduler.js';
import { DiscoveredMCPTool } from '../tools/mcp-tool.js';
import type { FileDiff } from '../tools/tools.js';
import { AuthType } from '../core/contentGenerator.js';
import {
  getDecisionFromOutcome,
  ToolCallDecision,
} from './tool-call-decision.js';
import type { FileOperation } from './metrics.js';
export { ToolCallDecision };
import type { ToolRegistry } from '../tools/tool-registry.js';
import type { OutputFormat } from '../output/types.js';

export interface BaseTelemetryEvent {
  'event.name': string;
  /** Current timestamp in ISO 8601 format */
  'event.timestamp': string;
}

type CommonFields = keyof BaseTelemetryEvent;

export class StartSessionEvent implements BaseTelemetryEvent {
  'event.name': 'cli_config';
  'event.timestamp': string;
  model: string;
  embedding_model: string;
  sandbox_enabled: boolean;
  core_tools_enabled: string;
  approval_mode: string;
  api_key_enabled: boolean;
  vertex_ai_enabled: boolean;
  debug_enabled: boolean;
  mcp_servers: string;
  telemetry_enabled: boolean;
  telemetry_log_user_prompts_enabled: boolean;
  file_filtering_respect_git_ignore: boolean;
  mcp_servers_count: number;
  mcp_tools_count?: number;
  mcp_tools?: string;
  output_format: OutputFormat;

  constructor(config: Config, toolRegistry?: ToolRegistry) {
    const generatorConfig = config.getContentGeneratorConfig();
    const mcpServers = config.getMcpServers();

    let useGemini = false;
    let useVertex = false;
    if (generatorConfig && generatorConfig.authType) {
      useGemini = generatorConfig.authType === AuthType.USE_GEMINI;
      useVertex = generatorConfig.authType === AuthType.USE_VERTEX_AI;
    }

    this['event.name'] = 'cli_config';
    this.model = config.getModel();
    this.embedding_model = config.getEmbeddingModel();
    this.sandbox_enabled =
      typeof config.getSandbox() === 'string' || !!config.getSandbox();
    this.core_tools_enabled = (config.getCoreTools() ?? []).join(',');
    this.approval_mode = config.getApprovalMode();
    this.api_key_enabled = useGemini || useVertex;
    this.vertex_ai_enabled = useVertex;
    this.debug_enabled = config.getDebugMode();
    this.mcp_servers = mcpServers ? Object.keys(mcpServers).join(',') : '';
    this.telemetry_enabled = config.getTelemetryEnabled();
    this.telemetry_log_user_prompts_enabled =
      config.getTelemetryLogPromptsEnabled();
    this.file_filtering_respect_git_ignore =
      config.getFileFilteringRespectGitIgnore();
    this.mcp_servers_count = mcpServers ? Object.keys(mcpServers).length : 0;
    this.output_format = config.getOutputFormat();
    if (toolRegistry) {
      const mcpTools = toolRegistry
        .getAllTools()
        .filter((tool) => tool instanceof DiscoveredMCPTool);
      this.mcp_tools_count = mcpTools.length;
      this.mcp_tools = mcpTools
        .map((tool) => (tool as DiscoveredMCPTool).name)
        .join(',');
    }
  }
}

export class EndSessionEvent implements BaseTelemetryEvent {
  'event.name': 'end_session';
  'event.timestamp': string;
  session_id?: string;

  constructor(config?: Config) {
    this['event.name'] = 'end_session';
    this['event.timestamp'] = new Date().toISOString();
    this.session_id = config?.getSessionId();
  }
}

export class UserPromptEvent implements BaseTelemetryEvent {
  'event.name': 'user_prompt';
  'event.timestamp': string;
  prompt_length: number;
  prompt_id: string;
  auth_type?: string;
  prompt?: string;

  constructor(
    prompt_length: number,
    prompt_Id: string,
    auth_type?: string,
    prompt?: string,
  ) {
    this['event.name'] = 'user_prompt';
    this['event.timestamp'] = new Date().toISOString();
    this.prompt_length = prompt_length;
    this.prompt_id = prompt_Id;
    this.auth_type = auth_type;
    this.prompt = prompt;
  }
}

export class ToolCallEvent implements BaseTelemetryEvent {
  'event.name': 'tool_call';
  'event.timestamp': string;
  function_name: string;
  function_args: Record<string, unknown>;
  duration_ms: number;
  success: boolean;
  decision?: ToolCallDecision;
  error?: string;
  error_type?: string;
  prompt_id: string;
  tool_type: 'native' | 'mcp';
  content_length?: number;
  mcp_server_name?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: { [key: string]: any };

  constructor(call: CompletedToolCall) {
    this['event.name'] = 'tool_call';
    this['event.timestamp'] = new Date().toISOString();
    this.function_name = call.request.name;
    this.function_args = call.request.args;
    this.duration_ms = call.durationMs ?? 0;
    this.success = call.status === 'success';
    this.decision = call.outcome
      ? getDecisionFromOutcome(call.outcome)
      : undefined;
    this.error = call.response.error?.message;
    this.error_type = call.response.errorType;
    this.prompt_id = call.request.prompt_id;
    this.content_length = call.response.contentLength;
    if (
      typeof call.tool !== 'undefined' &&
      call.tool instanceof DiscoveredMCPTool
    ) {
      this.tool_type = 'mcp';
      this.mcp_server_name = call.tool.serverName;
    } else {
      this.tool_type = 'native';
    }

    if (
      call.status === 'success' &&
      typeof call.response.resultDisplay === 'object' &&
      call.response.resultDisplay !== null &&
      'diffStat' in call.response.resultDisplay
    ) {
      const diffStat = (call.response.resultDisplay as FileDiff).diffStat;
      if (diffStat) {
        this.metadata = {
          model_added_lines: diffStat.model_added_lines,
          model_removed_lines: diffStat.model_removed_lines,
          model_added_chars: diffStat.model_added_chars,
          model_removed_chars: diffStat.model_removed_chars,
          user_added_lines: diffStat.user_added_lines,
          user_removed_lines: diffStat.user_removed_lines,
          user_added_chars: diffStat.user_added_chars,
          user_removed_chars: diffStat.user_removed_chars,
        };
      }
    }
  }
}

export class ApiRequestEvent implements BaseTelemetryEvent {
  'event.name': 'api_request';
  'event.timestamp': string;
  model: string;
  prompt_id: string;
  request_text?: string;

  constructor(model: string, prompt_id: string, request_text?: string) {
    this['event.name'] = 'api_request';
    this['event.timestamp'] = new Date().toISOString();
    this.model = model;
    this.prompt_id = prompt_id;
    this.request_text = request_text;
  }
}

export class ApiErrorEvent implements BaseTelemetryEvent {
  'event.name': 'api_error';
  'event.timestamp': string;
  model: string;
  error: string;
  error_type?: string;
  status_code?: number | string;
  duration_ms: number;
  prompt_id: string;
  auth_type?: string;

  constructor(
    model: string,
    error: string,
    duration_ms: number,
    prompt_id: string,
    auth_type?: string,
    error_type?: string,
    status_code?: number | string,
  ) {
    this['event.name'] = 'api_error';
    this['event.timestamp'] = new Date().toISOString();
    this.model = model;
    this.error = error;
    this.error_type = error_type;
    this.status_code = status_code;
    this.duration_ms = duration_ms;
    this.prompt_id = prompt_id;
    this.auth_type = auth_type;
  }
}

export class ApiResponseEvent implements BaseTelemetryEvent {
  'event.name': 'api_response';
  'event.timestamp': string;
  model: string;
  status_code?: number | string;
  duration_ms: number;
  input_token_count: number;
  output_token_count: number;
  cached_content_token_count: number;
  thoughts_token_count: number;
  tool_token_count: number;
  total_token_count: number;
  response_text?: string;
  prompt_id: string;
  auth_type?: string;

  constructor(
    model: string,
    duration_ms: number,
    prompt_id: string,
    auth_type?: string,
    usage_data?: GenerateContentResponseUsageMetadata,
    response_text?: string,
  ) {
    this['event.name'] = 'api_response';
    this['event.timestamp'] = new Date().toISOString();
    this.model = model;
    this.duration_ms = duration_ms;
    this.status_code = 200;
    this.input_token_count = usage_data?.promptTokenCount ?? 0;
    this.output_token_count = usage_data?.candidatesTokenCount ?? 0;
    this.cached_content_token_count = usage_data?.cachedContentTokenCount ?? 0;
    this.thoughts_token_count = usage_data?.thoughtsTokenCount ?? 0;
    this.tool_token_count = usage_data?.toolUsePromptTokenCount ?? 0;
    this.total_token_count = usage_data?.totalTokenCount ?? 0;
    this.response_text = response_text;
    this.prompt_id = prompt_id;
    this.auth_type = auth_type;
  }
}

export class FlashFallbackEvent implements BaseTelemetryEvent {
  'event.name': 'flash_fallback';
  'event.timestamp': string;
  auth_type: string;

  constructor(auth_type: string) {
    this['event.name'] = 'flash_fallback';
    this['event.timestamp'] = new Date().toISOString();
    this.auth_type = auth_type;
  }
}

export class RipgrepFallbackEvent implements BaseTelemetryEvent {
  'event.name': 'ripgrep_fallback';
  'event.timestamp': string;

  constructor(public error?: string) {
    this['event.name'] = 'ripgrep_fallback';
    this['event.timestamp'] = new Date().toISOString();
  }
}

export enum LoopType {
  CONSECUTIVE_IDENTICAL_TOOL_CALLS = 'consecutive_identical_tool_calls',
  CHANTING_IDENTICAL_SENTENCES = 'chanting_identical_sentences',
  LLM_DETECTED_LOOP = 'llm_detected_loop',
}

export class LoopDetectedEvent implements BaseTelemetryEvent {
  'event.name': 'loop_detected';
  'event.timestamp': string;
  loop_type: LoopType;
  prompt_id: string;

  constructor(loop_type: LoopType, prompt_id: string) {
    this['event.name'] = 'loop_detected';
    this['event.timestamp'] = new Date().toISOString();
    this.loop_type = loop_type;
    this.prompt_id = prompt_id;
  }
}

export class LoopDetectionDisabledEvent implements BaseTelemetryEvent {
  'event.name': 'loop_detection_disabled';
  'event.timestamp': string;
  prompt_id: string;

  constructor(prompt_id: string) {
    this['event.name'] = 'loop_detection_disabled';
    this['event.timestamp'] = new Date().toISOString();
    this.prompt_id = prompt_id;
  }
}

export class NextSpeakerCheckEvent implements BaseTelemetryEvent {
  'event.name': 'next_speaker_check';
  'event.timestamp': string;
  prompt_id: string;
  finish_reason: string;
  result: string;

  constructor(prompt_id: string, finish_reason: string, result: string) {
    this['event.name'] = 'next_speaker_check';
    this['event.timestamp'] = new Date().toISOString();
    this.prompt_id = prompt_id;
    this.finish_reason = finish_reason;
    this.result = result;
  }
}

export interface SlashCommandEvent extends BaseTelemetryEvent {
  'event.name': 'slash_command';
  'event.timestamp': string;
  command: string;
  subcommand?: string;
  status?: SlashCommandStatus;
}

export function makeSlashCommandEvent({
  command,
  subcommand,
  status,
}: Omit<SlashCommandEvent, CommonFields>): SlashCommandEvent {
  return {
    'event.name': 'slash_command',
    'event.timestamp': new Date().toISOString(),
    command,
    subcommand,
    status,
  };
}

export enum SlashCommandStatus {
  SUCCESS = 'success',
  ERROR = 'error',
}

export interface ChatCompressionEvent extends BaseTelemetryEvent {
  'event.name': 'chat_compression';
  'event.timestamp': string;
  tokens_before: number;
  tokens_after: number;
}

export function makeChatCompressionEvent({
  tokens_before,
  tokens_after,
}: Omit<ChatCompressionEvent, CommonFields>): ChatCompressionEvent {
  return {
    'event.name': 'chat_compression',
    'event.timestamp': new Date().toISOString(),
    tokens_before,
    tokens_after,
  };
}

export class MalformedJsonResponseEvent implements BaseTelemetryEvent {
  'event.name': 'malformed_json_response';
  'event.timestamp': string;
  model: string;

  constructor(model: string) {
    this['event.name'] = 'malformed_json_response';
    this['event.timestamp'] = new Date().toISOString();
    this.model = model;
  }
}

export enum IdeConnectionType {
  START = 'start',
  SESSION = 'session',
}

export class IdeConnectionEvent {
  'event.name': 'ide_connection';
  'event.timestamp': string;
  connection_type: IdeConnectionType;

  constructor(connection_type: IdeConnectionType) {
    this['event.name'] = 'ide_connection';
    this['event.timestamp'] = new Date().toISOString();
    this.connection_type = connection_type;
  }
}

export class ConversationFinishedEvent {
  'event_name': 'conversation_finished';
  'event.timestamp': string; // ISO 8601;
  approvalMode: ApprovalMode;
  turnCount: number;

  constructor(approvalMode: ApprovalMode, turnCount: number) {
    this['event_name'] = 'conversation_finished';
    this['event.timestamp'] = new Date().toISOString();
    this.approvalMode = approvalMode;
    this.turnCount = turnCount;
  }
}

export class KittySequenceOverflowEvent {
  'event.name': 'kitty_sequence_overflow';
  'event.timestamp': string; // ISO 8601
  sequence_length: number;
  truncated_sequence: string;
  constructor(sequence_length: number, truncated_sequence: string) {
    this['event.name'] = 'kitty_sequence_overflow';
    this['event.timestamp'] = new Date().toISOString();
    this.sequence_length = sequence_length;
    // Truncate to first 20 chars for logging (avoid logging sensitive data)
    this.truncated_sequence = truncated_sequence.substring(0, 20);
  }
}

export class FileOperationEvent implements BaseTelemetryEvent {
  'event.name': 'file_operation';
  'event.timestamp': string;
  tool_name: string;
  operation: FileOperation;
  lines?: number;
  mimetype?: string;
  extension?: string;
  programming_language?: string;

  constructor(
    tool_name: string,
    operation: FileOperation,
    lines?: number,
    mimetype?: string,
    extension?: string,
    programming_language?: string,
  ) {
    this['event.name'] = 'file_operation';
    this['event.timestamp'] = new Date().toISOString();
    this.tool_name = tool_name;
    this.operation = operation;
    this.lines = lines;
    this.mimetype = mimetype;
    this.extension = extension;
    this.programming_language = programming_language;
  }
}

// Add these new event interfaces
export class InvalidChunkEvent implements BaseTelemetryEvent {
  'event.name': 'invalid_chunk';
  'event.timestamp': string;
  error_message?: string; // Optional: validation error details

  constructor(error_message?: string) {
    this['event.name'] = 'invalid_chunk';
    this['event.timestamp'] = new Date().toISOString();
    this.error_message = error_message;
  }
}

export class ContentRetryEvent implements BaseTelemetryEvent {
  'event.name': 'content_retry';
  'event.timestamp': string;
  attempt_number: number;
  error_type: string; // e.g., 'EmptyStreamError'
  retry_delay_ms: number;

  constructor(
    attempt_number: number,
    error_type: string,
    retry_delay_ms: number,
  ) {
    this['event.name'] = 'content_retry';
    this['event.timestamp'] = new Date().toISOString();
    this.attempt_number = attempt_number;
    this.error_type = error_type;
    this.retry_delay_ms = retry_delay_ms;
  }
}

export class ContentRetryFailureEvent implements BaseTelemetryEvent {
  'event.name': 'content_retry_failure';
  'event.timestamp': string;
  total_attempts: number;
  final_error_type: string;
  total_duration_ms?: number; // Optional: total time spent retrying

  constructor(
    total_attempts: number,
    final_error_type: string,
    total_duration_ms?: number,
  ) {
    this['event.name'] = 'content_retry_failure';
    this['event.timestamp'] = new Date().toISOString();
    this.total_attempts = total_attempts;
    this.final_error_type = final_error_type;
    this.total_duration_ms = total_duration_ms;
  }
}

export class ModelRoutingEvent implements BaseTelemetryEvent {
  'event.name': 'model_routing';
  'event.timestamp': string;
  decision_model: string;
  decision_source: string;
  routing_latency_ms: number;
  reasoning?: string;
  failed: boolean;
  error_message?: string;

  constructor(
    decision_model: string,
    decision_source: string,
    routing_latency_ms: number,
    reasoning: string | undefined,
    failed: boolean,
    error_message: string | undefined,
  ) {
    this['event.name'] = 'model_routing';
    this['event.timestamp'] = new Date().toISOString();
    this.decision_model = decision_model;
    this.decision_source = decision_source;
    this.routing_latency_ms = routing_latency_ms;
    this.reasoning = reasoning;
    this.failed = failed;
    this.error_message = error_message;
  }
}

export type TelemetryEvent =
  | StartSessionEvent
  | EndSessionEvent
  | UserPromptEvent
  | ToolCallEvent
  | ApiRequestEvent
  | ApiErrorEvent
  | ApiResponseEvent
  | FlashFallbackEvent
  | LoopDetectedEvent
  | LoopDetectionDisabledEvent
  | NextSpeakerCheckEvent
  | KittySequenceOverflowEvent
  | MalformedJsonResponseEvent
  | IdeConnectionEvent
  | ConversationFinishedEvent
  | SlashCommandEvent
  | FileOperationEvent
  | InvalidChunkEvent
  | ContentRetryEvent
  | ContentRetryFailureEvent
  | ExtensionEnableEvent
  | ExtensionInstallEvent
  | ExtensionUninstallEvent
  | ModelRoutingEvent
  | ToolOutputTruncatedEvent;

export class ExtensionInstallEvent implements BaseTelemetryEvent {
  'event.name': 'extension_install';
  'event.timestamp': string;
  extension_name: string;
  extension_version: string;
  extension_source: string;
  status: 'success' | 'error';

  constructor(
    extension_name: string,
    extension_version: string,
    extension_source: string,
    status: 'success' | 'error',
  ) {
    this['event.name'] = 'extension_install';
    this['event.timestamp'] = new Date().toISOString();
    this.extension_name = extension_name;
    this.extension_version = extension_version;
    this.extension_source = extension_source;
    this.status = status;
  }
}

export class ToolOutputTruncatedEvent implements BaseTelemetryEvent {
  readonly eventName = 'tool_output_truncated';
  readonly 'event.timestamp' = new Date().toISOString();
  'event.name': string;
  tool_name: string;
  original_content_length: number;
  truncated_content_length: number;
  threshold: number;
  lines: number;
  prompt_id: string;

  constructor(
    prompt_id: string,
    details: {
      toolName: string;
      originalContentLength: number;
      truncatedContentLength: number;
      threshold: number;
      lines: number;
    },
  ) {
    this['event.name'] = this.eventName;
    this.prompt_id = prompt_id;
    this.tool_name = details.toolName;
    this.original_content_length = details.originalContentLength;
    this.truncated_content_length = details.truncatedContentLength;
    this.threshold = details.threshold;
    this.lines = details.lines;
  }
}

export class ExtensionUninstallEvent implements BaseTelemetryEvent {
  'event.name': 'extension_uninstall';
  'event.timestamp': string;
  extension_name: string;
  status: 'success' | 'error';

  constructor(extension_name: string, status: 'success' | 'error') {
    this['event.name'] = 'extension_uninstall';
    this['event.timestamp'] = new Date().toISOString();
    this.extension_name = extension_name;
    this.status = status;
  }
}

export class ExtensionEnableEvent implements BaseTelemetryEvent {
  'event.name': 'extension_enable';
  'event.timestamp': string;
  extension_name: string;
  setting_scope: string;

  constructor(extension_name: string, settingScope: string) {
    this['event.name'] = 'extension_enable';
    this['event.timestamp'] = new Date().toISOString();
    this.extension_name = extension_name;
    this.setting_scope = settingScope;
  }
}
