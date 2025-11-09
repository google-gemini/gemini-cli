/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Candidate,
  Content,
  GenerateContentConfig,
  GenerateContentResponseUsageMetadata,
} from '@google/genai';
import type { Config } from '../config/config.js';
import type { ApprovalMode } from '../policy/types.js';

import type { CompletedToolCall } from '../core/coreToolScheduler.js';
import { DiscoveredMCPTool } from '../tools/mcp-tool.js';
import type { FileDiff } from '../tools/tools.js';
import { AuthType } from '../core/contentGenerator.js';
import type { LogAttributes, LogRecord } from '@opentelemetry/api-logs';
import {
  getDecisionFromOutcome,
  ToolCallDecision,
} from './tool-call-decision.js';
import { getConventionAttributes, type FileOperation } from './metrics.js';
export { ToolCallDecision };
import type { ToolRegistry } from '../tools/tool-registry.js';
import type { OutputFormat } from '../output/types.js';
import type { AgentTerminateMode } from '../agents/types.js';

import { getCommonAttributes } from './telemetryAttributes.js';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { safeJsonStringify } from '../utils/safeJsonStringify.js';
import {
  toInputMessages,
  toOutputMessages,
  toFinishReasons,
  toOutputType,
  toSystemInstruction,
} from './semantic.js';

export interface BaseTelemetryEvent {
  'event.name': string;
  /** Current timestamp in ISO 8601 format */
  'event.timestamp': string;
}

type CommonFields = keyof BaseTelemetryEvent;

export const EVENT_CLI_CONFIG = 'gemini_cli.config';
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
  extensions_count: number;
  extensions: string;
  extension_ids: string;
  auth_type?: string;

  constructor(config: Config, toolRegistry?: ToolRegistry) {
    const generatorConfig = config.getContentGeneratorConfig();
    const mcpServers =
      config.getMcpClientManager()?.getMcpServers() ?? config.getMcpServers();

    let useGemini = false;
    let useVertex = false;
    if (generatorConfig && generatorConfig.authType) {
      useGemini = generatorConfig.authType === AuthType.USE_GEMINI;
      useVertex = generatorConfig.authType === AuthType.USE_VERTEX_AI;
    }

    this['event.name'] = 'cli_config';
    this['event.timestamp'] = new Date().toISOString();
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
    const extensions = config.getExtensions();
    this.extensions_count = extensions.length;
    this.extensions = extensions.map((e) => e.name).join(',');
    this.extension_ids = extensions.map((e) => e.id).join(',');
    this.auth_type = generatorConfig?.authType;
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

  toOpenTelemetryAttributes(config: Config): LogAttributes {
    return {
      ...getCommonAttributes(config),
      'event.name': EVENT_CLI_CONFIG,
      'event.timestamp': this['event.timestamp'],
      model: this.model,
      embedding_model: this.embedding_model,
      sandbox_enabled: this.sandbox_enabled,
      core_tools_enabled: this.core_tools_enabled,
      approval_mode: this.approval_mode,
      api_key_enabled: this.api_key_enabled,
      vertex_ai_enabled: this.vertex_ai_enabled,
      log_user_prompts_enabled: this.telemetry_log_user_prompts_enabled,
      file_filtering_respect_git_ignore: this.file_filtering_respect_git_ignore,
      debug_mode: this.debug_enabled,
      mcp_servers: this.mcp_servers,
      mcp_servers_count: this.mcp_servers_count,
      mcp_tools: this.mcp_tools,
      mcp_tools_count: this.mcp_tools_count,
      output_format: this.output_format,
      extensions: this.extensions,
      extensions_count: this.extensions_count,
      extension_ids: this.extension_ids,
      auth_type: this.auth_type,
    };
  }

  toLogBody(): string {
    return 'CLI configuration loaded.';
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

export const EVENT_USER_PROMPT = 'gemini_cli.user_prompt';
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

  toOpenTelemetryAttributes(config: Config): LogAttributes {
    const attributes: LogAttributes = {
      ...getCommonAttributes(config),
      'event.name': EVENT_USER_PROMPT,
      'event.timestamp': this['event.timestamp'],
      prompt_length: this.prompt_length,
      prompt_id: this.prompt_id,
    };

    if (this.auth_type) {
      attributes['auth_type'] = this.auth_type;
    }

    if (config.getTelemetryLogPromptsEnabled()) {
      attributes['prompt'] = this.prompt;
    }
    return attributes;
  }

  toLogBody(): string {
    return `User prompt. Length: ${this.prompt_length}.`;
  }
}

export const EVENT_TOOL_CALL = 'gemini_cli.tool_call';
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
  extension_name?: string;
  extension_id?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: { [key: string]: any };

  constructor(call: CompletedToolCall);
  constructor(
    call: undefined,
    function_name: string,
    function_args: Record<string, unknown>,
    duration_ms: number,
    success: boolean,
    prompt_id: string,
    tool_type: 'native' | 'mcp',
    error?: string,
  );
  constructor(
    call?: CompletedToolCall,
    function_name?: string,
    function_args?: Record<string, unknown>,
    duration_ms?: number,
    success?: boolean,
    prompt_id?: string,
    tool_type?: 'native' | 'mcp',
    error?: string,
  ) {
    this['event.name'] = 'tool_call';
    this['event.timestamp'] = new Date().toISOString();

    if (call) {
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
        this.extension_name = call.tool.extensionName;
        this.extension_id = call.tool.extensionId;
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
    } else {
      this.function_name = function_name!;
      this.function_args = function_args!;
      this.duration_ms = duration_ms!;
      this.success = success!;
      this.prompt_id = prompt_id!;
      this.tool_type = tool_type!;
      this.error = error;
    }
  }

  toOpenTelemetryAttributes(config: Config): LogAttributes {
    const attributes: LogAttributes = {
      ...getCommonAttributes(config),
      'event.name': EVENT_TOOL_CALL,
      'event.timestamp': this['event.timestamp'],
      function_name: this.function_name,
      function_args: safeJsonStringify(this.function_args, 2),
      duration_ms: this.duration_ms,
      success: this.success,
      decision: this.decision,
      prompt_id: this.prompt_id,
      tool_type: this.tool_type,
      content_length: this.content_length,
      mcp_server_name: this.mcp_server_name,
      extension_name: this.extension_name,
      extension_id: this.extension_id,
      metadata: this.metadata,
    };

    if (this.error) {
      attributes['error'] = this.error;
      attributes['error.message'] = this.error;
      if (this.error_type) {
        attributes['error_type'] = this.error_type;
        attributes['error.type'] = this.error_type;
      }
    }
    return attributes;
  }

  toLogBody(): string {
    return `Tool call: ${this.function_name}${this.decision ? `. Decision: ${this.decision}` : ''}. Success: ${this.success}. Duration: ${this.duration_ms}ms.`;
  }
}

