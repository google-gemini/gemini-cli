/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export enum ModelProviderType {
  GEMINI = 'gemini',
  OPENAI = 'openai', 
  LM_STUDIO = 'lm_studio',
  ANTHROPIC = 'anthropic',
  CUSTOM = 'custom'
}

export enum AuthType {
  GEMINI_API_KEY = 'gemini_api_key',
  GEMINI_OAUTH = 'gemini_oauth',
  OPENAI_API_KEY = 'openai_api_key',
  LM_STUDIO = 'lm_studio',
  ANTHROPIC_API_KEY = 'anthropic_api_key',
  VERTEX_AI = 'vertex_ai',
  CUSTOM = 'custom'
}

export interface ModelProviderConfig {
  type: ModelProviderType;
  apiKey?: string;
  baseUrl?: string;
  model: string;
  authType?: AuthType;
  additionalConfig?: Record<string, unknown>;
  displayName?: string;
  isDefault?: boolean;
  lastUsed?: Date;
}

export interface UniversalMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface UniversalResponse {
  content: string;
  toolCalls?: ToolCall[];
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model?: string;
}

export interface UniversalStreamEvent {
  type: 'content' | 'tool_call' | 'done' | 'error';
  content?: string;
  toolCall?: ToolCall;
  response?: UniversalResponse;
  error?: Error;
}

export interface ProviderCapabilities {
  supportsStreaming: boolean;
  supportsToolCalls: boolean;
  supportsSystemMessages: boolean;
  supportsImages: boolean;
  maxTokens: number;
  maxMessages: number;
}

export interface ConnectionStatus {
  status: 'connected' | 'disconnected' | 'error' | 'connecting';
  lastChecked: Date;
  error?: string;
  latency?: number;
}