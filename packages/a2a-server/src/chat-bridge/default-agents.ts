/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { homedir } from '@google/gemini-cli-core';
import { logger } from '../utils/logger.js';

/**
 * Seeds a remote agent definition for the GKE worker at the user level
 * (~/.gemini/agents/) so it bypasses the project-level acknowledgment check.
 */
export async function ensureDefaultAgents(gkeAgentUrl?: string): Promise<void> {
  if (!gkeAgentUrl) return;

  // Seed remote agent definition at user level (~/.gemini/agents/)
  // User-level agents are registered directly without acknowledgment,
  // which is required for headless server mode.
  const agentsDir = path.join(homedir(), '.gemini', 'agents');
  await fs.mkdir(agentsDir, { recursive: true });

  const agentMd = `---
kind: remote
name: gke-worker
agent_card_url: ${gkeAgentUrl.replace(/\/$/, '')}/.well-known/agent-card.json
---
Long-running worker agent on GKE. Delegate tasks that will take more than 30 minutes,
such as running evals, large builds, or extensive test suites. This agent runs on a
persistent server with no timeout limit. Tell it to run commands in the background
(nohup/&) so it can respond immediately and you can check back for status.
`;
  await fs.writeFile(path.join(agentsDir, 'gke-worker.md'), agentMd);
  logger.info(
    `[DefaultAgents] Seeded gke-worker agent definition at ${agentsDir}/gke-worker.md`,
  );
}