export const EVENT_API_REQUEST = 'gemini_cli.api_request';
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

  toOpenTelemetryAttributes(config: Config): LogAttributes {
    return {
      ...getCommonAttributes(config),
      'event.name': EVENT_API_REQUEST,
      'event.timestamp': this['event.timestamp'],
      model: this.model,
      prompt_id: this.prompt_id,
      request_text: this.request_text,
    };
  }

  toLogBody(): string {
    return `API request to ${this.model}.`;
  }
}

export const EVENT_API_ERROR = 'gemini_cli.api_error';
export class ApiErrorEvent implements BaseTelemetryEvent {
  'event.name': 'api_error';
  'event.timestamp': string;
  model: string;
  prompt: GenAIPromptDetails;
  error: string;
  error_type?: string;
  status_code?: number | string;
  duration_ms: number;
  auth_type?: string;

  constructor(
    model: string,
    error: string,
    duration_ms: number,
    prompt_details: GenAIPromptDetails,
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
    this.prompt = prompt_details;
    this.auth_type = auth_type;
  }

  toLogRecord(config: Config): LogRecord {
    const attributes: LogAttributes = {
      ...getCommonAttributes(config),
      'event.name': EVENT_API_ERROR,
      'event.timestamp': this['event.timestamp'],
      ['error.message']: this.error,
      model_name: this.model,
      duration: this.duration_ms,
      model: this.model,
      error: this.error,
      status_code: this.status_code,
      duration_ms: this.duration_ms,
      prompt_id: this.prompt.prompt_id,
      auth_type: this.auth_type,
    };

    if (this.error_type) {
      attributes['error.type'] = this.error_type;
    }
    if (typeof this.status_code === 'number') {
      attributes[SemanticAttributes.HTTP_STATUS_CODE] = this.status_code;
    }
    const logRecord: LogRecord = {
      body: `API error for ${this.model}. Error: ${this.error}. Duration: ${this.duration_ms}ms.`,
      attributes,
    };
    return logRecord;
  }

  toSemanticLogRecord(config: Config): LogRecord {
    const attributes: LogAttributes = {
      ...getCommonAttributes(config),
      'event.name': EVENT_GEN_AI_OPERATION_DETAILS,
      'event.timestamp': this['event.timestamp'],
      ...toGenerateContentConfigAttributes(this.prompt.generate_content_config),
      ...getConventionAttributes(this),
    };

    if (this.prompt.server) {
      attributes['server.address'] = this.prompt.server.address;
      attributes['server.port'] = this.prompt.server.port;
    }

    if (config.getTelemetryLogPromptsEnabled() && this.prompt.contents) {
      attributes['gen_ai.input.messages'] = JSON.stringify(
        toInputMessages(this.prompt.contents),
      );
    }

    const logRecord: LogRecord = {
      body: `GenAI operation error details from ${this.model}. Error: ${this.error}. Duration: ${this.duration_ms}ms.`,
      attributes,
    };

    return logRecord;
  }
}

export interface ServerDetails {
  address: string;
  port: number;
}

export interface GenAIPromptDetails {
  prompt_id: string;
  contents: Content[];
  generate_content_config?: GenerateContentConfig;
  server?: ServerDetails;
}

export interface GenAIResponseDetails {
  response_id?: string;
  candidates?: Candidate[];
}

export interface GenAIUsageDetails {
  input_token_count: number;
  output_token_count: number;
  cached_content_token_count: number;
  thoughts_token_count: number;
  tool_token_count: number;
  total_token_count: number;
}

export const EVENT_API_RESPONSE = 'gemini_cli.api_response';
export const EVENT_GEN_AI_OPERATION_DETAILS =
  'gen_ai.client.inference.operation.details';

