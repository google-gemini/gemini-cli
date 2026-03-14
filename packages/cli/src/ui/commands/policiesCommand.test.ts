/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { policiesCommand } from './policiesCommand.js';
import { CommandKind } from './types.js';
import { MessageType } from '../types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { type Config, PolicyDecision } from '@google/gemini-cli-core';

describe('policiesCommand', () => {
  let mockContext: ReturnType<typeof createMockCommandContext>;

  beforeEach(() => {
    mockContext = createMockCommandContext();
  });

  it('should have correct command definition', () => {
    expect(policiesCommand.name).toBe('policies');
    expect(policiesCommand.description).toBe('Manage policies');
    expect(policiesCommand.kind).toBe(CommandKind.BUILT_IN);
    expect(policiesCommand.subCommands).toHaveLength(1);
    expect(policiesCommand.subCommands![0].name).toBe('list');
  });

  describe('list subcommand', () => {
    it('should show error if config is missing', async () => {
      mockContext.services.config = null;
      const listCommand = policiesCommand.subCommands![0];

      await listCommand.action!(mockContext, '');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.ERROR,
          text: 'Error: Config not available.',
        }),
        expect.any(Number),
      );
    });

    it('should show message when no policies are active', async () => {
      const mockPolicyEngine = {
        getRules: vi.fn().mockReturnValue([]),
      };
      mockContext.services.config = {
        getPolicyEngine: vi.fn().mockReturnValue(mockPolicyEngine),
      } as unknown as Config;

      const listCommand = policiesCommand.subCommands![0];
      await listCommand.action!(mockContext, '');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: 'No custom policies configured.',
        }),
        expect.any(Number),
      );
    });

    it('should show no-policies message when only default policies exist', async () => {
      const mockRules = [
        {
          decision: PolicyDecision.ALLOW,
          toolName: 'glob',
          priority: 1.05,
          source: 'Default: read-only.toml',
        },
        {
          decision: PolicyDecision.ASK_USER,
          toolName: 'run_shell_command',
          priority: 1.01,
          source: 'Default: write.toml',
        },
      ];
      const mockPolicyEngine = {
        getRules: vi.fn().mockReturnValue(mockRules),
      };
      mockContext.services.config = {
        getPolicyEngine: vi.fn().mockReturnValue(mockPolicyEngine),
      } as unknown as Config;

      const listCommand = policiesCommand.subCommands![0];
      await listCommand.action!(mockContext, '');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: 'No custom policies configured.',
        }),
        expect.any(Number),
      );
    });

    it('should return custom_dialog when policies exist', async () => {
      const mockRules = [
        {
          decision: PolicyDecision.DENY,
          toolName: 'dangerousTool',
          priority: 10,
        },
        {
          decision: PolicyDecision.ALLOW,
          argsPattern: /safe/,
          source: 'test.toml',
        },
        {
          decision: PolicyDecision.ASK_USER,
        },
      ];
      const mockPolicyEngine = {
        getRules: vi.fn().mockReturnValue(mockRules),
      };
      const mockToolRegistry = {
        getTool: vi.fn().mockReturnValue(undefined),
      };
      mockContext.services.config = {
        getPolicyEngine: vi.fn().mockReturnValue(mockPolicyEngine),
        getToolRegistry: vi.fn().mockReturnValue(mockToolRegistry),
      } as unknown as Config;

      const listCommand = policiesCommand.subCommands![0];
      const result = await listCommand.action!(mockContext, '');

      expect(result).toMatchObject({
        type: 'custom_dialog',
      });
      expect(result).toHaveProperty('component');
    });

    it('should populate toolDisplayNames from tool registry', async () => {
      const mockRules = [
        {
          decision: PolicyDecision.ALLOW,
          toolName: 'run_shell_command',
          priority: 5,
        },
        {
          decision: PolicyDecision.ALLOW,
          toolName: 'glob',
          priority: 3,
        },
      ];
      const mockPolicyEngine = {
        getRules: vi.fn().mockReturnValue(mockRules),
      };
      const mockToolRegistry = {
        getTool: vi.fn().mockImplementation((name: string) => {
          const displayNames: Record<string, string> = {
            run_shell_command: 'Shell',
            glob: 'FindFiles',
          };
          if (displayNames[name]) {
            return { displayName: displayNames[name] };
          }
          return undefined;
        }),
      };
      mockContext.services.config = {
        getPolicyEngine: vi.fn().mockReturnValue(mockPolicyEngine),
        getToolRegistry: vi.fn().mockReturnValue(mockToolRegistry),
      } as unknown as Config;

      const listCommand = policiesCommand.subCommands![0];
      const result = await listCommand.action!(mockContext, '');

      expect(result).toMatchObject({ type: 'custom_dialog' });
      // Verify getTool was called for each unique toolName
      expect(mockToolRegistry.getTool).toHaveBeenCalledWith(
        'run_shell_command',
      );
      expect(mockToolRegistry.getTool).toHaveBeenCalledWith('glob');
    });
  });

  describe('parent command', () => {
    it('should also return custom_dialog when policies exist', async () => {
      const mockRules = [
        {
          decision: PolicyDecision.ALLOW,
          toolName: 'glob',
          priority: 5,
        },
      ];
      const mockPolicyEngine = {
        getRules: vi.fn().mockReturnValue(mockRules),
      };
      const mockToolRegistry = {
        getTool: vi.fn().mockReturnValue(undefined),
      };
      mockContext.services.config = {
        getPolicyEngine: vi.fn().mockReturnValue(mockPolicyEngine),
        getToolRegistry: vi.fn().mockReturnValue(mockToolRegistry),
      } as unknown as Config;

      const result = await policiesCommand.action!(mockContext, '');

      expect(result).toMatchObject({ type: 'custom_dialog' });
      expect(result).toHaveProperty('component');
    });

    it('should show error if config is missing', async () => {
      mockContext.services.config = null;

      await policiesCommand.action!(mockContext, '');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.ERROR,
          text: 'Error: Config not available.',
        }),
        expect.any(Number),
      );
    });
  });
});
