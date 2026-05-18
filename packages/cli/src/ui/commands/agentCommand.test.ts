/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { agentCommand } from './agentCommand.js';
import { type CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import type { Config } from '@google/gemini-cli-core';
import { MessageType } from '../types.js';

describe('agentCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    mockContext = createMockCommandContext();
  });

  it('should return a dialog action to open the agent dialog when no args', async () => {
    if (!agentCommand.action) {
      throw new Error('The agent command must have an action.');
    }

    const result = await agentCommand.action(mockContext, '');

    expect(result).toEqual({
      type: 'dialog',
      dialog: 'agent',
    });
  });

  describe('manage subcommand', () => {
    it('should return a dialog action to open the agent dialog', async () => {
      const manageCommand = agentCommand.subCommands?.find(
        (c) => c.name === 'manage',
      );
      expect(manageCommand).toBeDefined();

      const result = await manageCommand!.action!(mockContext, '');

      expect(result).toEqual({
        type: 'dialog',
        dialog: 'agent',
      });
    });
  });

  describe('set subcommand', () => {
    it('should set the agent and log the command', async () => {
      const setCommand = agentCommand.subCommands?.find(
        (c) => c.name === 'set',
      );
      expect(setCommand).toBeDefined();

      const mockSetAgent = vi.fn();
      mockContext.services.agentContext = {
        setAgent: mockSetAgent,
        get config() {
          return this;
        },
      } as unknown as Config;

      await setCommand!.action!(mockContext, 'gemini-enterprise');

      expect(mockSetAgent).toHaveBeenCalledWith('gemini-enterprise', true);
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: expect.stringContaining('Agent set to gemini-enterprise'),
        }),
      );
    });

    it('should set the agent with persistence when --persist is used', async () => {
      const setCommand = agentCommand.subCommands?.find(
        (c) => c.name === 'set',
      );
      const mockSetAgent = vi.fn();
      mockContext.services.agentContext = {
        setAgent: mockSetAgent,
        get config() {
          return this;
        },
      } as unknown as Config;

      await setCommand!.action!(mockContext, 'gemini-cli --persist');

      expect(mockSetAgent).toHaveBeenCalledWith('gemini-cli', false);
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: expect.stringContaining('Agent set to gemini-cli (persisted)'),
        }),
      );
    });

    it('should show error if no agent name is provided', async () => {
      const setCommand = agentCommand.subCommands?.find(
        (c) => c.name === 'set',
      );
      await setCommand!.action!(mockContext, '');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.ERROR,
          text: expect.stringContaining('Usage: /agent set <agent-name>'),
        }),
      );
    });

    it('should show error if invalid agent name is provided', async () => {
      const setCommand = agentCommand.subCommands?.find(
        (c) => c.name === 'set',
      );
      mockContext.services.agentContext = {
        setAgent: vi.fn(),
        get config() {
          return this;
        },
      } as unknown as Config;

      await setCommand!.action!(mockContext, 'invalid-agent');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.ERROR,
          text: expect.stringContaining('Unknown agent: invalid-agent'),
        }),
      );
    });
  });

  it('should have the correct name and description', () => {
    expect(agentCommand.name).toBe('agent');
    expect(agentCommand.description).toBe('Manage active AI agent configuration');
  });
});