function toGenerateContentConfigAttributes(
  config?: GenerateContentConfig,
): LogAttributes {
  if (!config) {
    return {};
  }
  return {
    'gen_ai.request.temperature': config.temperature,
    'gen_ai.request.top_p': config.topP,
    'gen_ai.request.top_k': config.topK,
    'gen_ai.request.choice.count': config.candidateCount,
    'gen_ai.request.seed': config.seed,
    'gen_ai.request.frequency_penalty': config.frequencyPenalty,
    'gen_ai.request.presence_penalty': config.presencePenalty,
    'gen_ai.request.max_tokens': config.maxOutputTokens,
    'gen_ai.output.type': toOutputType(config.responseMimeType),
    'gen_ai.request.stop_sequences': config.stopSequences,
    'gen_ai.system_instructions': JSON.stringify(
      toSystemInstruction(config.systemInstruction),
    ),
  };
}

export class ApiResponseEvent implements BaseTelemetryEvent {
  'event.name': 'api_response';
  'event.timestamp': string;
  status_code?: number | string;
  duration_ms: number;
  response_text?: string;
  auth_type?: string;

  model: string;
  prompt: GenAIPromptDetails;
  response: GenAIResponseDetails;
  usage: GenAIUsageDetails;

  constructor(
    model: string,
    duration_ms: number,
    prompt_details: GenAIPromptDetails,
    response_details: GenAIResponseDetails,
    auth_type?: string,
    usage_data?: GenerateContentResponseUsageMetadata,
    response_text?: string,
  ) {
    this['event.name'] = 'api_response';
    this['event.timestamp'] = new Date().toISOString();
    this.duration_ms = duration_ms;
    this.status_code = 200;
    this.response_text = response_text;
    this.auth_type = auth_type;

    this.model = model;
    this.prompt = prompt_details;
    this.response = response_details;
    this.usage = {
      input_token_count: usage_data?.promptTokenCount ?? 0,
      output_token_count: usage_data?.candidatesTokenCount ?? 0,
      cached_content_token_count: usage_data?.cachedContentTokenCount ?? 0,
      thoughts_token_count: usage_data?.thoughtsTokenCount ?? 0,
      tool_token_count: usage_data?.toolUsePromptTokenCount ?? 0,
      total_token_count: usage_data?.totalTokenCount ?? 0,
    };
  }

  toLogRecord(config: Config): LogRecord {
    const attributes: LogAttributes = {
      ...getCommonAttributes(config),
      'event.name': EVENT_API_RESPONSE,
      'event.timestamp': this['event.timestamp'],
      model: this.model,
      duration_ms: this.duration_ms,
      input_token_count: this.usage.input_token_count,
      output_token_count: this.usage.output_token_count,
      cached_content_token_count: this.usage.cached_content_token_count,
      thoughts_token_count: this.usage.thoughts_token_count,
      tool_token_count: this.usage.tool_token_count,
      total_token_count: this.usage.total_token_count,
      prompt_id: this.prompt.prompt_id,
      auth_type: this.auth_type,
      status_code: this.status_code,
    };
    if (this.response_text) {
      attributes['response_text'] = this.response_text;
    }
    if (this.status_code) {
      if (typeof this.status_code === 'number') {
        attributes[SemanticAttributes.HTTP_STATUS_CODE] = this.status_code;
      }
    }
    const logRecord: LogRecord = {
      body: `API response from ${this.model}. Status: ${this.status_code || 'N/A'}. Duration: ${this.duration_ms}ms.`,
      attributes,
    };
    return logRecord;
  }

  toSemanticLogRecord(config: Config): LogRecord {
    const attributes: LogAttributes = {
      ...getCommonAttributes(config),
      'event.name': EVENT_GEN_AI_OPERATION_DETAILS,
      'event.timestamp': this['event.timestamp'],
      'gen_ai.response.id': this.response.response_id,
      'gen_ai.response.finish_reasons': toFinishReasons(
        this.response.candidates,
      ),
      'gen_ai.output.messages': JSON.stringify(
        toOutputMessages(this.response.candidates),
      ),
      ...toGenerateContentConfigAttributes(this.prompt.generate_content_config),
      ...getConventionAttributes(this),
    };

    if (this.prompt.server) {
      attributes['server.address'] = this.prompt.server.address;
      attributes['server.port'] = this.prompt.server.port;
    }

    if (config.getTelemetryLogPromptsEnabled() && this.prompt.contents) {
      attributes['gen_ai.input.messages'] = JSON.stringify(
        toInputMessages(this.prompt.contents),
      );
    }

    if (this.usage) {
      attributes['gen_ai.usage.input_tokens'] = this.usage.input_token_count;
      attributes['gen_ai.usage.output_tokens'] = this.usage.output_token_count;
    }

    const logRecord: LogRecord = {
      body: `GenAI operation details from ${this.model}. Status: ${this.status_code || 'N/A'}. Duration: ${this.duration_ms}ms.`,
      attributes,
    };

    return logRecord;
  }
}

export const EVENT_FLASH_FALLBACK = 'gemini_cli.flash_fallback';
export class FlashFallbackEvent implements BaseTelemetryEvent {
  'event.name': 'flash_fallback';
  'event.timestamp': string;
  auth_type: string;

