/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type TeamDefinition } from './types.js';
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

    const registrationPromises: Array<Promise<void>> = [];

    for (const team of result.teams) {
      this.teams.set(team.name, team);

      // Register team agents in the global AgentRegistry so they are available as SubagentTools
      for (const agent of team.agents) {
        const descriptionOverride = `MANDATORY for ${agent.displayName} tasks: ${agent.description} (Team Agent: ${team.displayName}). You MUST delegate all ${agent.displayName} tasks to this agent.`;

        // We wrap the agent definition to provide the description override
        const wrappedAgent = {
          ...agent,
          description: descriptionOverride,
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
    }

    await Promise.allSettled(registrationPromises);
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
  setActiveTeam(name: string | undefined): void {
    if (name === undefined) {
      this.activeTeamName = undefined;
      return;
    }

    if (this.teams.has(name)) {
      this.activeTeamName = name;
    } else {
      throw new Error(`Team not found: ${name}`);
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
