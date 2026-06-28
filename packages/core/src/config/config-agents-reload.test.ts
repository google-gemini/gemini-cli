/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Config, type ConfigParameters } from './config.js';
import { createTmpDir, cleanupTmpDir } from '@google/gemini-cli-test-utils';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

// Mock minimum dependencies that have side effects or external calls
vi.mock('../core/client.js', () => ({
  GeminiClient: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    isInitialized: vi.fn().mockReturnValue(true),
    setTools: vi.fn().mockResolvedValue(undefined),
    updateSystemInstruction: vi.fn(),
  })),
}));

vi.mock('../core/contentGenerator.js');
vi.mock('../telemetry/index.js');
vi.mock('../core/tokenLimits.js');
vi.mock('../services/fileDiscoveryService.js');
vi.mock('../services/gitService.js');
vi.mock('../services/trackerService.js');

describe('Config Agents Reload Integration', () => {
  let tmpDir: string;

  beforeEach(async () => {
    // Create a temporary directory for the test
    tmpDir = await createTmpDir({});

    // Create the .gemini/agents directory structure
    await fs.mkdir(path.join(tmpDir, '.gemini', 'agents'), { recursive: true });
  });

  afterEach(async () => {
    await cleanupTmpDir(tmpDir);
    vi.clearAllMocks();
  });

  it('should unregister agents from the agent registry when they are disabled after being enabled', async () => {
    const agentName = 'test-agent';
    const agentPath = path.join(tmpDir, '.gemini', 'agents', `${agentName}.md`);

    // Create agent definition file
    const agentContent = `---
name: ${agentName}
description: Test Agent Description
tools: []
---
Test System Prompt`;

    await fs.writeFile(agentPath, agentContent);

    // Initialize Config with agent enabled to start
    const baseParams: ConfigParameters = {
      sessionId: 'test-session',
      targetDir: tmpDir,
      model: 'test-model',
      cwd: tmpDir,
      debugMode: false,
      enableAgents: true,
      agents: {
        overrides: {
          [agentName]: { enabled: true },
        },
      },
    };

    const config = new Config(baseParams);
    vi.spyOn(config, 'isTrustedFolder').mockReturnValue(true);
    vi.spyOn(
      config.getAcknowledgedAgentsService(),
      'isAcknowledged',
    ).mockResolvedValue(true);
    await config.initialize();

    const agentRegistry = config.getAgentRegistry();

    // Verify the agent was registered initially
    const initialAgents = agentRegistry.getAllDefinitions().map((d) => d.name);
    expect(initialAgents).toContain(agentName);
    expect(agentRegistry.getDefinition(agentName)).toBeDefined();

    // Disable agent in settings for reload simulation
    vi.spyOn(config, 'getAgentsSettings').mockReturnValue({
      overrides: {
        [agentName]: { enabled: false },
      },
    });

    // Trigger the refresh action that follows reloading

    await config.getAgentRegistry().reload();

    // 4. Verify the agent is UNREGISTERED
    const finalAgents = agentRegistry.getAllDefinitions().map((d) => d.name);
    expect(finalAgents).not.toContain(agentName);
    expect(agentRegistry.getDefinition(agentName)).toBeUndefined();
  });

  it('should not register agents in the agent registry when agents are disabled from the start', async () => {
    const agentName = 'test-agent-disabled';
    const agentPath = path.join(tmpDir, '.gemini', 'agents', `${agentName}.md`);

    const agentContent = `---
name: ${agentName}
description: Test Agent Description
tools: []
---
Test System Prompt`;

    await fs.writeFile(agentPath, agentContent);

    const params: ConfigParameters = {
      sessionId: 'test-session',
      targetDir: tmpDir,
      model: 'test-model',
      cwd: tmpDir,
      debugMode: false,
      enableAgents: true,
      agents: {
        overrides: {
          [agentName]: { enabled: false },
        },
      },
    };

    const config = new Config(params);
    vi.spyOn(config, 'isTrustedFolder').mockReturnValue(true);
    vi.spyOn(
      config.getAcknowledgedAgentsService(),
      'isAcknowledged',
    ).mockResolvedValue(true);
    await config.initialize();

    const agentRegistry = config.getAgentRegistry();

    const agents = agentRegistry.getAllDefinitions().map((d) => d.name);
    expect(agents).not.toContain(agentName);
    expect(agentRegistry.getDefinition(agentName)).toBeUndefined();
  });

  it('should register agents in the agent registry even when they are not in allowedTools', async () => {
    const agentName = 'test-agent-allowed';
    const agentPath = path.join(tmpDir, '.gemini', 'agents', `${agentName}.md`);

    const agentContent = `---
name: ${agentName}
description: Test Agent Description
tools: []
---
Test System Prompt`;

    await fs.writeFile(agentPath, agentContent);

    const params: ConfigParameters = {
      sessionId: 'test-session',
      targetDir: tmpDir,
      model: 'test-model',
      cwd: tmpDir,
      debugMode: false,
      enableAgents: true,
      allowedTools: ['ls'], // test-agent-allowed is NOT here
      agents: {
        overrides: {
          [agentName]: { enabled: true },
        },
      },
    };

    const config = new Config(params);
    vi.spyOn(config, 'isTrustedFolder').mockReturnValue(true);
    vi.spyOn(
      config.getAcknowledgedAgentsService(),
      'isAcknowledged',
    ).mockResolvedValue(true);
    await config.initialize();

    const agentRegistry = config.getAgentRegistry();

    const agents = agentRegistry.getAllDefinitions().map((d) => d.name);
    expect(agents).toContain(agentName);
  });

  it('should register agents in the agent registry when they are enabled after being disabled', async () => {
    const agentName = 'test-agent-enable';
    const agentPath = path.join(tmpDir, '.gemini', 'agents', `${agentName}.md`);

    const agentContent = `---
name: ${agentName}
description: Test Agent Description
tools: []
---
Test System Prompt`;

    await fs.writeFile(agentPath, agentContent);

    const params: ConfigParameters = {
      sessionId: 'test-session',
      targetDir: tmpDir,
      model: 'test-model',
      cwd: tmpDir,
      debugMode: false,
      enableAgents: true,
      agents: {
        overrides: {
          [agentName]: { enabled: false },
        },
      },
    };

    const config = new Config(params);
    vi.spyOn(config, 'isTrustedFolder').mockReturnValue(true);
    vi.spyOn(
      config.getAcknowledgedAgentsService(),
      'isAcknowledged',
    ).mockResolvedValue(true);
    await config.initialize();

    const agentRegistry = config.getAgentRegistry();

    expect(agentRegistry.getAllDefinitions().map((d) => d.name)).not.toContain(
      agentName,
    );

    // Enable agent in settings for reload simulation
    vi.spyOn(config, 'getAgentsSettings').mockReturnValue({
      overrides: {
        [agentName]: { enabled: true },
      },
    });

    // Trigger the refresh action that follows reloading

    await config.getAgentRegistry().reload();

    expect(agentRegistry.getAllDefinitions().map((d) => d.name)).toContain(
      agentName,
    );
  });
});