  constructor(auth_type: string) {
    this['event.name'] = 'flash_fallback';
    this['event.timestamp'] = new Date().toISOString();
    this.auth_type = auth_type;
  }

  toOpenTelemetryAttributes(config: Config): LogAttributes {
    return {
      ...getCommonAttributes(config),
      'event.name': EVENT_FLASH_FALLBACK,
      'event.timestamp': this['event.timestamp'],
      auth_type: this.auth_type,
    };
  }

  toLogBody(): string {
    return `Switching to flash as Fallback.`;
  }
}

export const EVENT_RIPGREP_FALLBACK = 'gemini_cli.ripgrep_fallback';
export class RipgrepFallbackEvent implements BaseTelemetryEvent {
  'event.name': 'ripgrep_fallback';
  'event.timestamp': string;

  constructor(public error?: string) {
    this['event.name'] = 'ripgrep_fallback';
    this['event.timestamp'] = new Date().toISOString();
  }

  toOpenTelemetryAttributes(config: Config): LogAttributes {
    return {
      ...getCommonAttributes(config),
      'event.name': EVENT_RIPGREP_FALLBACK,
      'event.timestamp': this['event.timestamp'],
      error: this.error,
    };
  }

  toLogBody(): string {
    return `Switching to grep as fallback.`;
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

  toOpenTelemetryAttributes(config: Config): LogAttributes {
    return {
      ...getCommonAttributes(config),
      'event.name': this['event.name'],
      'event.timestamp': this['event.timestamp'],
      loop_type: this.loop_type,
      prompt_id: this.prompt_id,
    };
  }

  toLogBody(): string {
    return `Loop detected. Type: ${this.loop_type}.`;
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

  toOpenTelemetryAttributes(config: Config): LogAttributes {
    return {
      ...getCommonAttributes(config),
      'event.name': this['event.name'],
      'event.timestamp': this['event.timestamp'],
      prompt_id: this.prompt_id,
    };
  }

  toLogBody(): string {
    return `Loop detection disabled.`;
  }
}

export const EVENT_NEXT_SPEAKER_CHECK = 'gemini_cli.next_speaker_check';
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

  toOpenTelemetryAttributes(config: Config): LogAttributes {
    return {
      ...getCommonAttributes(config),
      'event.name': EVENT_NEXT_SPEAKER_CHECK,
      'event.timestamp': this['event.timestamp'],
      prompt_id: this.prompt_id,
      finish_reason: this.finish_reason,
      result: this.result,
    };
  }

  toLogBody(): string {
    return `Next speaker check.`;
  }
}

export const EVENT_SLASH_COMMAND = 'gemini_cli.slash_command';
export interface SlashCommandEvent extends BaseTelemetryEvent {
  'event.name': 'slash_command';
  'event.timestamp': string;
  command: string;
  subcommand?: string;
  status?: SlashCommandStatus;
  extension_id?: string;
  toOpenTelemetryAttributes(config: Config): LogAttributes;
  toLogBody(): string;
}

export function makeSlashCommandEvent({
  command,
  subcommand,
  status,
  extension_id,
}: Omit<
  SlashCommandEvent,
  CommonFields | 'toOpenTelemetryAttributes' | 'toLogBody'
>): SlashCommandEvent {
  return {
    'event.name': 'slash_command',
    'event.timestamp': new Date().toISOString(),
    command,
    subcommand,
    status,
    extension_id,
    toOpenTelemetryAttributes(config: Config): LogAttributes {
      return {
        ...getCommonAttributes(config),
        'event.name': EVENT_SLASH_COMMAND,
        'event.timestamp': this['event.timestamp'],
        command: this.command,
        subcommand: this.subcommand,
        status: this.status,
        extension_id: this.extension_id,
      };
    },
    toLogBody(): string {
      return `Slash command: ${this.command}.`;
    },
  };
}

export enum SlashCommandStatus {
  SUCCESS = 'success',
  ERROR = 'error',
}

export const EVENT_CHAT_COMPRESSION = 'gemini_cli.chat_compression';
export interface ChatCompressionEvent extends BaseTelemetryEvent {
  'event.name': 'chat_compression';
  'event.timestamp': string;
  tokens_before: number;
  tokens_after: number;
  toOpenTelemetryAttributes(config: Config): LogAttributes;
  toLogBody(): string;
}

export function makeChatCompressionEvent({
  tokens_before,
  tokens_after,
}: Omit<
  ChatCompressionEvent,
  CommonFields | 'toOpenTelemetryAttributes' | 'toLogBody'
>): ChatCompressionEvent {
  return {
    'event.name': 'chat_compression',
    'event.timestamp': new Date().toISOString(),
    tokens_before,
    tokens_after,
    toOpenTelemetryAttributes(config: Config): LogAttributes {
      return {
        ...getCommonAttributes(config),
        'event.name': EVENT_CHAT_COMPRESSION,
        'event.timestamp': this['event.timestamp'],
        tokens_before: this.tokens_before,
        tokens_after: this.tokens_after,
      };
    },
    toLogBody(): string {
      return `Chat compression (Saved ${this.tokens_before - this.tokens_after} tokens)`;
    },
  };
}

export const EVENT_MALFORMED_JSON_RESPONSE =
  'gemini_cli.malformed_json_response';
export class MalformedJsonResponseEvent implements BaseTelemetryEvent {
  'event.name': 'malformed_json_response';
  'event.timestamp': string;
  model: string;

