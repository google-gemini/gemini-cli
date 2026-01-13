/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OpenAI-compatible chat message.
 */
export interface OpenAIChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  name?: string;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  /** Extended field for reasoning models (GLM, DeepSeek) */
  reasoning_content?: string;
}

/**
 * OpenAI tool call format.
 */
export interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

/**
 * OpenAI chat completion request.
 */
export interface OpenAIChatCompletionRequest {
  model: string;
  messages: OpenAIChatMessage[];
  tools?: OpenAITool[];
  tool_choice?:
    | 'auto'
    | 'none'
    | { type: 'function'; function: { name: string } };
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
  /** Provider-specific extensions (e.g., GLM's enable_thinking) */
  extra_body?: Record<string, unknown>;
}

/**
 * OpenAI tool definition.
 */
export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

/**
 * OpenAI chat completion response.
 */
export interface OpenAIChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: OpenAIChatChoice[];
  usage?: OpenAIUsage;
}

/**
 * OpenAI chat completion choice.
 */
export interface OpenAIChatChoice {
  index: number;
  message: OpenAIChatMessage;
  finish_reason: OpenAIFinishReason | null;
}

/**
 * OpenAI finish reasons.
 */
export type OpenAIFinishReason =
  | 'stop'
  | 'tool_calls'
  | 'length'
  | 'content_filter';

/**
 * OpenAI usage information.
 */
export interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/**
 * OpenAI streaming chunk.
 */
export interface OpenAIChatCompletionChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: OpenAIStreamChoice[];
  usage?: OpenAIUsage;
}

/**
 * OpenAI streaming choice.
 */
export interface OpenAIStreamChoice {
  index: number;
  delta: OpenAIDelta;
  finish_reason: OpenAIFinishReason | null;
}

/**
 * OpenAI streaming delta content.
 */
export interface OpenAIDelta {
  role?: 'assistant';
  content?: string | null;
  /** Extended field for reasoning models */
  reasoning_content?: string | null;
  tool_calls?: OpenAIToolCallDelta[];
}

/**
 * OpenAI tool call delta for streaming.
 */
export interface OpenAIToolCallDelta {
  index: number;
  id?: string;
  type?: 'function';
  function?: {
    name?: string;
    arguments?: string;
  };
}
