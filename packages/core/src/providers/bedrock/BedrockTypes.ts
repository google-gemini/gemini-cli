/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Message,
  MessageParam,
  ContentBlock,
  ContentBlockParam,
  TextBlock,
  TextBlockParam,
  ToolUseBlock,
  ImageBlockParam,
  ToolResultBlockParam,
  MessageCreateParams,
  MessageCreateParamsNonStreaming,
  MessageCreateParamsStreaming,
  MessageStreamEvent,
  Tool as AnthropicTool,
} from '@anthropic-ai/sdk/resources/messages';
import type { Content, Tool } from '@google/genai';

/**
 * Re-export types from Anthropic SDK for internal use
 */
export type {
  Message as BedrockMessage,
  MessageParam as BedrockMessageParam,
  ContentBlock as BedrockContentBlock,
  ContentBlockParam as BedrockContentBlockParam,
  TextBlock as BedrockTextBlock,
  TextBlockParam as BedrockTextBlockParam,
  ToolUseBlock as BedrockToolUseBlock,
  ImageBlockParam as BedrockImageBlock,
  ToolResultBlockParam as BedrockToolResultBlock,
  MessageCreateParams as BedrockMessageCreateParams,
  MessageCreateParamsNonStreaming as BedrockMessageCreateParamsNonStreaming,
  MessageCreateParamsStreaming as BedrockMessageCreateParamsStreaming,
  MessageStreamEvent as BedrockStreamEvent,
};

export type BedrockTool = AnthropicTool;

/**
 * Configuration for Bedrock content generation
 */
export interface BedrockGenerationConfig {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stopSequences?: string[];
}

/**
 * Extended parameters that include both Gemini and Bedrock-specific fields
 */
export interface BedrockGenerateContentRequest {
  model: string;
  messages: MessageParam[];
  system?: string;
  maxTokens: number;
  temperature?: number;
  topP?: number;
  tools?: BedrockTool[];
}

/**
 * Extended request type to handle various property formats
 */
export interface ExtendedGenerateContentParameters {
  contents?: Content[];
  content?: Content[];
  tools?: Tool[];
  tool?: Tool[];
  generationConfig?: {
    maxOutputTokens?: number;
    temperature?: number;
  };
  generation_config?: {
    max_output_tokens?: number;
    temperature?: number;
  };
  systemInstruction?: Content | string;
  system_instruction?: Content | string;
  config?: {
    responseSchema?: Record<string, unknown>;
    responseMimeType?: string;
    systemInstruction?: Content | string;
    maxOutputTokens?: number;
    temperature?: number;
    tools?: Tool[];
  };
}

/**
 * Actual API request format with snake_case fields
 */
export interface BedrockAPIRequest {
  model: string;
  messages: MessageParam[];
  max_tokens: number;
  system?: string;
  temperature?: number;
  top_p?: number;
  tools?: BedrockTool[];
  stream?: boolean;
}

/**
 * Stream chunk types for proper handling
 */
export interface BedrockStreamContentBlock {
  type: 'text' | 'tool_use';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

export interface BedrockStreamDelta {
  type: 'text_delta' | 'input_json_delta';
  text?: string;
  input?: string;
}

export interface BedrockStreamChunk {
  type: 'content_block_start' | 'content_block_delta' | 'content_block_stop' | 'message_start' | 'message_delta' | 'message_stop';
  index?: number;
  delta?: BedrockStreamDelta;
  content_block?: BedrockStreamContentBlock;
  message?: Message;
}

/**
 * Tool-related types
 */
export interface BedrockToolConfig {
  tools: Array<{
    toolSpec: BedrockTool;
  }>;
}

/**
 * Error types for better error handling
 */
export class BedrockError extends Error {
  readonly code?: string;
  readonly statusCode?: number;
  
  constructor(
    message: string,
    code?: string,
    statusCode?: number,
  ) {
    super(message);
    this.name = 'BedrockError';
    this.code = code;
    this.statusCode = statusCode;
  }
}