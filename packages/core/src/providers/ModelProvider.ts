/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
}

export type ModelEvent =
  | { type: 'chunk'; text: string }
  | { type: 'complete'; fullText: string }
  | { type: 'error'; error: Error };

export interface ModelProvider {
  readonly name: string;
  chat(request: ChatRequest): AsyncIterable<ModelEvent>;
  isAvailable(): Promise<boolean>;
}
