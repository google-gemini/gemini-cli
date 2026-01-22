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

// Mock dependencies
vi.mock('./agentLoader.js', () => ({
  loadAgentsFromDirectory: vi.fn(),
}));

// Mock AcknowledgedAgentsService
const mockAckService = {
  load: vi.fn(),
  save: vi.fn(),
  isAcknowledged: vi.fn(),
  acknowledge: vi.fn(),
};

vi.mock('./acknowledgedAgents.js', () => ({
  AcknowledgedAgentsService: {
    getInstance: vi.fn(() => mockAckService),
  },
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

describe.skip('AgentRegistry Acknowledgement', () => {
  let registry: AgentRegistry;
  let config: Config;

  beforeEach(() => {
    config = makeFakeConfig({
      folderTrust: true,
      trustedFolder: true,
    });
    // Ensure we are in trusted folder mode for project agents to load
    vi.spyOn(config, 'isTrustedFolder').mockReturnValue(true);
    vi.spyOn(config, 'getFolderTrust').mockReturnValue(true);
    vi.spyOn(config, 'getProjectRoot').mockReturnValue('/project');

    // We cannot easily spy on storage.getProjectAgentsDir if it's a property/getter unless we cast to any or it's a method
    // Assuming it's a method on Storage class
    vi.spyOn(config.storage, 'getProjectAgentsDir').mockReturnValue(
      '/project/.gemini/agents',
    );

    registry = new AgentRegistry(config);

    // Reset mocks
    vi.mocked(tomlLoader.loadAgentsFromDirectory).mockResolvedValue({
      agents: [],
      errors: [],
    });
    mockAckService.isAcknowledged.mockReturnValue(false);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should not register unacknowledged project agents and emit event', async () => {
    vi.mocked(tomlLoader.loadAgentsFromDirectory).mockResolvedValue({
      agents: [MOCK_AGENT_WITH_HASH],
      errors: [],
    });
    mockAckService.isAcknowledged.mockReturnValue(false);

    const emitSpy = vi.spyOn(coreEvents, 'emitAgentsDiscovered');

    await registry.initialize();

    expect(registry.getDefinition('ProjectAgent')).toBeUndefined();
    expect(emitSpy).toHaveBeenCalledWith([MOCK_AGENT_WITH_HASH]);
  });

  it('should register acknowledged project agents', async () => {
    vi.mocked(tomlLoader.loadAgentsFromDirectory).mockResolvedValue({
      agents: [MOCK_AGENT_WITH_HASH],
      errors: [],
    });
    mockAckService.isAcknowledged.mockReturnValue(true);

    const emitSpy = vi.spyOn(coreEvents, 'emitAgentsDiscovered');

    await registry.initialize();

    expect(registry.getDefinition('ProjectAgent')).toBeDefined();
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('should register agents without hash (legacy/safe?)', async () => {
    // Current logic: if no hash, allow it.
    const agentNoHash = { ...MOCK_AGENT_WITH_HASH, metadata: undefined };
    vi.mocked(tomlLoader.loadAgentsFromDirectory).mockResolvedValue({
      agents: [agentNoHash],
      errors: [],
    });

    await registry.initialize();

    expect(registry.getDefinition('ProjectAgent')).toBeDefined();
  });

  it('acknowledgeAgent should acknowledge and register agent', async () => {
    await registry.acknowledgeAgent(MOCK_AGENT_WITH_HASH);

    expect(mockAckService.acknowledge).toHaveBeenCalledWith(
      '/project',
      'ProjectAgent',
      'hash123',
    );
    expect(registry.getDefinition('ProjectAgent')).toBeDefined();
  });
});