  constructor(model: string) {
    this['event.name'] = 'malformed_json_response';
    this['event.timestamp'] = new Date().toISOString();
    this.model = model;
  }

  toOpenTelemetryAttributes(config: Config): LogAttributes {
    return {
      ...getCommonAttributes(config),
      'event.name': EVENT_MALFORMED_JSON_RESPONSE,
      'event.timestamp': this['event.timestamp'],
      model: this.model,
    };
  }

  toLogBody(): string {
    return `Malformed JSON response from ${this.model}.`;
  }
}

export enum IdeConnectionType {
  START = 'start',
  SESSION = 'session',
}

export const EVENT_IDE_CONNECTION = 'gemini_cli.ide_connection';
export class IdeConnectionEvent {
  'event.name': 'ide_connection';
  'event.timestamp': string;
  connection_type: IdeConnectionType;

  constructor(connection_type: IdeConnectionType) {
    this['event.name'] = 'ide_connection';
    this['event.timestamp'] = new Date().toISOString();
    this.connection_type = connection_type;
  }

  toOpenTelemetryAttributes(config: Config): LogAttributes {
    return {
      ...getCommonAttributes(config),
      'event.name': EVENT_IDE_CONNECTION,
      'event.timestamp': this['event.timestamp'],
      connection_type: this.connection_type,
    };
  }

  toLogBody(): string {
    return `Ide connection. Type: ${this.connection_type}.`;
  }
}

export const EVENT_CONVERSATION_FINISHED = 'gemini_cli.conversation_finished';
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

  toOpenTelemetryAttributes(config: Config): LogAttributes {
    return {
      ...getCommonAttributes(config),
      'event.name': EVENT_CONVERSATION_FINISHED,
      'event.timestamp': this['event.timestamp'],
      approvalMode: this.approvalMode,
      turnCount: this.turnCount,
    };
  }

  toLogBody(): string {
    return `Conversation finished.`;
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

  toOpenTelemetryAttributes(config: Config): LogAttributes {
    return {
      ...getCommonAttributes(config),
      'event.name': this['event.name'],
      'event.timestamp': this['event.timestamp'],
      sequence_length: this.sequence_length,
      truncated_sequence: this.truncated_sequence,
    };
  }

  toLogBody(): string {
    return `Kitty sequence buffer overflow: ${this.sequence_length} bytes`;
  }
}

export const EVENT_FILE_OPERATION = 'gemini_cli.file_operation';
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

  toOpenTelemetryAttributes(config: Config): LogAttributes {
    const attributes: LogAttributes = {
      ...getCommonAttributes(config),
      'event.name': EVENT_FILE_OPERATION,
      'event.timestamp': this['event.timestamp'],
      tool_name: this.tool_name,
      operation: this.operation,
    };

    if (this.lines) {
      attributes['lines'] = this.lines;
    }
    if (this.mimetype) {
      attributes['mimetype'] = this.mimetype;
    }
    if (this.extension) {
      attributes['extension'] = this.extension;
    }
    if (this.programming_language) {
      attributes['programming_language'] = this.programming_language;
    }
    return attributes;
  }

  toLogBody(): string {
    return `File operation: ${this.operation}. Lines: ${this.lines}.`;
  }
}

export const EVENT_INVALID_CHUNK = 'gemini_cli.chat.invalid_chunk';
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

  toOpenTelemetryAttributes(config: Config): LogAttributes {
    const attributes: LogAttributes = {
      ...getCommonAttributes(config),
      'event.name': EVENT_INVALID_CHUNK,
      'event.timestamp': this['event.timestamp'],
    };

    if (this.error_message) {
      attributes['error.message'] = this.error_message;
    }
    return attributes;
  }

  toLogBody(): string {
    return `Invalid chunk received from stream.`;
  }
}

export const EVENT_CONTENT_RETRY = 'gemini_cli.chat.content_retry';
export class ContentRetryEvent implements BaseTelemetryEvent {
  'event.name': 'content_retry';
  'event.timestamp': string;
  attempt_number: number;
  error_type: string; // e.g., 'EmptyStreamError'
  retry_delay_ms: number;
  model: string;

  constructor(
    attempt_number: number,
    error_type: string,
    retry_delay_ms: number,
    model: string,
  ) {
    this['event.name'] = 'content_retry';
    this['event.timestamp'] = new Date().toISOString();
    this.attempt_number = attempt_number;
    this.error_type = error_type;
    this.retry_delay_ms = retry_delay_ms;
    this.model = model;
  }

  toOpenTelemetryAttributes(config: Config): LogAttributes {
    return {
      ...getCommonAttributes(config),
      'event.name': EVENT_CONTENT_RETRY,
      'event.timestamp': this['event.timestamp'],
      attempt_number: this.attempt_number,
      error_type: this.error_type,
      retry_delay_ms: this.retry_delay_ms,
      model: this.model,
    };
  }

  toLogBody(): string {
    return `Content retry attempt ${this.attempt_number} due to ${this.error_type}.`;
  }
}

export const EVENT_CONTENT_RETRY_FAILURE =
  'gemini_cli.chat.content_retry_failure';
