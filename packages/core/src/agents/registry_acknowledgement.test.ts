/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentRegistry } from './registry.js';
import { makeFakeConfig } from '../test-utils/config.js';
import type { AgentDefinition } from './types.js';
import { coreEvents } from '../utils/events.js';
import * as tomlLoader from './agentLoader.js';
import { type Config } from '../config/config.js';
import { AcknowledgedAgentsService } from './acknowledgedAgents.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

// Mock dependencies
vi.mock('./agentLoader.js', () => ({
  loadAgentsFromDirectory: vi.fn(),
}));

const MOCK_AGENT_WITH_HASH: AgentDefinition = {
  kind: 'local',
  name: 'ProjectAgent',
  description: 'Project Agent Desc',
  inputConfig: { inputSchema: { type: 'object' } },
  modelConfig: {
    model: 'test',
    generateContentConfig: { thinkingConfig: { includeThoughts: true } },
  },
  runConfig: { maxTimeMinutes: 1 },
  promptConfig: { systemPrompt: 'test' },
  metadata: {
    hash: 'hash123',
    filePath: '/project/agent.md',
  },
};

describe('AgentRegistry Acknowledgement', () => {
  let registry: AgentRegistry;
  let config: Config;
  let tempDir: string;
  let originalGeminiCliHome: string | undefined;
  let ackService: AcknowledgedAgentsService;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-cli-test-'));

    // Override GEMINI_CLI_HOME to point to the temp directory
    originalGeminiCliHome = process.env['GEMINI_CLI_HOME'];
    process.env['GEMINI_CLI_HOME'] = tempDir;

    ackService = new AcknowledgedAgentsService();

    config = makeFakeConfig({
      folderTrust: true,
      trustedFolder: true,
    });
    // Ensure we are in trusted folder mode for project agents to load
    vi.spyOn(config, 'isTrustedFolder').mockReturnValue(true);
    vi.spyOn(config, 'getFolderTrust').mockReturnValue(true);
    vi.spyOn(config, 'getProjectRoot').mockReturnValue('/project');
    vi.spyOn(config, 'getAcknowledgedAgentsService').mockReturnValue(
      ackService,
    );

    // We cannot easily spy on storage.getProjectAgentsDir if it's a property/getter unless we cast to any or it's a method
    // Assuming it's a method on Storage class
    vi.spyOn(config.storage, 'getProjectAgentsDir').mockReturnValue(
      '/project/.gemini/agents',
    );
    vi.spyOn(config, 'isAgentsEnabled').mockReturnValue(true);

    registry = new AgentRegistry(config);

    vi.mocked(tomlLoader.loadAgentsFromDirectory).mockImplementation(
      async (dir) => {
        if (dir === '/project/.gemini/agents') {
          return {
            agents: [MOCK_AGENT_WITH_HASH],
            errors: [],
          };
        }
        return { agents: [], errors: [] };
      },
    );
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    // Restore environment variable
    if (originalGeminiCliHome) {
      process.env['GEMINI_CLI_HOME'] = originalGeminiCliHome;
    } else {
      delete process.env['GEMINI_CLI_HOME'];
    }

    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should not register unacknowledged project agents and emit event', async () => {
    const emitSpy = vi.spyOn(coreEvents, 'emitAgentsDiscovered');

    await registry.initialize();

    expect(registry.getDefinition('ProjectAgent')).toBeUndefined();
    expect(emitSpy).toHaveBeenCalledWith([MOCK_AGENT_WITH_HASH]);
  });

  it('should register acknowledged project agents', async () => {
    // Acknowledge the agent explicitly
    await ackService.acknowledge('/project', 'ProjectAgent', 'hash123');

    vi.mocked(tomlLoader.loadAgentsFromDirectory).mockImplementation(
      async (dir) => {
        if (dir === '/project/.gemini/agents') {
          return {
            agents: [MOCK_AGENT_WITH_HASH],
            errors: [],
          };
        }
        return { agents: [], errors: [] };
      },
    );

    const emitSpy = vi.spyOn(coreEvents, 'emitAgentsDiscovered');

    await registry.initialize();

    expect(registry.getDefinition('ProjectAgent')).toBeDefined();
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('should register agents without hash (legacy/safe?)', async () => {
    // Current logic: if no hash, allow it.
    const agentNoHash = { ...MOCK_AGENT_WITH_HASH, metadata: undefined };
    vi.mocked(tomlLoader.loadAgentsFromDirectory).mockImplementation(
      async (dir) => {
        if (dir === '/project/.gemini/agents') {
          return {
            agents: [agentNoHash],
            errors: [],
          };
        }
        return { agents: [], errors: [] };
      },
    );

    await registry.initialize();

    expect(registry.getDefinition('ProjectAgent')).toBeDefined();
  });

  it('acknowledgeAgent should acknowledge and register agent', async () => {
    await registry.acknowledgeAgent(MOCK_AGENT_WITH_HASH);

    // Verify against real service state
    expect(
      await ackService.isAcknowledged('/project', 'ProjectAgent', 'hash123'),
    ).toBe(true);

    expect(registry.getDefinition('ProjectAgent')).toBeDefined();
  });
});
