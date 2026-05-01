/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GeminiClient } from '../core/client.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import type { PromptRegistry } from '../prompts/prompt-registry.js';
import type { ResourceRegistry } from '../resources/resource-registry.js';
import type { SandboxManager } from '../services/sandboxManager.js';
import type { Config } from './config.js';

/**
 * AgentLoopContext represents the execution-scoped view of the world for a single
 * agent turn or sub-agent loop.
 */
export interface AgentLoopContext {
  /** The global runtime configuration. */
  readonly config: Config;

  /** The unique ID for the current user turn or agent thought loop. */
  readonly promptId: string;

  /** The unique ID for the parent session if this is a subagent. */
  readonly parentSessionId?: string;

  /** The registry of tools available to the agent in this context. */
  readonly toolRegistry: ToolRegistry;

  /** The registry of prompts available to the agent in this context. */
  readonly promptRegistry: PromptRegistry;

  /** The registry of resources available to the agent in this context. */
  readonly resourceRegistry: ResourceRegistry;

  /** The bus for user confirmations and messages in this context. */
  readonly messageBus: MessageBus;

  /** The client used to communicate with the LLM in this context. */
  readonly geminiClient: GeminiClient;

  /** The service used to prepare commands for sandboxed execution. */
  readonly sandboxManager: SandboxManager;
}
