/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ToolCallRequestInfo,
  ToolCallResponseInfo,
} from '../scheduler/types.js';

/**
 * Events emitted by an Agent during its execution.
 * These provide visibility into the agent's thought process and actions.
 */
export type AgentEvent =
  | { type: 'thought'; content: string }
  | { type: 'content'; content: string } // Text output meant for the user
  | { type: 'tool_call'; call: ToolCallRequestInfo }
  | { type: 'tool_result'; result: ToolCallResponseInfo }
  | { type: 'call_code'; code: { code: string; language: string } }
  | { type: 'code_result'; result: { outcome: string; output: string } }
  | { type: 'tool_confirmation'; confirmations: Record<string, unknown> }
  | { type: 'error'; error: Error }
  | { type: 'activity'; kind: string; detail: Record<string, unknown> } // Generic activity hook
  | { type: 'finished'; output?: unknown };

/**
 * Options to control a specific run of an agent.
 */
export interface AgentRunOptions {
  /** Signal to abort the execution */
  signal?: AbortSignal;
  /** Override the configured maximum number of turns */
  maxTurns?: number;
  /** Override the configured maximum execution time */
  maxTime?: number;
  /** Optional session ID for stateful conversations */
  sessionId?: string;
  /** Optional state delta to initialize the session with */
  stateDelta?: Record<string, unknown>;
  /** Optional prompt ID for tracing */
  prompt_id?: string;
}

/**
 * The core Agent interface.
 * An Agent is an entity that takes an input and executes a loop (Model -> Tools -> Model)
 * until a termination condition is met, yielding events along the way.
 *
 * @template TInput The type of input the agent expects (e.g., string, object).
 * @template TOutput The type of the final result the agent returns.
 */
export interface Agent<TInput = unknown, TOutput = unknown> {
  /** The unique name of the agent */
  readonly name: string;
  /** A human-readable description of what the agent does */
  readonly description: string;

  /**
   * Executes the agent's logic sequentially with persisted state.
   *
   * @param input The input task or data.
   * @param options Execution options.
   * @returns An async generator that yields events and returns the final result.
   */
  runAsync(
    input: TInput,
    options?: AgentRunOptions,
  ): AsyncGenerator<AgentEvent, TOutput>;

  /**
   * Executes the agent's logic statelessly for a single turn.
   */
  runEphemeral(
    input: TInput,
    options?: AgentRunOptions,
  ): AsyncGenerator<AgentEvent, TOutput>;
}
