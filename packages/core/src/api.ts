/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ToolCall } from './tools/tools.js';

export interface CoreOptions {
  args: string[]; // Raw command line arguments
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdin?: string; // Optional initial input
}

export interface InitializationResult {
  needsAuth: boolean;
  authUrl?: string;
  warnings: string[];
}

export interface ResponseChunk {
  text?: string;
  toolCall?: ToolCall;
  toolOutput?: ToolOutput;
  done: boolean;
}

export interface ToolOutput {
  toolCallId: string;
  output: string;
}

export interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: number;
}

export interface HistoryItem {
  role: 'user' | 'model';
  parts: any[]; // Replace with actual Part type
}

export interface ConfigView {
  // Read-only view of the configuration
  readonly model: string;
  readonly debugMode: boolean;
  // ... add other necessary config properties
}

export interface CoreClient {
  /**
   * Initializes the core client, loading configuration and checking authentication status.
   */
  initialize(): Promise<InitializationResult>;

  /**
   * Starts a new session with the given input.
   */
  startSession(input: string): Promise<void>;

  /**
   * Stops the current session.
   */
  stopSession(): Promise<void>;

  /**
   * Executes a prompt in the current session and yields streaming response chunks.
   */
  executePrompt(prompt: string): Promise<AsyncIterable<ResponseChunk>>;

  /**
   * Cancels the currently executing prompt.
   */
  cancelPrompt(): void;

  /**
   * Returns a read-only view of the current configuration.
   */
  getConfig(): ConfigView;

  /**
   * Returns the conversation history of the current session.
   */
  getHistory(): HistoryItem[];

  /**
   * Registers an event listener.
   */
  on(event: 'log', listener: (log: LogEntry) => void): void;
  on(event: 'tool-call', listener: (call: ToolCall) => void): void;
  on(event: 'tool-output', listener: (output: ToolOutput) => void): void;
}

/**
 * Factory function to create the core client.
 */
export function createCoreClient(options: CoreOptions): CoreClient {
  throw new Error('Not implemented');
}
