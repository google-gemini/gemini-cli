/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { agentsCommand } from './agentsCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import type { Config } from '@google/gemini-cli-core';
import { MessageType } from '../types.js';
import type { SlashCommand, SlashCommandActionReturn } from './types.js';

describe('agentsCommand', () => {
  let mockContext: ReturnType<typeof createMockCommandContext>;
  let mockConfig: {
    getAgentRegistry: ReturnType<typeof vi.fn>;
    isAgentsEnabled: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfig = {
      getAgentRegistry: vi.fn().mockReturnValue({
        getAllDefinitions: vi.fn().mockReturnValue([]),
        reload: vi.fn(),
        getDefinition: vi.fn(),
      }),
      isAgentsEnabled: vi.fn().mockReturnValue(true),
    };

    mockContext = createMockCommandContext({
      services: {
        config: mockConfig as unknown as Config,
      },
    });
  });

  it('should show an error if config is not available', async () => {
    const contextWithoutConfig = createMockCommandContext({
      services: {
        config: null,
      },
    });

    const result = await agentsCommand.action!(contextWithoutConfig, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Config not loaded.',
    });
  });

  it('should show an error if agent registry is not available', async () => {
    mockConfig.getAgentRegistry = vi.fn().mockReturnValue(undefined);

    const result = await agentsCommand.action!(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Agent registry not found.',
    });
  });

  it('should call addItem with correct agents list', async () => {
    const mockAgents = [
      {
        name: 'agent1',
        displayName: 'Agent One',
        description: 'desc1',
        kind: 'local',
      },
      { name: 'agent2', description: 'desc2', kind: 'remote' },
    ];
    mockConfig.getAgentRegistry().getAllDefinitions.mockReturnValue(mockAgents);

    await agentsCommand.action!(mockContext, '');

    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.AGENTS_LIST,
        agents: mockAgents,
      }),
    );
  });

  it('should reload the agent registry when refresh subcommand is called', async () => {
    const reloadSpy = vi.fn().mockResolvedValue(undefined);
    mockConfig.getAgentRegistry = vi.fn().mockReturnValue({
      reload: reloadSpy,
    });

    const refreshCommand = agentsCommand.subCommands?.find(
      (cmd) => cmd.name === 'refresh',
    );
    expect(refreshCommand).toBeDefined();

    const result = await refreshCommand!.action!(mockContext, '');

    expect(reloadSpy).toHaveBeenCalled();
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'Agents refreshed successfully.',
    });
  });

  it('should show an error if agent registry is not available during refresh', async () => {
    mockConfig.getAgentRegistry = vi.fn().mockReturnValue(undefined);

    const refreshCommand = agentsCommand.subCommands?.find(
      (cmd) => cmd.name === 'refresh',
    );
    const result = await refreshCommand!.action!(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Agent registry not found.',
    });
  });

  describe('debug subcommand', () => {
    let debugCommand: SlashCommand;

    beforeEach(() => {
      const found = agentsCommand.subCommands?.find(
        (cmd) => cmd.name === 'debug',
      );
      if (!found) {
        throw new Error('Debug command not found');
      }
      debugCommand = found;
    });

    it('should show an error if agents are disabled', async () => {
      mockConfig.isAgentsEnabled.mockReturnValue(false);

      const result = await debugCommand.action!(mockContext, 'agent1 problem');

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Agents are disabled.',
      });
    });

    it('should show error if no arguments provided', async () => {
      const result = await debugCommand.action!(mockContext, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Usage: /agent debug <agent-name> <problem-description>',
      });
    });

    it('should show error if no problem description provided', async () => {
      const result = await debugCommand.action!(mockContext, 'agent1');

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content:
          'Please provide a description of the problem or the failed prompt. Usage: /agent debug <agent-name> <problem-description>',
      });
    });

    it('should show error if agent not found', async () => {
      mockConfig.getAgentRegistry().getDefinition.mockReturnValue(undefined);

      const result = await debugCommand.action!(
        mockContext,
        'unknownAgent some problem',
      );

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: "Agent 'unknownAgent' not found.",
      });
    });

    it('should return submit_prompt action with debug prompt for local agent', async () => {
      const mockAgent = {
        name: 'test-agent',
        description: 'A test agent',
        kind: 'local',
        promptConfig: {
          systemPrompt: 'You are a helper.',
          query: 'Task: ${input}',
        },
      };
      mockConfig.getAgentRegistry().getDefinition.mockReturnValue(mockAgent);

      const result = (await debugCommand.action!(
        mockContext,
        'test-agent prompt failure',
      )) as SlashCommandActionReturn;

      expect(result.type).toBe('submit_prompt');
      if (result.type === 'submit_prompt') {
        expect(result.content).toContain('I am debugging a custom agent named');
        expect(result.content).toContain('test-agent');
        expect(result.content).toContain('prompt failure');
        expect(result.content).toContain('You are a helper.');
      }
    });
  });
});
