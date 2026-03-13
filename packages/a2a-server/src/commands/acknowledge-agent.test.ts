/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AcknowledgeAgentCommand } from './acknowledge-agent.js';
import { type Config } from '@google/gemini-cli-core';
import { createMockConfig } from '../utils/testing_utils.js';
import type { CommandContext } from './types.js';

describe('AcknowledgeAgentCommand', () => {
  let command: AcknowledgeAgentCommand;
  let context: CommandContext;
  let mockAgentRegistry: {
    getDiscoveredDefinition: ReturnType<typeof vi.fn>;
    acknowledgeAgent: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    command = new AcknowledgeAgentCommand();
    mockAgentRegistry = {
      getDiscoveredDefinition: vi.fn(),
      acknowledgeAgent: vi.fn(),
    };

    const mockConfig = createMockConfig({
      getAgentRegistry: vi.fn().mockReturnValue(mockAgentRegistry),
    });

    context = {
      config: mockConfig as unknown as Config,
    } as CommandContext;
  });

  it('has topLevel set to true', () => {
    expect(command.topLevel).toBe(true);
  });

  describe('execute', () => {
    it('throws an error if agent name is not provided', async () => {
      await expect(command.execute(context, [])).rejects.toThrow(
        'Agent name is required.',
      );
    });

    it('throws an error if agent registry is not available', async () => {
      // @ts-expect-error - testing error case
      vi.mocked(context.config.getAgentRegistry).mockReturnValue(undefined);
      await expect(command.execute(context, ['agent-name'])).rejects.toThrow(
        'Agent registry not available.',
      );
    });

    it('throws an error if agent is not found', async () => {
      mockAgentRegistry.getDiscoveredDefinition.mockReturnValue(undefined);
      await expect(command.execute(context, ['agent-name'])).rejects.toThrow(
        'Agent "agent-name" not found among discovered agents.',
      );
    });

    it('successfully acknowledges a found agent', async () => {
      const mockAgent = { name: 'agent-name' };
      mockAgentRegistry.getDiscoveredDefinition.mockReturnValue(mockAgent);

      const response = await command.execute(context, ['agent-name']);

      expect(mockAgentRegistry.acknowledgeAgent).toHaveBeenCalledWith(
        mockAgent,
      );
      expect(response).toEqual({
        name: 'acknowledge-agent',
        data: 'Successfully acknowledged agent: agent-name',
      });
    });
  });
});
