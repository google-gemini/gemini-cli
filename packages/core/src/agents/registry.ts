/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import type { AgentDefinition } from './types.js';
import { CodebaseInvestigatorAgent } from './codebase-investigator.js';
import { AgentFileLoader } from './file-loader.js';
import { Storage } from '../config/storage.js';
import { type z } from 'zod';
import { debugLogger } from '../utils/debugLogger.js';

/**
 * Manages the discovery, loading, validation, and registration of
 * AgentDefinitions.
 */
export class AgentRegistry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly agents = new Map<string, AgentDefinition<any>>();

  constructor(private readonly config: Config) {}

  /**
   * Discovers and loads agents.
   */
  async initialize(): Promise<void> {
    this.loadBuiltInAgents();
    await this.loadUserAgents();

    if (this.config.getDebugMode()) {
      debugLogger.log(
        `[AgentRegistry] Initialized with ${this.agents.size} agents.`,
      );
    }
  }

  /**
   * Loads user-defined agents from ~/.gemini/agents directory.
   */
  private async loadUserAgents(): Promise<void> {
    try {
      const userAgentsDir = Storage.getUserAgentsDir();
      const loader = new AgentFileLoader();
      const controller = new AbortController();

      const userAgents = await loader.loadAgents(
        userAgentsDir,
        controller.signal,
      );

      for (const agent of userAgents) {
        this.registerAgent(agent);

        if (this.config.getDebugMode()) {
          debugLogger.log(
            `[AgentRegistry] Loaded user agent '${agent.name}' from ${userAgentsDir}`,
          );
        }
      }
    } catch (error) {
      debugLogger.warn('[AgentRegistry] Error loading user agents:', error);
    }
  }

  private loadBuiltInAgents(): void {
    const investigatorSettings = this.config.getCodebaseInvestigatorSettings();

    // Only register the agent if it's enabled in the settings.
    if (investigatorSettings?.enabled) {
      const agentDef = {
        ...CodebaseInvestigatorAgent,
        modelConfig: {
          ...CodebaseInvestigatorAgent.modelConfig,
          model:
            investigatorSettings.model ??
            CodebaseInvestigatorAgent.modelConfig.model,
          thinkingBudget:
            investigatorSettings.thinkingBudget ??
            CodebaseInvestigatorAgent.modelConfig.thinkingBudget,
        },
        runConfig: {
          ...CodebaseInvestigatorAgent.runConfig,
          max_time_minutes:
            investigatorSettings.maxTimeMinutes ??
            CodebaseInvestigatorAgent.runConfig.max_time_minutes,
          max_turns:
            investigatorSettings.maxNumTurns ??
            CodebaseInvestigatorAgent.runConfig.max_turns,
        },
        metadata: {
          icon: '🔍',
          source: 'built-in',
        },
      };
      this.registerAgent(agentDef);
    }
  }

  /**
   * Registers an agent definition. If an agent with the same name exists,
   * it will be overwritten, respecting the precedence established by the
   * initialization order.
   */
  protected registerAgent<TOutput extends z.ZodTypeAny>(
    definition: AgentDefinition<TOutput>,
  ): void {
    // Basic validation
    if (!definition.name || !definition.description) {
      debugLogger.warn(
        `[AgentRegistry] Skipping invalid agent definition. Missing name or description.`,
      );
      return;
    }

    if (this.agents.has(definition.name) && this.config.getDebugMode()) {
      debugLogger.log(`[AgentRegistry] Overriding agent '${definition.name}'`);
    }

    this.agents.set(definition.name, definition);
  }

  /**
   * Retrieves an agent definition by name.
   */
  getDefinition(name: string): AgentDefinition | undefined {
    return this.agents.get(name);
  }

  /**
   * Returns all active agent definitions.
   */
  getAllDefinitions(): AgentDefinition[] {
    return Array.from(this.agents.values());
  }
}
