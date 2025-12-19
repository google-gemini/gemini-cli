/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Storage } from '../config/storage.js';
import { coreEvents, CoreEvent } from '../utils/events.js';
import type { Config } from '../config/config.js';
import type { AgentDefinition } from './types.js';
import { loadAgentsFromDirectory } from './toml-loader.js';
import { CodebaseInvestigatorAgent } from './codebase-investigator.js';
import { IntrospectionAgent } from './introspection-agent.js';
import { type z } from 'zod';
import { debugLogger } from '../utils/debugLogger.js';
import {
  DEFAULT_GEMINI_MODEL,
  GEMINI_MODEL_ALIAS_AUTO,
  PREVIEW_GEMINI_FLASH_MODEL,
  isPreviewModel,
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

    coreEvents.on(CoreEvent.ModelChanged, () => {
      this.refreshAgents();
    });

    if (!this.config.isAgentsEnabled()) {
      return;
    }

    // Load user-level agents: ~/.gemini/agents/
    const userAgentsDir = Storage.getUserAgentsDir();
    const userAgents = await loadAgentsFromDirectory(userAgentsDir);
    for (const error of userAgents.errors) {
      debugLogger.warn(
        `[AgentRegistry] Error loading user agent: ${error.message}`,
      );
      coreEvents.emitFeedback('error', `Agent loading error: ${error.message}`);
    }
    for (const agent of userAgents.agents) {
      this.registerAgent(agent);
    }

    // Load project-level agents: .gemini/agents/ (relative to Project Root)
    const folderTrustEnabled = this.config.getFolderTrust();
    const isTrustedFolder = this.config.isTrustedFolder();

    if (!folderTrustEnabled || isTrustedFolder) {
      const projectAgentsDir = this.config.storage.getProjectAgentsDir();
      const projectAgents = await loadAgentsFromDirectory(projectAgentsDir);
      for (const error of projectAgents.errors) {
        coreEvents.emitFeedback(
          'error',
          `Agent loading error: ${error.message}`,
        );
      }
      for (const agent of projectAgents.agents) {
        this.registerAgent(agent);
      }
    } else {
      coreEvents.emitFeedback(
        'info',
        'Skipping project agents due to untrusted folder. To enable, ensure that the project root is trusted.',
      );
    }

    if (this.config.getDebugMode()) {
      debugLogger.log(
        `[AgentRegistry] Initialized with ${this.agents.size} agents.`,
      );
    }
  }

  private loadBuiltInAgents(): void {
    const investigatorSettings = this.config.getCodebaseInvestigatorSettings();
    const introspectionSettings = this.config.getIntrospectionAgentSettings();

    // Only register the agent if it's enabled in the settings.
    if (investigatorSettings?.enabled) {
      let model;
      const settingsModel = investigatorSettings.model;
      // Check if the user explicitly set a model in the settings.
      if (settingsModel && settingsModel !== GEMINI_MODEL_ALIAS_AUTO) {
        model = settingsModel;
      } else {
        // Use Preview Flash model if the main model is any of the preview models
        // If the main model is not preview model, use default pro model.
        model = isPreviewModel(this.config.getModel())
          ? PREVIEW_GEMINI_FLASH_MODEL
          : DEFAULT_GEMINI_MODEL;
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

    // Register the introspection agent if it's explicitly enabled.
    if (introspectionSettings.enabled) {
      this.registerAgent(IntrospectionAgent);
    }
  }

  private refreshAgents(): void {
    this.loadBuiltInAgents();
    for (const agent of this.agents.values()) {
      this.registerAgent(agent);
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
    if (definition.kind === 'local') {
      const modelConfig = definition.modelConfig;
      let model = modelConfig.model;
      if (model === 'inherit') {
        model = this.config.getModel();
      }

      const runtimeAlias: ModelConfigAlias = {
        modelConfig: {
          model,
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

    // Register configured remote A2A agents.
    // TODO: Implement remote agent registration.
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

    return `Delegates a task to a specialized sub-agent.\n\nAvailable agents:\n${agentDescriptions}`;
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

    for (const [name, def] of this.agents) {
      context += `- **${name}**: ${def.description}\n`;
    }
    return context;
  }
}
