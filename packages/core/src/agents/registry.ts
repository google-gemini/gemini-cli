/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import type { AgentDefinition } from './types.js';
import { CodebaseInvestigatorAgent } from './codebase-investigator.js';
import { type z } from 'zod';
import { debugLogger } from '../utils/debugLogger.js';
import {
  DEFAULT_GEMINI_MODEL_AUTO,
  GEMINI_MODEL_ALIAS_PRO,
  PREVIEW_GEMINI_MODEL,
} from '../config/models.js';
import type { ModelConfigAlias } from '../services/modelConfigService.js';

/**
 * Returns the model config alias for a given agent definition.
 */
export function getModelConfigAlias<TOutput extends z.ZodTypeAny>(
  definition: AgentDefinition<TOutput>,
): string {
  return `${definition.name}-config`;
}

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

    if (this.config.getDebugMode()) {
      debugLogger.log(
        `[AgentRegistry] Initialized with ${this.agents.size} agents.`,
      );
    }
  }

  private loadBuiltInAgents(): void {
    const investigatorSettings = this.config.getCodebaseInvestigatorSettings();

    // Only register the agent if it's enabled in the settings.
    if (investigatorSettings?.enabled) {
      let model =
        investigatorSettings.model ??
        CodebaseInvestigatorAgent.modelConfig.model;

      // If the user is using the preview model for the main agent, force the sub-agent to use it too
      // if it's configured to use 'pro' or 'auto'.
      if (this.config.getModel() === PREVIEW_GEMINI_MODEL) {
        if (
          model === GEMINI_MODEL_ALIAS_PRO ||
          model === DEFAULT_GEMINI_MODEL_AUTO
        ) {
          model = PREVIEW_GEMINI_MODEL;
        }
      }

      const agentDef = {
        ...CodebaseInvestigatorAgent,
        modelConfig: {
          ...CodebaseInvestigatorAgent.modelConfig,
          model,
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

    // Register model config.
    // TODO(12916): Migrate sub-agents where possible to static configs.
    const modelConfig = definition.modelConfig;

    const runtimeAlias: ModelConfigAlias = {
      modelConfig: {
        model: modelConfig.model,
        generateContentConfig: {
          temperature: modelConfig.temp,
          topP: modelConfig.top_p,
          thinkingConfig: {
            includeThoughts: true,
            thinkingBudget: modelConfig.thinkingBudget ?? -1,
          },
        },
      },
    };

    this.config.modelConfigService.registerRuntimeModelConfig(
      getModelConfigAlias(definition),
      runtimeAlias,
    );
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

  /**
   * Returns a list of all registered agent names.
   */
  getAllAgentNames(): string[] {
    return Array.from(this.agents.keys());
  }

  /**
   * Generates a description for the delegate_to_agent tool.
   * Unlike getDirectoryContext() which is for system prompts,
   * this is formatted for tool descriptions.
   */
  getToolDescription(): string {
    if (this.agents.size === 0) {
      return 'Delegates a task to a specialized sub-agent. No agents are currently available.';
    }

    const agentDescriptions = Array.from(this.agents.entries())
      .map(([name, def]) => `- **${name}**: ${def.description}`)
      .join('\n');

    return `Delegates a task to a specialized sub-agent.

Available agents:
${agentDescriptions}`;
  }

  /**
   * Generates a markdown "Phone Book" of available agents and their schemas.
   * This MUST be injected into the System Prompt of the parent agent.
   */
  getDirectoryContext(): string {
    if (this.agents.size === 0) {
      return 'No sub-agents are currently available.';
    }

    let context = '## Available Sub-Agents\n';
    context +=
      'Use `delegate_to_agent` for complex tasks requiring specialized analysis.\n\n';

    for (const [name, def] of this.agents.entries()) {
      context += `- **${name}**: ${def.description}\n`;
    }
    return context;
  }
}
