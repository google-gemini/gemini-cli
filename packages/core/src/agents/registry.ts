/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Storage } from '../config/storage.js';
import { CoreEvent, coreEvents } from '../utils/events.js';
import type { AgentOverride, Config } from '../config/config.js';
import type { AgentDefinition, LocalAgentDefinition } from './types.js';
import { loadAgentsFromDirectory } from './agentLoader.js';
import { CodebaseInvestigatorAgent } from './codebase-investigator.js';
import { CliHelpAgent } from './cli-help-agent.js';
import { GeneralistAgent } from './generalist-agent.js';
import { A2AClientManager } from './a2a-client-manager.js';
import { ADCHandler } from './remote-invocation.js';
import { type z } from 'zod';
import { debugLogger } from '../utils/debugLogger.js';
import { isAutoModel } from '../config/models.js';
import {
  type ModelConfig,
  ModelConfigService,
} from '../services/modelConfigService.js';
import { PolicyDecision, PRIORITY_SUBAGENT_TOOL } from '../policy/types.js';

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly allDefinitions = new Map<string, AgentDefinition<any>>();

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
    this.allDefinitions.clear();
    await this.loadAgents();
    coreEvents.emitAgentsRefreshed();
  }

  /**
   * Acknowledges and registers a previously unacknowledged agent.
   */
  async acknowledgeAgent(agent: AgentDefinition): Promise<void> {
    const ackService = this.config.getAcknowledgedAgentsService();
    const projectRoot = this.config.getProjectRoot();
    if (agent.metadata?.hash) {
      await ackService.acknowledge(
        projectRoot,
        agent.name,
        agent.metadata.hash,
      );
      await this.registerAgent(agent);
      coreEvents.emitAgentsRefreshed();
    }
  }

  /**
   * Disposes of resources and removes event listeners.
   */
  dispose(): void {
    coreEvents.off(CoreEvent.ModelChanged, this.onModelChanged);
  }

  private async loadAgents(): Promise<void> {
    this.agents.clear();
    this.allDefinitions.clear();
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

      const ackService = this.config.getAcknowledgedAgentsService();
      const projectRoot = this.config.getProjectRoot();
      const unacknowledgedAgents: AgentDefinition[] = [];
      const agentsToRegister: AgentDefinition[] = [];

      for (const agent of projectAgents.agents) {
        // If it's a remote agent, use the agentCardUrl as the hash.
        // This allows multiple remote agents in a single file to be tracked independently.
        if (agent.kind === 'remote') {
          if (!agent.metadata) {
            agent.metadata = {};
          }
          agent.metadata.hash = agent.agentCardUrl;
        }

        if (!agent.metadata?.hash) {
          agentsToRegister.push(agent);
          continue;
        }

        const isAcknowledged = await ackService.isAcknowledged(
          projectRoot,
          agent.name,
          agent.metadata.hash,
        );

        if (isAcknowledged) {
          agentsToRegister.push(agent);
        } else {
          unacknowledgedAgents.push(agent);
        }
      }

      if (unacknowledgedAgents.length > 0) {
        coreEvents.emitAgentsDiscovered(unacknowledgedAgents);
      }

      await Promise.allSettled(
        agentsToRegister.map((agent) => this.registerAgent(agent)),
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
    this.registerLocalAgent(CodebaseInvestigatorAgent(this.config));
    this.registerLocalAgent(CliHelpAgent(this.config));
    this.registerLocalAgent(GeneralistAgent(this.config));
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

    this.allDefinitions.set(definition.name, definition);

    const settingsOverrides =
      this.config.getAgentsSettings().overrides?.[definition.name];

    if (!this.isAgentEnabled(definition, settingsOverrides)) {
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
    this.addAgentPolicy(mergedDefinition);
  }

  private addAgentPolicy(definition: AgentDefinition<z.ZodTypeAny>): void {
    const policyEngine = this.config.getPolicyEngine();
    if (!policyEngine) {
      return;
    }

    // If the user has explicitly defined a policy for this tool, respect it.
    // ignoreDynamic=true means we only check for rules NOT added by this registry.
    if (policyEngine.hasRuleForTool(definition.name, true)) {
      if (this.config.getDebugMode()) {
        debugLogger.log(
          `[AgentRegistry] User policy exists for '${definition.name}', skipping dynamic registration.`,
        );
      }
      return;
    }

    // Clean up any old dynamic policy for this tool (e.g. if we are overwriting an agent)
    policyEngine.removeRulesForTool(definition.name, 'AgentRegistry (Dynamic)');

    // Add the new dynamic policy
    policyEngine.addRule({
      toolName: definition.name,
      decision:
        definition.kind === 'local'
          ? PolicyDecision.ALLOW
          : PolicyDecision.ASK_USER,
      priority: PRIORITY_SUBAGENT_TOOL,
      source: 'AgentRegistry (Dynamic)',
    });
  }

  private isAgentEnabled<TOutput extends z.ZodTypeAny>(
    definition: AgentDefinition<TOutput>,
    overrides?: AgentOverride,
  ): boolean {
    const isExperimental = definition.experimental === true;
    let isEnabled = !isExperimental;

    if (overrides && overrides.enabled !== undefined) {
      isEnabled = overrides.enabled;
    }

    return isEnabled;
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

    this.allDefinitions.set(definition.name, definition);

    const overrides =
      this.config.getAgentsSettings().overrides?.[definition.name];

    if (!this.isAgentEnabled(definition, overrides)) {
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
      this.addAgentPolicy(definition);
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

    // Use Object.create to preserve lazy getters on the definition object
    const merged: LocalAgentDefinition<TOutput> = Object.create(definition);

    if (overrides.runConfig) {
      merged.runConfig = {
        ...definition.runConfig,
        ...overrides.runConfig,
      };
    }

    if (overrides.modelConfig) {
      merged.modelConfig = ModelConfigService.merge(
        definition.modelConfig,
        overrides.modelConfig,
      );
    }

    return merged;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getDefinition(name: string): AgentDefinition<any> | undefined {
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
   * Returns a list of all discovered agent names, regardless of whether they are enabled.
   */
  getAllDiscoveredAgentNames(): string[] {
    return Array.from(this.allDefinitions.keys());
  }

  /**
   * Retrieves a discovered agent definition by name.
   */
  getDiscoveredDefinition(name: string): AgentDefinition | undefined {
    return this.allDefinitions.get(name);
  }
}
