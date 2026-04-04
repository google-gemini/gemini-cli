/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type TeamDefinition, type AgentDefinition } from './types.js';
import { type Config } from '../config/config.js';
import { Storage } from '../config/storage.js';
import { type AgentRegistry } from './registry.js';
import { loadTeamsFromDirectory, type TeamLoadResult } from './teamLoader.js';
import { coreEvents } from '../utils/events.js';
import { debugLogger } from '../utils/debugLogger.js';

/**
 * Manages the discovery, loading, and active state of Agent Teams.
 */
export class TeamRegistry {
  private readonly teams = new Map<string, TeamDefinition>();
  private activeTeamName?: string;

  constructor(
    private readonly config: Config,
    private readonly agentRegistry: AgentRegistry,
  ) {}

  /**
   * Discovers and loads teams from the global and project-level directories.
   */
  async initialize(): Promise<void> {
    await this.loadTeams();
  }

  /**
   * Clears the current registry and re-scans for teams.
   */
  async reload(): Promise<void> {
    await this.loadTeams();
  }

  private async loadTeams(): Promise<void> {
    this.teams.clear();

    if (!this.config.isAgentsEnabled()) {
      return;
    }

    // Load user-level teams first
    const userTeamsDir = Storage.getUserTeamsDir();
    const userLoadResult = await loadTeamsFromDirectory(userTeamsDir);
    await this.processLoadResult(userLoadResult);

    const folderTrustEnabled = this.config.getFolderTrust();
    const isTrustedFolder = this.config.isTrustedFolder();

    if (folderTrustEnabled && !isTrustedFolder) {
      debugLogger.log(
        '[TeamRegistry] Skipping project teams due to untrusted folder.',
      );
      coreEvents.emitFeedback(
        'info',
        'Skipping project teams due to untrusted folder. To enable, ensure that the project root is trusted.',
      );
    } else {
      // Load project-level teams (takes precedence over user-level if names collide)
      const projectTeamsDir = this.config.storage.getProjectTeamsDir();
      const projectLoadResult = await loadTeamsFromDirectory(projectTeamsDir);
      await this.processLoadResult(projectLoadResult);
    }

    if (this.config.getDebugMode()) {
      debugLogger.log(`[TeamRegistry] Loaded with ${this.teams.size} teams.`);
    }
  }

  private async processLoadResult(result: TeamLoadResult): Promise<void> {
    for (const error of result.errors) {
      debugLogger.warn(`[TeamRegistry] Error loading team: ${error.message}`);
      coreEvents.emitFeedback('error', `Team loading error: ${error.message}`);
    }

    for (const team of result.teams) {
      this.teams.set(team.name, team);

      // Record team agents for discovery (e.g. in the Team Creator)
      for (const agent of team.agents) {
        this.agentRegistry.registerDiscoveredAgent(agent);
      }
    }
  }

  /**
   * Returns all loaded teams.
   */
  getAllTeams(): TeamDefinition[] {
    return Array.from(this.teams.values());
  }

  /**
   * Sets the current active team.
   * @param name The slug (name) of the team to activate, or undefined to clear.
   * @throws Error if the team is not found and name is provided.
   */
  async setActiveTeam(name: string | undefined): Promise<void> {
    const previousTeam = this.getActiveTeam();

    if (name === undefined) {
      this.activeTeamName = undefined;
      if (previousTeam) {
        this.unregisterTeamAgents(previousTeam);
      }
      return;
    }

    if (this.teams.has(name)) {
      if (previousTeam) {
        this.unregisterTeamAgents(previousTeam);
      }
      this.activeTeamName = name;
      const newTeam = this.getActiveTeam();
      if (newTeam) {
        await this.registerTeamAgents(newTeam);
      }
    } else {
      throw new Error(`Team not found: ${name}`);
    }
  }

  private async registerTeamAgents(team: TeamDefinition): Promise<void> {
    const registrationPromises: Array<Promise<void>> = [];

    for (const agent of team.agents) {
      const descriptionOverride = `MANDATORY for ${agent.displayName} tasks: ${agent.description} (Team Agent: ${team.displayName}). You MUST delegate all ${agent.displayName} tasks to this agent.`;

      // We wrap the agent definition to provide the description override
      const wrappedAgent: AgentDefinition = {
        ...agent,
        description: descriptionOverride,
        metadata: {
          ...agent.metadata,
          isTeamAgent: true,
        },
      };

      registrationPromises.push(
        this.agentRegistry.registerAgent(wrappedAgent).catch((e) => {
          debugLogger.warn(
            `[TeamRegistry] Error registering agent "${agent.name}" from team "${team.name}":`,
            e,
          );
          coreEvents.emitFeedback(
            'error',
            `Error registering agent "${agent.name}" from team "${team.name}": ${e instanceof Error ? e.message : String(e)}`,
          );
        }),
      );
    }

    await Promise.allSettled(registrationPromises);
  }

  private unregisterTeamAgents(team: TeamDefinition): void {
    for (const agent of team.agents) {
      this.agentRegistry.unregisterAgent(agent.name);
    }
  }

  /**
   * Returns the currently active team definition, if any.
   */
  getActiveTeam(): TeamDefinition | undefined {
    return this.activeTeamName
      ? this.teams.get(this.activeTeamName)
      : undefined;
  }

  /**
   * Returns a team definition by name.
   */
  getTeam(name: string): TeamDefinition | undefined {
    return this.teams.get(name);
  }
}
