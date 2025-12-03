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
          text: 'No active policies.',
        }),
        expect.any(Number),
      );
    });

    it('should list active policies in correct format', async () => {
      const mockRules = [
        {
          decision: PolicyDecision.DENY,
          toolName: 'dangerousTool',
          priority: 10,
        },
        {
          decision: PolicyDecision.ALLOW,
          argsPattern: /safe/,
        },
        {
          decision: PolicyDecision.ASK_USER,
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
          text: expect.stringContaining('**Active Policies**'),
        }),
        expect.any(Number),
      );

      const call = vi.mocked(mockContext.ui.addItem).mock.calls[0];
      const content = (call[0] as { text: string }).text;

      expect(content).toContain(
        '1. **DENY** tool: `dangerousTool` [Priority: 10]',
      );
      expect(content).toContain('2. **ALLOW** all tools (safe)');
      expect(content).toContain('3. **ASK_USER** all tools');
    });
    it('should render wildcard policies correctly', async () => {
      const mockRules = [
        {
          decision: PolicyDecision.ALLOW,
          toolName: 'myServer__*',
          priority: 2.95,
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

      const call = vi.mocked(mockContext.ui.addItem).mock.calls[0];
      const content = (call[0] as { text: string }).text;

      // Check what it currently renders
      expect(content).toContain('all tools for server `myServer`');
    });

    it('should render friendly names for known tools and beautify argsPattern', async () => {
      const mockRules = [
        {
          decision: PolicyDecision.ALLOW,
          toolName: 'run_shell_command',
          argsPattern: /"command"\s*:\s*"(?:whoami|hostname)(?:\s|")/,
          priority: 2.95,
        },
        {
          decision: PolicyDecision.ALLOW,
          toolName: 'run_shell_command',
          argsPattern: /"command":"git branch -d/,
          priority: 2.15,
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

      const call = vi.mocked(mockContext.ui.addItem).mock.calls[0];
      const content = (call[0] as { text: string }).text;

      expect(content).toContain('tool: `Shell` (command: whoami, hostname)');
      expect(content).toContain(
        'tool: `Shell` (command starts with "git branch -d")',
      );
      // Should not contain raw regex anymore
      expect(content).not.toContain('"command"\\s*:\\s*"');
    });
  });
});
