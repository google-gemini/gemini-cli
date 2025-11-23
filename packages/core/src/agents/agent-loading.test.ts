/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { AgentLoader } from './agent-loader.js';
import type { Config } from '../config/config.js';
import type { AgentRegistry } from './registry.js';

// Mock Config to avoid full initialization complexity
const mockConfig = {
  getAgentRegistry: () => mockAgentRegistry,
  registerAgent: vi.fn(),
  unregisterAgent: vi.fn(),
  getDebugMode: () => false,
} as unknown as Config;

const mockAgentRegistry = {
  registerAgent: vi.fn(),
  unregisterAgent: vi.fn(),
} as unknown as AgentRegistry;

describe('AgentLoader', () => {
  let tempDir: string;
  let agentsDir: string;
  let loader: AgentLoader;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-loader-test-'));
    agentsDir = path.join(tempDir, 'agents');
    await fs.mkdir(agentsDir);
    loader = new AgentLoader(mockConfig);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('should load an agent from a TOML file in an extension directory', async () => {
    const tomlContent = `
name = "test-agent"
description = "A test agent"
[promptConfig]
systemPrompt = "You are a test."
[modelConfig]
model = "gemini-pro"
temp = 0
top_p = 1
[runConfig]
max_time_minutes = 1
[inputConfig.inputs.arg1]
description = "Test arg"
type = "string"
required = true
`;
    await fs.writeFile(path.join(agentsDir, 'test-agent.toml'), tomlContent);

    await loader.loadExtensionAgents(tempDir);

    expect(mockConfig.registerAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'test-agent',
        description: 'A test agent',
        modelConfig: expect.objectContaining({
          model: 'gemini-pro',
        }),
      }),
    );
  });

  it('should unload an agent from an extension directory', async () => {
    const tomlContent = `
name = "test-agent-unload"
description = "A test agent"
[promptConfig]
systemPrompt = "You are a test."
[modelConfig]
model = "gemini-pro"
temp = 0
top_p = 1
[runConfig]
max_time_minutes = 1
[inputConfig.inputs.arg1]
description = "Test arg"
type = "string"
required = true
`;
    await fs.writeFile(path.join(agentsDir, 'test-agent.toml'), tomlContent);

    await loader.unloadExtensionAgents(tempDir);

    expect(mockConfig.unregisterAgent).toHaveBeenCalledWith(
      'test-agent-unload',
    );
  });

  it('should ignore non-toml files', async () => {
    await fs.writeFile(path.join(agentsDir, 'ignore.txt'), 'content');
    await loader.loadExtensionAgents(tempDir);
    expect(mockConfig.registerAgent).not.toHaveBeenCalled();
  });

  it('should handle missing agents directory gracefully', async () => {
    const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'empty-test-'));
    await loader.loadExtensionAgents(emptyDir);
    expect(mockConfig.registerAgent).not.toHaveBeenCalled();
    await fs.rm(emptyDir, { recursive: true, force: true });
  });
});
