/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { agentsCommand } from './agentsCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import type { Config } from '@google/gemini-cli-core';
import type { LoadedSettings } from '../../config/settings.js';
import { MessageType } from '../types.js';
import { enableAgent, disableAgent } from '../../utils/agentSettings.js';
import { renderAgentActionFeedback } from '../../utils/agentUtils.js';

vi.mock('../../utils/agentSettings.js', () => ({
  enableAgent: vi.fn(),
  disableAgent: vi.fn(),
}));

vi.mock('../../utils/agentUtils.js', () => ({
  renderAgentActionFeedback: vi.fn(),
}));

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
        getAllAgentNames: vi.fn().mockReturnValue([]),
        reload: vi.fn(),
      }),
    };

    mockContext = createMockCommandContext({
      services: {
        config: mockConfig as unknown as Config,
        settings: {
          workspace: { path: '/mock/path' },
          merged: { agents: { overrides: {} } },
        } as unknown as LoadedSettings,
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
      {
        name: 'agent2',
        displayName: undefined,
        description: 'desc2',
        kind: 'remote',
      },
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

  it('should enable an agent successfully', async () => {
    const reloadSpy = vi.fn().mockResolvedValue(undefined);
    mockConfig.getAgentRegistry = vi.fn().mockReturnValue({
      getAllAgentNames: vi.fn().mockReturnValue([]),
      reload: reloadSpy,
    });
    // Add agent to disabled overrides so validation passes
    mockContext.services.settings.merged.agents.overrides['test-agent'] = {
      disabled: true,
    };

    vi.mocked(enableAgent).mockReturnValue({
      status: 'success',
      agentName: 'test-agent',
      action: 'enable',
      modifiedScopes: [],
      alreadyInStateScopes: [],
    });
    vi.mocked(renderAgentActionFeedback).mockReturnValue('Enabled test-agent.');

    const enableCommand = agentsCommand.subCommands?.find(
      (cmd) => cmd.name === 'enable',
    );
    expect(enableCommand).toBeDefined();

    const result = await enableCommand!.action!(mockContext, 'test-agent');

    expect(enableAgent).toHaveBeenCalledWith(
      mockContext.services.settings,
      'test-agent',
    );
    expect(reloadSpy).toHaveBeenCalled();
    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.INFO,
        text: 'Enabling test-agent...',
      }),
    );
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'Enabled test-agent.',
    });
  });

  it('should handle no-op when enabling an agent', async () => {
    mockConfig
      .getAgentRegistry()
      .getAllAgentNames.mockReturnValue(['test-agent']);

    const enableCommand = agentsCommand.subCommands?.find(
      (cmd) => cmd.name === 'enable',
    );
    const result = await enableCommand!.action!(mockContext, 'test-agent');

    expect(enableAgent).not.toHaveBeenCalled();
    expect(mockContext.ui.addItem).not.toHaveBeenCalled();
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: "Agent 'test-agent' is already enabled.",
    });
  });

  it('should show usage error if no agent name provided for enable', async () => {
    const enableCommand = agentsCommand.subCommands?.find(
      (cmd) => cmd.name === 'enable',
    );
    const result = await enableCommand!.action!(mockContext, '   ');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Usage: /agents enable <agent-name>',
    });
  });

  it('should disable an agent successfully', async () => {
    const reloadSpy = vi.fn().mockResolvedValue(undefined);
    mockConfig.getAgentRegistry = vi.fn().mockReturnValue({
      getAllAgentNames: vi.fn().mockReturnValue(['test-agent']),
      reload: reloadSpy,
    });
    vi.mocked(disableAgent).mockReturnValue({
      status: 'success',
      agentName: 'test-agent',
      action: 'disable',
      modifiedScopes: [],
      alreadyInStateScopes: [],
    });
    vi.mocked(renderAgentActionFeedback).mockReturnValue(
      'Disabled test-agent.',
    );

    const disableCommand = agentsCommand.subCommands?.find(
      (cmd) => cmd.name === 'disable',
    );
    expect(disableCommand).toBeDefined();

    const result = await disableCommand!.action!(mockContext, 'test-agent');

    expect(disableAgent).toHaveBeenCalledWith(
      mockContext.services.settings,
      'test-agent',
      expect.anything(), // Scope is derived in the command
    );
    expect(reloadSpy).toHaveBeenCalled();
    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.INFO,
        text: 'Disabling test-agent...',
      }),
    );
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'Disabled test-agent.',
    });
  });

  it('should show info message if agent is already disabled', async () => {
    mockConfig.getAgentRegistry().getAllAgentNames.mockReturnValue([]);
    mockContext.services.settings.merged.agents.overrides['test-agent'] = {
      disabled: true,
    };

    const disableCommand = agentsCommand.subCommands?.find(
      (cmd) => cmd.name === 'disable',
    );
    const result = await disableCommand!.action!(mockContext, 'test-agent');

    expect(disableAgent).not.toHaveBeenCalled();
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: "Agent 'test-agent' is already disabled.",
    });
  });

  it('should show error if agent is not found when disabling', async () => {
    mockConfig.getAgentRegistry().getAllAgentNames.mockReturnValue([]);

    const disableCommand = agentsCommand.subCommands?.find(
      (cmd) => cmd.name === 'disable',
    );
    const result = await disableCommand!.action!(mockContext, 'test-agent');

    expect(disableAgent).not.toHaveBeenCalled();
    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: "Agent 'test-agent' not found.",
    });
  });

  it('should show usage error if no agent name provided for disable', async () => {
    const disableCommand = agentsCommand.subCommands?.find(
      (cmd) => cmd.name === 'disable',
    );
    const result = await disableCommand!.action!(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Usage: /agents disable <agent-name>',
    });
  });
});
