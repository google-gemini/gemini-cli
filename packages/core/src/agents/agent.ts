/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Part } from '@google/genai';
import { type Config } from '../config/config.js';
import { type AgentEvent, type AgentConfig } from './types.js';
import { AgentSession } from './session.js';

/**
 * The Agent class is a factory for creating stateful AgentSessions.
 * This represents a configured agent template.
 */
export class Agent {
  constructor(
    private readonly config: AgentConfig,
    private readonly runtime: Config,
  ) {}

  /**
   * Creates a new stateful session for interacting with the agent.
   */
  createSession(sessionId?: string): AgentSession {
    const id = sessionId ?? this.runtime.getSessionId();
    return new AgentSession(id, this.config, this.runtime);
  }

  /**
   * Helper to quickly run a single prompt and get the results.
   */
  async *prompt(
    input: string | Part[],
    sessionId?: string,
    signal?: AbortSignal,
  ): AsyncIterable<AgentEvent> {
    const session = this.createSession(sessionId);
    yield* session.prompt(input, signal);
  }
}
