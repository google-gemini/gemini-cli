/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type PartListUnion,
  type GenerateContentResponse,
  type Tool,
} from '@google/genai';
import type { ModelConfigKey } from '../services/modelConfigService.js';
import type { ToolCallRequestInfo } from '../scheduler/types.js';

/**
 * Events emitted by a Model during generation (usually streaming).
 */
export type ModelEvent =
  | { type: 'chunk'; content: GenerateContentResponse }
  | { type: 'thought'; content: string }
  | { type: 'tool_call'; call: ToolCallRequestInfo }
  | { type: 'finished'; reason: string }
  | { type: 'error'; error: Error };

/**
 * Options for generating content with a Model.
 */
export interface ModelGenerationOptions {
  /** The model configuration to use (e.g., model name, provider) */
  model?: ModelConfigKey;
  /** Tools available to the model for this generation */
  tools?: Tool[];
  /** System instruction or preamble */
  systemInstruction?: string;
  /** The maximum number of tokens to generate */
  maxOutputTokens?: number;
  /** Sampling temperature */
  temperature?: number;
  /** Top-p sampling */
  topP?: number;
  /** Top-k sampling */
  topK?: number;
  /** Stop sequences */
  stopSequences?: string[];
  /** Signal to abort the request */
  signal?: AbortSignal;
}

/**
 * The core Model interface.
 * A Model abstracts the underlying LLM provider (e.g., Gemini, OpenAI, Anthropic).
 * It takes input messages and returns generated content or events.
 */
export interface Model {
  /**
   * Generates a complete response (non-streaming).
   *
   * @param input The messages or content to generate from.
   * @param options Generation options.
   * @returns The complete generated response.
   */
  generate(
    input: PartListUnion,
    options?: ModelGenerationOptions,
  ): Promise<GenerateContentResponse>;

  /**
   * Generates a streaming response.
   *
   * @param input The messages or content to generate from.
   * @param options Generation options.
   * @returns An async generator yielding model events.
   */
  generateStream(
    input: PartListUnion,
    options?: ModelGenerationOptions,
  ): AsyncGenerator<ModelEvent, void, void>;
}