export class ContentRetryFailureEvent implements BaseTelemetryEvent {
  'event.name': 'content_retry_failure';
  'event.timestamp': string;
  total_attempts: number;
  final_error_type: string;
  total_duration_ms?: number; // Optional: total time spent retrying
  model: string;

  constructor(
    total_attempts: number,
    final_error_type: string,
    model: string,
    total_duration_ms?: number,
  ) {
    this['event.name'] = 'content_retry_failure';
    this['event.timestamp'] = new Date().toISOString();
    this.total_attempts = total_attempts;
    this.final_error_type = final_error_type;
    this.total_duration_ms = total_duration_ms;
    this.model = model;
  }

  toOpenTelemetryAttributes(config: Config): LogAttributes {
    return {
      ...getCommonAttributes(config),
      'event.name': EVENT_CONTENT_RETRY_FAILURE,
      'event.timestamp': this['event.timestamp'],
      total_attempts: this.total_attempts,
      final_error_type: this.final_error_type,
      total_duration_ms: this.total_duration_ms,
      model: this.model,
    };
  }

  toLogBody(): string {
    return `All content retries failed after ${this.total_attempts} attempts.`;
  }
}

export const EVENT_MODEL_ROUTING = 'gemini_cli.model_routing';
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

  toOpenTelemetryAttributes(config: Config): LogAttributes {
    return {
      ...getCommonAttributes(config),
      'event.name': EVENT_MODEL_ROUTING,
      'event.timestamp': this['event.timestamp'],
      decision_model: this.decision_model,
      decision_source: this.decision_source,
      routing_latency_ms: this.routing_latency_ms,
      reasoning: this.reasoning,
      failed: this.failed,
      error_message: this.error_message,
    };
  }

  toLogBody(): string {
    return `Model routing decision. Model: ${this.decision_model}, Source: ${this.decision_source}`;
  }
}

export const EVENT_EXTENSION_INSTALL = 'gemini_cli.extension_install';
export class ExtensionInstallEvent implements BaseTelemetryEvent {
  'event.name': 'extension_install';
  'event.timestamp': string;
  extension_name: string;
  extension_id: string;
  extension_version: string;
  extension_source: string;
  status: 'success' | 'error';

  constructor(
    extension_name: string,
    extension_id: string,
    extension_version: string,
    extension_source: string,
    status: 'success' | 'error',
  ) {
    this['event.name'] = 'extension_install';
    this['event.timestamp'] = new Date().toISOString();
    this.extension_name = extension_name;
    this.extension_id = extension_id;
    this.extension_version = extension_version;
    this.extension_source = extension_source;
    this.status = status;
  }

  toOpenTelemetryAttributes(config: Config): LogAttributes {
    return {
      ...getCommonAttributes(config),
      'event.name': EVENT_EXTENSION_INSTALL,
      'event.timestamp': this['event.timestamp'],
      extension_name: this.extension_name,
      extension_version: this.extension_version,
      extension_source: this.extension_source,
      status: this.status,
    };
  }

  toLogBody(): string {
    return `Installed extension ${this.extension_name}`;
  }
}

export const EVENT_TOOL_OUTPUT_TRUNCATED = 'gemini_cli.tool_output_truncated';
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

  toOpenTelemetryAttributes(config: Config): LogAttributes {
    return {
      ...getCommonAttributes(config),
      'event.name': EVENT_TOOL_OUTPUT_TRUNCATED,
      eventName: this.eventName,
      'event.timestamp': this['event.timestamp'],
      tool_name: this.tool_name,
      original_content_length: this.original_content_length,
      truncated_content_length: this.truncated_content_length,
      threshold: this.threshold,
      lines: this.lines,
      prompt_id: this.prompt_id,
    };
  }

  toLogBody(): string {
    return `Tool output truncated for ${this.tool_name}.`;
  }
}

export const EVENT_EXTENSION_UNINSTALL = 'gemini_cli.extension_uninstall';
export class ExtensionUninstallEvent implements BaseTelemetryEvent {
  'event.name': 'extension_uninstall';
  'event.timestamp': string;
  extension_name: string;
  extension_id: string;
  status: 'success' | 'error';

  constructor(
    extension_name: string,
    extension_id: string,
    status: 'success' | 'error',
  ) {
    this['event.name'] = 'extension_uninstall';
    this['event.timestamp'] = new Date().toISOString();
    this.extension_name = extension_name;
    this.extension_id = extension_id;
    this.status = status;
  }

  toOpenTelemetryAttributes(config: Config): LogAttributes {
    return {
      ...getCommonAttributes(config),
      'event.name': EVENT_EXTENSION_UNINSTALL,
      'event.timestamp': this['event.timestamp'],
      extension_name: this.extension_name,
      status: this.status,
    };
  }

  toLogBody(): string {
    return `Uninstalled extension ${this.extension_name}`;
  }
}

export const EVENT_EXTENSION_UPDATE = 'gemini_cli.extension_update';
export class ExtensionUpdateEvent implements BaseTelemetryEvent {
  'event.name': 'extension_update';
  'event.timestamp': string;
  extension_name: string;
  extension_id: string;
  extension_previous_version: string;
  extension_version: string;
  extension_source: string;
  status: 'success' | 'error';

