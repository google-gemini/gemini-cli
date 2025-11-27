/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { loadAgentFromToml } from './toml-loader.js';
import { Storage } from '../config/storage.js';
import { debugLogger } from '../utils/debugLogger.js';
import type { Config } from '../config/config.js';

export class AgentLoader {
  constructor(private readonly config: Config) {}

  /**
   * Loads agents from the global user directory and the current project directory.
   */
  async loadUserAgents(storage: Storage): Promise<void> {
    // 1. Global User Agents: ~/.gemini/agents
    const globalAgentsDir = path.join(Storage.getGlobalGeminiDir(), 'agents');
    await this.scanAndLoadAgents(globalAgentsDir);

    // 2. Project Agents: <ROOT>/.gemini/agents
    const projectAgentsDir = path.join(storage.getGeminiDir(), 'agents');
    await this.scanAndLoadAgents(projectAgentsDir);
  }

  /**
   * Loads agents from a specific extension directory.
   * Assumes agents are located in `extensionPath/agents`.
   */
  async loadExtensionAgents(extensionPath: string): Promise<void> {
    const agentsDir = path.join(extensionPath, 'agents');
    await this.scanAndLoadAgents(agentsDir);
  }

  /**
   * Unloads agents from a specific extension directory.
   */
  async unloadExtensionAgents(extensionPath: string): Promise<void> {
    const agentsDir = path.join(extensionPath, 'agents');
    try {
      const stats = await fs.stat(agentsDir);
      if (!stats.isDirectory()) return;

      const files = await fs.readdir(agentsDir);
      const tomlFiles = files.filter((f) => f.endsWith('.toml'));

      for (const file of tomlFiles) {
        const filePath = path.join(agentsDir, file);
        try {
          // We need to parse the TOML to get the agent name to unregister it.
          const agentDef = await loadAgentFromToml(filePath);
          this.config.unregisterAgent(agentDef.name);
          debugLogger.log(
            `[AgentLoader] Unloaded agent '${agentDef.name}' from ${filePath}`,
          );
        } catch (error) {
          debugLogger.error(
            `[AgentLoader] Failed to unload agent from ${filePath}`,
            error,
          );
        }
      }
    } catch (error) {
      if ((error as { code: string }).code !== 'ENOENT') {
        debugLogger.error(
          `[AgentLoader] Error scanning directory ${agentsDir} for unload`,
          error,
        );
      }
    }
  }

  private async scanAndLoadAgents(directory: string): Promise<void> {
    try {
      const stats = await fs.stat(directory);
      if (!stats.isDirectory()) return;

      const files = await fs.readdir(directory);
      const tomlFiles = files.filter((f) => f.endsWith('.toml'));

      for (const file of tomlFiles) {
        const filePath = path.join(directory, file);
        try {
          const agentDef = await loadAgentFromToml(filePath);
          this.config.registerAgent(agentDef);
          debugLogger.log(
            `[AgentLoader] Loaded agent '${agentDef.name}' from ${filePath}`,
          );
        } catch (error) {
          debugLogger.error(
            `[AgentLoader] Failed to load agent from ${filePath}`,
            error,
          );
        }
      }
    } catch (error) {
      // Directory doesn't exist or other access error, just ignore
      if ((error as { code: string }).code !== 'ENOENT') {
        debugLogger.error(
          `[AgentLoader] Error scanning directory ${directory}`,
          error,
        );
      }
    }
  }
}
