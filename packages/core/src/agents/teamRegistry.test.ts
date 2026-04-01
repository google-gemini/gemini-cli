/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TeamRegistry } from './teamRegistry.js';
import { type Config } from '../config/config.js';
import { Storage } from '../config/storage.js';
import { type AgentRegistry } from './registry.js';
import { loadTeamsFromDirectory } from './teamLoader.js';
import { type TeamDefinition, type AgentDefinition } from './types.js';

vi.mock('./teamLoader.js', () => ({
  loadTeamsFromDirectory: vi.fn(),
}));

describe('TeamRegistry', () => {
  let mockConfig: Config;
  let mockAgentRegistry: AgentRegistry;
  let registry: TeamRegistry;

  beforeEach(() => {
    vi.spyOn(Storage, 'getUserTeamsDir').mockReturnValue(
      '/mock/user/.gemini/teams',
    );

    mockConfig = {
      isAgentsEnabled: vi.fn().mockReturnValue(true),
      getFolderTrust: vi.fn().mockReturnValue(false),
      isTrustedFolder: vi.fn().mockReturnValue(true),
      getProjectRoot: vi.fn().mockReturnValue('/mock/project'),
      getDebugMode: vi.fn().mockReturnValue(false),
      storage: {
        getProjectTeamsDir: vi
          .fn()
          .mockReturnValue('/mock/project/.gemini/teams'),
      },
    } as unknown as Config;

    mockAgentRegistry = {
      registerAgent: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgentRegistry;

    registry = new TeamRegistry(mockConfig, mockAgentRegistry);
    vi.mocked(loadTeamsFromDirectory).mockReset();
    // Default mock behavior to return empty result
    vi.mocked(loadTeamsFromDirectory).mockResolvedValue({
      teams: [],
      errors: [],
    });
  });

  it('should load teams and register agents on initialize', async () => {
    const mockAgent: AgentDefinition = {
      kind: 'local',
      name: 'team-agent',
      description: 'Agent in a team',
      inputConfig: { inputSchema: { type: 'object' } },
    } as unknown as AgentDefinition;

    const mockTeam: TeamDefinition = {
      name: 'test-team',
      displayName: 'Test Team',
      description: 'A team for testing',
      instructions: 'Do tests.',
      agents: [mockAgent],
    };

    // First call for user teams (empty), second for project teams
    vi.mocked(loadTeamsFromDirectory)
      .mockResolvedValueOnce({ teams: [], errors: [] })
      .mockResolvedValueOnce({
        teams: [mockTeam],
        errors: [],
      });

    await registry.initialize();

    expect(registry.getAllTeams()).toHaveLength(1);
    expect(registry.getTeam('test-team')).toEqual(mockTeam);
    expect(mockAgentRegistry.registerAgent).toHaveBeenCalledWith(mockAgent);
    expect(loadTeamsFromDirectory).toHaveBeenCalledTimes(2);
  });

  it('should not load teams if agents are disabled', async () => {
    vi.mocked(mockConfig.isAgentsEnabled).mockReturnValue(false);

    await registry.initialize();

    expect(loadTeamsFromDirectory).not.toHaveBeenCalled();
    expect(registry.getAllTeams()).toHaveLength(0);
  });

  it('should skip project teams in untrusted folder but still load user teams', async () => {
    vi.mocked(mockConfig.getFolderTrust).mockReturnValue(true);
    vi.mocked(mockConfig.isTrustedFolder).mockReturnValue(false);

    await registry.initialize();

    // Should only be called once for user teams
    expect(loadTeamsFromDirectory).toHaveBeenCalledTimes(1);
    expect(loadTeamsFromDirectory).toHaveBeenCalledWith(
      '/mock/user/.gemini/teams',
    );
  });

  it('should manage active team', async () => {
    const mockTeam: TeamDefinition = {
      name: 'active-team',
      displayName: 'Active Team',
      description: 'The active one',
      instructions: 'Lead.',
      agents: [],
    };

    vi.mocked(loadTeamsFromDirectory).mockResolvedValue({
      teams: [mockTeam],
      errors: [],
    });

    await registry.initialize();

    expect(registry.getActiveTeam()).toBeUndefined();

    registry.setActiveTeam('active-team');
    expect(registry.getActiveTeam()).toEqual(mockTeam);

    expect(() => registry.setActiveTeam('non-existent')).toThrow(
      'Team not found',
    );
  });

  it('should reload teams', async () => {
    await registry.initialize();
    expect(loadTeamsFromDirectory).toHaveBeenCalledTimes(2);

    await registry.reload();
    expect(loadTeamsFromDirectory).toHaveBeenCalledTimes(4);
  });
});
