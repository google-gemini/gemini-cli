/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type TeamDefinition } from './types.js';
import { type Config } from '../config/config.js';
import { type AgentRegistry } from './registry.js';
import { loadTeamsFromDirectory } from './teamLoader.js';
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
   * Discovers and loads teams from the project's .gemini/teams/ directory.
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
      return;
    }

    const projectTeamsDir = this.config.storage.getProjectTeamsDir();
    const loadResult = await loadTeamsFromDirectory(projectTeamsDir);

    for (const error of loadResult.errors) {
      debugLogger.warn(`[TeamRegistry] Error loading team: ${error.message}`);
      coreEvents.emitFeedback('error', `Team loading error: ${error.message}`);
    }

    for (const team of loadResult.teams) {
      this.teams.set(team.name, team);

      // Register team agents in the global AgentRegistry so they are available as SubagentTools
      for (const agent of team.agents) {
        try {
          await this.agentRegistry.registerAgent(agent);
        } catch (e) {
          debugLogger.warn(
            `[TeamRegistry] Error registering agent "${agent.name}" from team "${team.name}":`,
            e,
          );
          coreEvents.emitFeedback(
            'error',
            `Error registering agent "${agent.name}" from team "${team.name}": ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    }

    if (this.config.getDebugMode()) {
      debugLogger.log(`[TeamRegistry] Loaded with ${this.teams.size} teams.`);
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
   * @param name The slug (name) of the team to activate.
   * @throws Error if the team is not found.
   */
  setActiveTeam(name: string): void {
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
