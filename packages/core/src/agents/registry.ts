/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Storage } from '../config/storage.js';
import { coreEvents, CoreEvent } from '../utils/events.js';
import type { AgentOverride, Config } from '../config/config.js';
import type { AgentDefinition, LocalAgentDefinition } from './types.js';
import { loadAgentsFromDirectory } from './agentLoader.js';
import { CodebaseInvestigatorAgent } from './codebase-investigator.js';
import { CliHelpAgent } from './cli-help-agent.js';
import { A2AClientManager } from './a2a-client-manager.js';
import { ADCHandler } from './remote-invocation.js';
import { type z } from 'zod';
import { debugLogger } from '../utils/debugLogger.js';
import {
  DEFAULT_GEMINI_MODEL,
  GEMINI_MODEL_ALIAS_AUTO,
  PREVIEW_GEMINI_FLASH_MODEL,
  isPreviewModel,
  isAutoModel,
} from '../config/models.js';
import {
  type ModelConfig,
  ModelConfigService,
} from '../services/modelConfigService.js';

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
    coreEvents.on(CoreEvent.ModelChanged, this.onModelChanged);

    await this.loadAgents();
  }

  private onModelChanged = () => {
    this.refreshAgents().catch((e) => {
      debugLogger.error(
        '[AgentRegistry] Failed to refresh agents on model change:',
        e,
      );
    });
  };

  /**
   * Clears the current registry and re-scans for agents.
   */
  async reload(): Promise<void> {
    A2AClientManager.getInstance().clearCache();
    await this.config.reloadAgents();
    this.agents.clear();
    await this.loadAgents();
    coreEvents.emitAgentsRefreshed();
  }

  /**
   * Disposes of resources and removes event listeners.
   */
  dispose(): void {
    coreEvents.off(CoreEvent.ModelChanged, this.onModelChanged);
  }

  private async loadAgents(): Promise<void> {
    this.loadBuiltInAgents();

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
    await Promise.allSettled(
      userAgents.agents.map((agent) => this.registerAgent(agent)),
    );

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
      await Promise.allSettled(
        projectAgents.agents.map((agent) => this.registerAgent(agent)),
      );
    } else {
      coreEvents.emitFeedback(
        'info',
        'Skipping project agents due to untrusted folder. To enable, ensure that the project root is trusted.',
      );
    }

    // Load agents from extensions
    for (const extension of this.config.getExtensions()) {
      if (extension.isActive && extension.agents) {
        await Promise.allSettled(
          extension.agents.map((agent) => this.registerAgent(agent)),
        );
      }
    }

    if (this.config.getDebugMode()) {
      debugLogger.log(
        `[AgentRegistry] Loaded with ${this.agents.size} agents.`,
      );
    }
  }

  private loadBuiltInAgents(): void {
    const investigatorSettings = this.config.getCodebaseInvestigatorSettings();
    const cliHelpSettings = this.config.getCliHelpAgentSettings();
    const agentsSettings = this.config.getAgentsSettings();
    const agentsOverrides = agentsSettings.overrides ?? {};

    // Only register the agent if it's enabled in the settings and not explicitly disabled via overrides.
    if (
      investigatorSettings?.enabled &&
      !agentsOverrides[CodebaseInvestigatorAgent.name]?.disabled
    ) {
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
          generateContentConfig: {
            ...CodebaseInvestigatorAgent.modelConfig.generateContentConfig,
            thinkingConfig: {
              ...CodebaseInvestigatorAgent.modelConfig.generateContentConfig
                ?.thinkingConfig,
              thinkingBudget:
                investigatorSettings.thinkingBudget ??
                CodebaseInvestigatorAgent.modelConfig.generateContentConfig
                  ?.thinkingConfig?.thinkingBudget,
            },
          },
        },
        runConfig: {
          ...CodebaseInvestigatorAgent.runConfig,
          maxTimeMinutes:
            investigatorSettings.maxTimeMinutes ??
            CodebaseInvestigatorAgent.runConfig.maxTimeMinutes,
          maxTurns:
            investigatorSettings.maxNumTurns ??
            CodebaseInvestigatorAgent.runConfig.maxTurns,
        },
      };
      this.registerLocalAgent(agentDef);
    }

    // Register the CLI help agent if it's explicitly enabled and not explicitly disabled via overrides.
    if (
      cliHelpSettings.enabled &&
      !agentsOverrides[CliHelpAgent.name]?.disabled
    ) {
      this.registerLocalAgent(CliHelpAgent(this.config));
    }
  }

  private async refreshAgents(): Promise<void> {
    this.loadBuiltInAgents();
    await Promise.allSettled(
      Array.from(this.agents.values()).map((agent) =>
        this.registerAgent(agent),
      ),
    );
  }

  /**
   * Registers an agent definition. If an agent with the same name exists,
   * it will be overwritten, respecting the precedence established by the
   * initialization order.
   */
  protected async registerAgent<TOutput extends z.ZodTypeAny>(
    definition: AgentDefinition<TOutput>,
  ): Promise<void> {
    if (definition.kind === 'local') {
      this.registerLocalAgent(definition);
    } else if (definition.kind === 'remote') {
      await this.registerRemoteAgent(definition);
    }
  }

  /**
   * Registers a local agent definition synchronously.
   */
  protected registerLocalAgent<TOutput extends z.ZodTypeAny>(
    definition: AgentDefinition<TOutput>,
  ): void {
    if (definition.kind !== 'local') {
      return;
    }

    // Basic validation
    if (!definition.name || !definition.description) {
      debugLogger.warn(
        `[AgentRegistry] Skipping invalid agent definition. Missing name or description.`,
      );
      return;
    }

    const settingsOverrides =
      this.config.getAgentsSettings().overrides?.[definition.name];
    if (settingsOverrides?.disabled) {
      if (this.config.getDebugMode()) {
        debugLogger.log(
          `[AgentRegistry] Skipping disabled agent '${definition.name}'`,
        );
      }
      return;
    }

    if (this.agents.has(definition.name) && this.config.getDebugMode()) {
      debugLogger.log(`[AgentRegistry] Overriding agent '${definition.name}'`);
    }

    const mergedDefinition = this.applyOverrides(definition, settingsOverrides);
    this.agents.set(mergedDefinition.name, mergedDefinition);

    this.registerModelConfigs(mergedDefinition);
  }

  /**
   * Registers a remote agent definition asynchronously.
   */
  protected async registerRemoteAgent<TOutput extends z.ZodTypeAny>(
    definition: AgentDefinition<TOutput>,
  ): Promise<void> {
    if (definition.kind !== 'remote') {
      return;
    }

    // Basic validation
    if (!definition.name || !definition.description) {
      debugLogger.warn(
        `[AgentRegistry] Skipping invalid agent definition. Missing name or description.`,
      );
      return;
    }

    const overrides =
      this.config.getAgentsSettings().overrides?.[definition.name];
    if (overrides?.disabled) {
      if (this.config.getDebugMode()) {
        debugLogger.log(
          `[AgentRegistry] Skipping disabled remote agent '${definition.name}'`,
        );
      }
      return;
    }

    if (this.agents.has(definition.name) && this.config.getDebugMode()) {
      debugLogger.log(`[AgentRegistry] Overriding agent '${definition.name}'`);
    }

    // Log remote A2A agent registration for visibility.
    try {
      const clientManager = A2AClientManager.getInstance();
      // Use ADCHandler to ensure we can load agents hosted on secure platforms (e.g. Vertex AI)
      const authHandler = new ADCHandler();
      const agentCard = await clientManager.loadAgent(
        definition.name,
        definition.agentCardUrl,
        authHandler,
      );
      if (agentCard.skills && agentCard.skills.length > 0) {
        definition.description = agentCard.skills
          .map(
            (skill: { name: string; description: string }) =>
              `${skill.name}: ${skill.description}`,
          )
          .join('\n');
      }
      if (this.config.getDebugMode()) {
        debugLogger.log(
          `[AgentRegistry] Registered remote agent '${definition.name}' with card: ${definition.agentCardUrl}`,
        );
      }
      this.agents.set(definition.name, definition);
    } catch (e) {
      debugLogger.warn(
        `[AgentRegistry] Error loading A2A agent "${definition.name}":`,
        e,
      );
    }
  }

  private applyOverrides<TOutput extends z.ZodTypeAny>(
    definition: LocalAgentDefinition<TOutput>,
    overrides?: AgentOverride,
  ): LocalAgentDefinition<TOutput> {
    if (definition.kind !== 'local' || !overrides) {
      return definition;
    }

    return {
      ...definition,
      runConfig: {
        ...definition.runConfig,
        ...overrides.runConfig,
      },
      modelConfig: ModelConfigService.merge(
        definition.modelConfig,
        overrides.modelConfig ?? {},
      ),
    };
  }

  private registerModelConfigs<TOutput extends z.ZodTypeAny>(
    definition: LocalAgentDefinition<TOutput>,
  ): void {
    const modelConfig = definition.modelConfig;
    let model = modelConfig.model;
    if (model === 'inherit') {
      model = this.config.getModel();
    }

    const agentModelConfig: ModelConfig = {
      ...modelConfig,
      model,
    };

    this.config.modelConfigService.registerRuntimeModelConfig(
      getModelConfigAlias(definition),
      {
        modelConfig: agentModelConfig,
      },
    );

    if (agentModelConfig.model && isAutoModel(agentModelConfig.model)) {
      this.config.modelConfigService.registerRuntimeModelOverride({
        match: {
          overrideScope: definition.name,
        },
        modelConfig: {
          generateContentConfig: agentModelConfig.generateContentConfig,
        },
      });
    }
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
