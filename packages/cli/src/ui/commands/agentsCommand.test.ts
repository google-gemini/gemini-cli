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

describe('agentsCommand', () => {
  let mockContext: ReturnType<typeof createMockCommandContext>;
  let mockConfig: {
    getAgentRegistry: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfig = {
      getAgentRegistry: vi.fn().mockReturnValue({
        getAllDefinitions: vi.fn().mockReturnValue([]),
      }),
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
      expect.any(Number),
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
});
