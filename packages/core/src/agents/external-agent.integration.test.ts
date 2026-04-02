/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import type { Config } from '../config/config.js';
import { TeamRegistry } from './teamRegistry.js';
import { AgentRegistry } from './registry.js';
import { ExternalAgentInvocation } from './external-invocation.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import { makeFakeConfig } from '../test-utils/config.js';

describe('External Agent E2E-ish Verification', () => {
  let tempGeminiDir: string;
  let config: Config;
  let agentRegistry: AgentRegistry;
  let teamRegistry: TeamRegistry;

  beforeEach(async () => {
    tempGeminiDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-test-'));
    const projectGeminiDir = path.join(tempGeminiDir, '.gemini');
    const teamsDir = path.join(projectGeminiDir, 'teams', 'test-team');
    const agentsDir = path.join(teamsDir, 'agents');
    await fs.mkdir(agentsDir, { recursive: true });

    // Create a real external agent file
    const claudeMd = `---
kind: external
name: claude-verifier
provider: claude-code
description: I am a Claude polyfill.
---
# Extra Instructions
Be very concise.
`;
    await fs.writeFile(path.join(agentsDir, 'claude.md'), claudeMd);

    // Create a TEAM.md
    const teamMd = `---
name: test-team
display_name: Test Team
description: A test team for external agents.
---
Orchestration instructions.
`;
    await fs.writeFile(path.join(teamsDir, 'TEAM.md'), teamMd);

    // Initialize Config using makeFakeConfig
    config = makeFakeConfig({
      targetDir: tempGeminiDir,
      cwd: tempGeminiDir,
      folderTrust: false,
      enableAgents: true,
    });

    agentRegistry = new AgentRegistry(config);
    teamRegistry = new TeamRegistry(config, agentRegistry);
    await agentRegistry.initialize();
    await teamRegistry.initialize();
  });

  afterEach(async () => {
    await fs.rm(tempGeminiDir, { recursive: true, force: true });
  });

  it('should load external agent and apply polyfill on invocation', async () => {
    const teams = teamRegistry.getAllTeams();
    const agents = agentRegistry.getAllDefinitions();
    const agentNames = agents.map((a) => a.name);

    expect(teams.length).toBeGreaterThan(0);
    expect(agentNames).toContain('claude-verifier');

    const claudeAgent = agents.find((a) => a.name === 'claude-verifier');

    expect(claudeAgent).toBeDefined();
    expect(claudeAgent?.kind).toBe('external');
    if (claudeAgent?.kind !== 'external') return;

    expect(claudeAgent.provider).toBe('claude-code');

    // Verify Invocation applies polyfill
    const messageBus = createMockMessageBus();
    const invocation = new ExternalAgentInvocation(
      claudeAgent,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config as any,
      {},
      messageBus,
    );

    // Check protected polyfilled definition via casting
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const polyfilled = (invocation as any).definition;
    expect(polyfilled.kind).toBe('local');
    expect(polyfilled.promptConfig.systemPrompt).toContain(
      'Claude Code Personality Overlay',
    );
    expect(polyfilled.promptConfig.systemPrompt).toContain('Be very concise.');
  });
});
