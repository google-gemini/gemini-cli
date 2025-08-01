/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface DatabricksConfig {
  workspace_host: string;
  auth_token: string;
  model: string;
}

// Custom types that extend the @google/genai types with additional fields
export interface DatabricksGenerateContentParameters {
  prompt: string;
  model: string;
  systemInstruction?: { text: string };
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
    topP?: number;
    stopSequences?: string[];
  };
  config?: {
    abortSignal?: AbortSignal;
  };
}

export interface DatabricksMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface DatabricksRequest {
  messages: DatabricksMessage[];
  max_tokens: number;
  temperature?: number;
  top_p?: number;
  stop?: string[];
  stream?: boolean;
}

export interface DatabricksChoice {
  index: number;
  message?: {
    role: string;
    content: string;
  };
  delta?: {
    content?: string;
  };
  finish_reason?: string;
}

export interface DatabricksUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface DatabricksResponse {
  id: string;
  object?: string;
  created?: number;
  model?: string;
  choices: DatabricksChoice[];
  usage?: DatabricksUsage;
}

export interface DatabricksStreamChunk {
  id: string;
  object?: string;
  created?: number;
  model?: string;
  choices: DatabricksChoice[];
  usage?: DatabricksUsage;
}

// Model mapping from Claude/Anthropic names to Databricks endpoints
export const DATABRICKS_MODEL_MAPPING: Record<string, string> = {
  'claude-3-5-sonnet-latest': 'databricks-dbrx-instruct',
  'claude-3-5-haiku-latest': 'databricks-meta-llama-3-1-70b-instruct',
  'claude-3-opus-latest': 'databricks-meta-llama-3-1-405b-instruct',
  // Gemini model mappings
  'gemini-2.5-pro': 'databricks-dbrx-instruct',
  'gemini-2.5-flash': 'databricks-meta-llama-3-1-70b-instruct',
  'gemini-2.5-flash-lite': 'databricks-meta-llama-3-1-8b-instruct',
};

// Available Databricks models
export const DATABRICKS_MODELS = [
  'databricks-dbrx-instruct',
  'databricks-meta-llama-3-1-405b-instruct',
  'databricks-meta-llama-3-1-70b-instruct',
  'databricks-meta-llama-3-1-8b-instruct',
  'databricks-bge-large-en',
  'databricks-gte-large-en',
  'databricks-llm-mixer',
];
