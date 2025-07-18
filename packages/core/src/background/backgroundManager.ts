/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { MCPServerConfig } from '../config/config.js';
import { BackgroundAgent, loadBackgroundAgent } from './backgroundAgent.js';

export async function loadBackgroundAgentManager(
  backgroundAgentConfigs: Record<string, MCPServerConfig> | undefined,
  debugMode: boolean,
): Promise<BackgroundAgentManager> {
  const agents = await Promise.all(
    Object.entries(backgroundAgentConfigs ?? {}).map(([name, config]) =>
      loadBackgroundAgent(name, config, debugMode).catch((error) => {
        console.error(`Error loading background agent '${name}': ${error}`);
        return null;
      }),
    ),
  ).then((agents) => agents.filter((agent) => agent !== null));
  return new BackgroundAgentManager(agents);
}

export class BackgroundAgentManager {
  // The active agent. May be empty if none are confgured.
  activeAgent?: BackgroundAgent;

  constructor(readonly backgroundAgents: BackgroundAgent[]) {
    if (backgroundAgents.length !== 0) {
      this.activeAgent = backgroundAgents[0];
    }
  }

  setActiveAgentByName(name: string) {
    this.activeAgent = this.backgroundAgents.find(
      (agent) => agent.serverName === name,
    );
  }
}