  constructor(
    extension_name: string,
    extension_id: string,
    extension_version: string,
    extension_previous_version: string,
    extension_source: string,
    status: 'success' | 'error',
  ) {
    this['event.name'] = 'extension_update';
    this['event.timestamp'] = new Date().toISOString();
    this.extension_name = extension_name;
    this.extension_id = extension_id;
    this.extension_version = extension_version;
    this.extension_previous_version = extension_previous_version;
    this.extension_source = extension_source;
    this.status = status;
  }

  toOpenTelemetryAttributes(config: Config): LogAttributes {
    return {
      ...getCommonAttributes(config),
      'event.name': EVENT_EXTENSION_UPDATE,
      'event.timestamp': this['event.timestamp'],
      extension_name: this.extension_name,
      extension_version: this.extension_version,
      extension_previous_version: this.extension_previous_version,
      extension_source: this.extension_source,
      status: this.status,
    };
  }

  toLogBody(): string {
    return `Updated extension ${this.extension_name}`;
  }
}

export const EVENT_EXTENSION_ENABLE = 'gemini_cli.extension_enable';
export class ExtensionEnableEvent implements BaseTelemetryEvent {
  'event.name': 'extension_enable';
  'event.timestamp': string;
  extension_name: string;
  extension_id: string;
  setting_scope: string;

  constructor(
    extension_name: string,
    extension_id: string,
    settingScope: string,
  ) {
    this['event.name'] = 'extension_enable';
    this['event.timestamp'] = new Date().toISOString();
    this.extension_name = extension_name;
    this.extension_id = extension_id;
    this.setting_scope = settingScope;
  }

  toOpenTelemetryAttributes(config: Config): LogAttributes {
    return {
      ...getCommonAttributes(config),
      'event.name': EVENT_EXTENSION_ENABLE,
      'event.timestamp': this['event.timestamp'],
      extension_name: this.extension_name,
      setting_scope: this.setting_scope,
    };
  }

  toLogBody(): string {
    return `Enabled extension ${this.extension_name}`;
  }
}

export const EVENT_MODEL_SLASH_COMMAND = 'gemini_cli.slash_command.model';
export class ModelSlashCommandEvent implements BaseTelemetryEvent {
  'event.name': 'model_slash_command';
  'event.timestamp': string;
  model_name: string;

  constructor(model_name: string) {
    this['event.name'] = 'model_slash_command';
    this['event.timestamp'] = new Date().toISOString();
    this.model_name = model_name;
  }

  toOpenTelemetryAttributes(config: Config): LogAttributes {
    return {
      ...getCommonAttributes(config),
      'event.name': EVENT_MODEL_SLASH_COMMAND,
      'event.timestamp': this['event.timestamp'],
      model_name: this.model_name,
    };
  }

