/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import type { Config } from '../config/config.js';

// ---------------------------------------------------------------------------
// Event Payloads
// ---------------------------------------------------------------------------

export interface SessionStartPayload {
  sessionId: string;
  resumed: boolean;
  workspaceDir: string;
}

export interface UserInputPayload {
  userMessage: string;
}

export interface ContextEvictedPayload {
  reason: 'compress' | 'truncate';
  evictedTurns: Content[];
  summary?: string;
}

export interface PreCompressPayload {
  messages: Content[];
}

export interface TurnCompletePayload {
  turnIndex: number;
  userContent: string;
  assistantContent: string;
}

export interface IdlePayload {
  idleDurationMs: number;
}

export interface SessionEndPayload {
  messages: Content[];
  reason: 'exit' | 'clear';
}

// ---------------------------------------------------------------------------
// Event Result
// ---------------------------------------------------------------------------

/**
 * Result returned by inject-capable event methods (e.g. onUserInput).
 * If `inject` is set, the content is injected into the current prompt.
 */
export interface MemoryEventResult {
  inject?: string;
}

// ---------------------------------------------------------------------------
// Provider Context
// ---------------------------------------------------------------------------

export interface MemoryProviderContext {
  config: Config;
  signal: AbortSignal;
  sessionId: string;
  workspaceDir: string;
}

// ---------------------------------------------------------------------------
// MemoryProvider Interface
// ---------------------------------------------------------------------------

/**
 * A pluggable memory provider that responds to CLI lifecycle events.
 *
 * Providers implement the event methods they care about — implementing a
 * method implicitly subscribes to that event. All methods are optional
 * except `name`.
 *
 * Lifecycle:
 *   initialize() → onSessionStart() → onUserInput() / onTurnComplete() /
 *   onContextEvicted() / onIdle() → onSessionEnd() → shutdown()
 */
export interface MemoryProvider {
  // --- Identity ---

  /** Short identifier for this provider (e.g. 'default', 'rag', 'vector'). */
  readonly name: string;

  // --- Lifecycle ---

  /** Called once when the provider is registered with MemoryService. */
  initialize?(config: Config, ctx: MemoryProviderContext): Promise<void>;

  /** Called on CLI shutdown. Clean up resources, flush queues. */
  shutdown?(): Promise<void>;

  // --- Event Methods ---

  /** Session started — connect, warm up, create resources. */
  onSessionStart?(
    payload: SessionStartPayload,
    ctx: MemoryProviderContext,
  ): Promise<void>;

  /**
   * User input received — return context to inject into prompt, or void.
   * This is the only event method that may return a result.
   */
  onUserInput?(
    payload: UserInputPayload,
    ctx: MemoryProviderContext,
  ): Promise<MemoryEventResult | void>;

  /** Context evicted — extract/preserve before turns are discarded. */
  onContextEvicted?(
    payload: ContextEvictedPayload,
    ctx: MemoryProviderContext,
  ): Promise<void>;

  /**
   * Called before context compression. Return text that the compressor
   * should preserve in its summary (e.g. recalled facts, user preferences).
   * Return empty string or void to skip.
   */
  onPreCompress?(
    payload: PreCompressPayload,
    ctx: MemoryProviderContext,
  ): Promise<string | void>;

  /** Turn complete — sync turn data, queue next prefetch. */
  onTurnComplete?(
    payload: TurnCompletePayload,
    ctx: MemoryProviderContext,
  ): Promise<void>;

  /**
   * Idle — triggered when user idle duration exceeds this provider's threshold.
   * Set `idleThresholdMs` to control when this fires.
   */
  onIdle?(payload: IdlePayload, ctx: MemoryProviderContext): Promise<void>;

  /** Minimum idle duration (ms) before onIdle fires. Default: 0. */
  readonly idleThresholdMs?: number;

  /** Session ended — flush, persist. */
  onSessionEnd?(
    payload: SessionEndPayload,
    ctx: MemoryProviderContext,
  ): Promise<void>;

  /**
   * Built-in save_memory tool was called — mirror writes to your backend.
   */
  onMemoryWrite?(
    action: 'add' | 'replace' | 'remove',
    target: 'memory' | 'user',
    content: string,
  ): Promise<void>;

  // --- Tool Surface ---

  /** Tool schemas to expose to the model. Return empty array if none. */
  getToolSchemas?(): unknown[];

  /** Handle a tool call for one of this provider's tools. */
  handleToolCall?(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<string>;

  // --- Prompt Contribution ---

  /** Static text to include in the system prompt. Return empty string to skip. */
  systemPromptBlock?(): string;
}
