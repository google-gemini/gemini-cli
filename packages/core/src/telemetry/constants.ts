/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export const SERVICE_NAME = 'gemini-cli';
export const SERVICE_DESCRIPTION =
  'Gemini CLI is an open-source AI agent that brings the power of Gemini directly into your terminal. It is designed to be a terminal-first, extensible, and powerful tool for developers, engineers, SREs, and beyond.';

// Gemini CLI specific semantic conventions
// https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/#genai-attributes
export const GEN_AI_OPERATION_NAME = 'gen_ai.operation.name';
export const GEN_AI_AGENT_NAME = 'gen_ai.agent.name';
export const GEN_AI_AGENT_DESCRIPTION = 'gen_ai.agent.description';
export const GEN_AI_INPUT_MESSAGES = 'gen_ai.input.messages';
export const GEN_AI_OUTPUT_MESSAGES = 'gen_ai.output.messages';
export const GEN_AI_REQUEST_MODEL = 'gen_ai.request.model';
export const GEN_AI_RESPONSE_MODEL = 'gen_ai.response.model';
export const GEN_AI_PROMPT_NAME = 'gen_ai.prompt.name';
export const GEN_AI_TOOL_NAME = 'gen_ai.tool.name';
export const GEN_AI_TOOL_CALL_ID = 'gen_ai.tool.call_id';
export const GEN_AI_TOOL_DESCRIPTION = 'gen_ai.tool.description';

// Gemini CLI specific attributes
export const GEMINI_CLI_GENERATE_CONTENT_CONFIG =
  'gemini_cli.generate_content.config';
export const GEMINI_CLI_GENERATE_CONTENT_USAGE =
  'gemini_cli.generate_content.usage';
export const GEMINI_CLI_SESSION_ID = 'gemini_cli.session_id';

// Gemini CLI specific operations
export enum GeminiCliOperation {
  ToolCall = 'tool_call',
  LLMCall = 'llm_call',
  UserPrompt = 'user_prompt',
  SystemPrompt = 'system_prompt',
  AgentCall = 'agent_call',
  ScheduleToolCalls = 'schedule_tool_calls',
}