  toLogBody(): string {
    return `Model slash command. Model: ${this.model_name}`;
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
  | ToolOutputTruncatedEvent
  | ModelSlashCommandEvent
  | AgentStartEvent
  | AgentFinishEvent
  | RecoveryAttemptEvent
  | WebFetchFallbackAttemptEvent;

export const EVENT_EXTENSION_DISABLE = 'gemini_cli.extension_disable';
export class ExtensionDisableEvent implements BaseTelemetryEvent {
  'event.name': 'extension_disable';
  'event.timestamp': string;
  extension_name: string;
  extension_id: string;
  setting_scope: string;

  constructor(
    extension_name: string,
    extension_id: string,
    settingScope: string,
  ) {
    this['event.name'] = 'extension_disable';
    this['event.timestamp'] = new Date().toISOString();
    this.extension_name = extension_name;
    this.extension_id = extension_id;
    this.setting_scope = settingScope;
  }

  toOpenTelemetryAttributes(config: Config): LogAttributes {
    return {
      ...getCommonAttributes(config),
      'event.name': EVENT_EXTENSION_DISABLE,
      'event.timestamp': this['event.timestamp'],
      extension_name: this.extension_name,
      setting_scope: this.setting_scope,
    };
  }

  toLogBody(): string {
    return `Disabled extension ${this.extension_name}`;
  }
}

export const EVENT_SMART_EDIT_STRATEGY = 'gemini_cli.smart_edit_strategy';
export class SmartEditStrategyEvent implements BaseTelemetryEvent {
  'event.name': 'smart_edit_strategy';
  'event.timestamp': string;
  strategy: string;

  constructor(strategy: string) {
    this['event.name'] = 'smart_edit_strategy';
    this['event.timestamp'] = new Date().toISOString();
    this.strategy = strategy;
  }

  toOpenTelemetryAttributes(config: Config): LogAttributes {
    return {
      ...getCommonAttributes(config),
      'event.name': EVENT_SMART_EDIT_STRATEGY,
      'event.timestamp': this['event.timestamp'],
      strategy: this.strategy,
    };
  }

  toLogBody(): string {
    return `Smart Edit Tool Strategy: ${this.strategy}`;
  }
}

export const EVENT_SMART_EDIT_CORRECTION = 'gemini_cli.smart_edit_correction';
export class SmartEditCorrectionEvent implements BaseTelemetryEvent {
  'event.name': 'smart_edit_correction';
  'event.timestamp': string;
  correction: 'success' | 'failure';

  constructor(correction: 'success' | 'failure') {
    this['event.name'] = 'smart_edit_correction';
    this['event.timestamp'] = new Date().toISOString();
    this.correction = correction;
  }

  toOpenTelemetryAttributes(config: Config): LogAttributes {
    return {
      ...getCommonAttributes(config),
      'event.name': EVENT_SMART_EDIT_CORRECTION,
      'event.timestamp': this['event.timestamp'],
      correction: this.correction,
    };
  }

  toLogBody(): string {
    return `Smart Edit Tool Correction: ${this.correction}`;
  }
}

abstract class BaseAgentEvent implements BaseTelemetryEvent {
  abstract 'event.name':
    | 'agent_start'
    | 'agent_finish'
    | 'agent_recovery_attempt';
  'event.timestamp': string;
  agent_id: string;
  agent_name: string;

  constructor(agent_id: string, agent_name: string) {
    this['event.timestamp'] = new Date().toISOString();
    this.agent_id = agent_id;
    this.agent_name = agent_name;
  }

  toOpenTelemetryAttributes(config: Config): LogAttributes {
    return {
      ...getCommonAttributes(config),
      'event.timestamp': this['event.timestamp'],
      agent_id: this.agent_id,
      agent_name: this.agent_name,
    };
  }

  abstract toLogBody(): string;
}

export const EVENT_AGENT_START = 'gemini_cli.agent.start';
export class AgentStartEvent extends BaseAgentEvent {
  'event.name' = 'agent_start' as const;

  constructor(agent_id: string, agent_name: string) {
    super(agent_id, agent_name);
  }

  override toOpenTelemetryAttributes(config: Config): LogAttributes {
    return {
      ...super.toOpenTelemetryAttributes(config),
      'event.name': EVENT_AGENT_START,
    };
  }

  toLogBody(): string {
    return `Agent ${this.agent_name} started. ID: ${this.agent_id}`;
  }
}

export const EVENT_AGENT_FINISH = 'gemini_cli.agent.finish';
export class AgentFinishEvent extends BaseAgentEvent {
  'event.name' = 'agent_finish' as const;
  duration_ms: number;
  turn_count: number;
  terminate_reason: AgentTerminateMode;

  constructor(
    agent_id: string,
    agent_name: string,
    duration_ms: number,
    turn_count: number,
    terminate_reason: AgentTerminateMode,
  ) {
    super(agent_id, agent_name);
    this.duration_ms = duration_ms;
    this.turn_count = turn_count;
    this.terminate_reason = terminate_reason;
  }

  override toOpenTelemetryAttributes(config: Config): LogAttributes {
    return {
      ...super.toOpenTelemetryAttributes(config),
      'event.name': EVENT_AGENT_FINISH,
      duration_ms: this.duration_ms,
      turn_count: this.turn_count,
      terminate_reason: this.terminate_reason,
    };
  }

  toLogBody(): string {
    return `Agent ${this.agent_name} finished. Reason: ${this.terminate_reason}. Duration: ${this.duration_ms}ms. Turns: ${this.turn_count}.`;
  }
}

export const EVENT_AGENT_RECOVERY_ATTEMPT = 'gemini_cli.agent.recovery_attempt';
export class RecoveryAttemptEvent extends BaseAgentEvent {
  'event.name' = 'agent_recovery_attempt' as const;
  reason: AgentTerminateMode;
  duration_ms: number;
  success: boolean;
  turn_count: number;

  constructor(
    agent_id: string,
    agent_name: string,
    reason: AgentTerminateMode,
    duration_ms: number,
    success: boolean,
    turn_count: number,
  ) {
    super(agent_id, agent_name);
    this.reason = reason;
    this.duration_ms = duration_ms;
    this.success = success;
    this.turn_count = turn_count;
  }

  override toOpenTelemetryAttributes(config: Config): LogAttributes {
    return {
      ...super.toOpenTelemetryAttributes(config),
      'event.name': EVENT_AGENT_RECOVERY_ATTEMPT,
      reason: this.reason,
      duration_ms: this.duration_ms,
      success: this.success,
      turn_count: this.turn_count,
    };
  }

  toLogBody(): string {
    return `Agent ${this.agent_name} recovery attempt. Reason: ${this.reason}. Success: ${this.success}. Duration: ${this.duration_ms}ms.`;
  }
}

export const EVENT_WEB_FETCH_FALLBACK_ATTEMPT =
  'gemini_cli.web_fetch_fallback_attempt';
export class WebFetchFallbackAttemptEvent implements BaseTelemetryEvent {
  'event.name': 'web_fetch_fallback_attempt';
  'event.timestamp': string;
  reason: 'private_ip' | 'primary_failed';

  constructor(reason: 'private_ip' | 'primary_failed') {
    this['event.name'] = 'web_fetch_fallback_attempt';
    this['event.timestamp'] = new Date().toISOString();
    this.reason = reason;
  }

  toOpenTelemetryAttributes(config: Config): LogAttributes {
    return {
      ...getCommonAttributes(config),
      'event.name': EVENT_WEB_FETCH_FALLBACK_ATTEMPT,
      'event.timestamp': this['event.timestamp'],
      reason: this.reason,
    };
  }

  toLogBody(): string {
    return `Web fetch fallback attempt. Reason: ${this.reason}`;
  }
}
