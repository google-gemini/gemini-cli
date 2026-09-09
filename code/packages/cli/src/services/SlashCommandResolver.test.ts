/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { SlashCommandResolver } from './SlashCommandResolver.js';
import { CommandKind, type SlashCommand } from '../ui/commands/types.js';

const createMockCommand = (name: string, kind: CommandKind): SlashCommand => ({
  name,
  description: `Description for ${name}`,
  kind,
  action: vi.fn(),
});

describe('SlashCommandResolver', () => {
  describe('resolve', () => {
    it('should return all commands when there are no conflicts', () => {
      const cmdA = createMockCommand('a', CommandKind.BUILT_IN);
      const cmdB = createMockCommand('b', CommandKind.USER_FILE);

      const { finalCommands, conflicts } = SlashCommandResolver.resolve([
        cmdA,
        cmdB,
      ]);

      expect(finalCommands).toHaveLength(2);
      expect(conflicts).toHaveLength(0);
    });

    it('should rename extension commands when they conflict with built-in', () => {
      const builtin = createMockCommand('deploy', CommandKind.BUILT_IN);
      const extension = {
        ...createMockCommand('deploy', CommandKind.EXTENSION_FILE),
        extensionName: 'firebase',
      };

      const { finalCommands, conflicts } = SlashCommandResolver.resolve([
        builtin,
        extension,
      ]);

      expect(finalCommands.map((c) => c.name)).toContain('deploy');
      expect(finalCommands.map((c) => c.name)).toContain('firebase:deploy');
      expect(conflicts).toHaveLength(1);
    });

    it('should prefix both user and workspace commands when they conflict', () => {
      const userCmd = createMockCommand('sync', CommandKind.USER_FILE);
      const workspaceCmd = createMockCommand(
        'sync',
        CommandKind.WORKSPACE_FILE,
      );

      const { finalCommands, conflicts } = SlashCommandResolver.resolve([
        userCmd,
        workspaceCmd,
      ]);

      const names = finalCommands.map((c) => c.name);
      expect(names).not.toContain('sync');
      expect(names).toContain('user.sync');
      expect(names).toContain('workspace.sync');
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].losers).toHaveLength(2); // Both are considered losers
    });

    it('should prefix file commands but keep built-in names during conflicts', () => {
      const builtin = createMockCommand('help', CommandKind.BUILT_IN);
      const user = createMockCommand('help', CommandKind.USER_FILE);

      const { finalCommands } = SlashCommandResolver.resolve([builtin, user]);

      const names = finalCommands.map((c) => c.name);
      expect(names).toContain('help');
      expect(names).toContain('user.help');
    });

    it('should prefix both commands when MCP and user file conflict', () => {
      const mcp = {
        ...createMockCommand('test', CommandKind.MCP_PROMPT),
        mcpServerName: 'test-server',
      };
      const user = createMockCommand('test', CommandKind.USER_FILE);

      const { finalCommands } = SlashCommandResolver.resolve([mcp, user]);

      const names = finalCommands.map((c) => c.name);
      expect(names).not.toContain('test');
      expect(names).toContain('test-server.test');
      expect(names).toContain('user.test');
    });

    it('should prefix MCP commands with server name when they conflict with built-in', () => {
      const builtin = createMockCommand('help', CommandKind.BUILT_IN);
      const mcp = {
        ...createMockCommand('help', CommandKind.MCP_PROMPT),
        mcpServerName: 'test-server',
      };

      const { finalCommands } = SlashCommandResolver.resolve([builtin, mcp]);

      const names = finalCommands.map((c) => c.name);
      expect(names).toContain('help');
      expect(names).toContain('test-server.help');
    });

    it('should prefix both MCP commands when they conflict with each other', () => {
      const mcp1 = {
        ...createMockCommand('test', CommandKind.MCP_PROMPT),
        mcpServerName: 'server1',
      };
      const mcp2 = {
        ...createMockCommand('test', CommandKind.MCP_PROMPT),
        mcpServerName: 'server2',
      };

      const { finalCommands } = SlashCommandResolver.resolve([mcp1, mcp2]);

      const names = finalCommands.map((c) => c.name);
      expect(names).not.toContain('test');
      expect(names).toContain('server1.test');
      expect(names).toContain('server2.test');
    });

    it('should favor the last built-in command silently during conflicts', () => {
      const builtin1 = {
        ...createMockCommand('help', CommandKind.BUILT_IN),
        description: 'first',
      };
      const builtin2 = {
        ...createMockCommand('help', CommandKind.BUILT_IN),
        description: 'second',
      };

      const { finalCommands } = SlashCommandResolver.resolve([
        builtin1,
        builtin2,
      ]);

      expect(finalCommands).toHaveLength(1);
      expect(finalCommands[0].description).toBe('second');
    });

    it('should fallback to numeric suffixes when both prefix and kind-based prefix are missing', () => {
      const cmd1 = createMockCommand('test', CommandKind.BUILT_IN);
      const cmd2 = {
        ...createMockCommand('test', 'unknown' as CommandKind),
      };

      const { finalCommands } = SlashCommandResolver.resolve([cmd1, cmd2]);

      const names = finalCommands.map((c) => c.name);
      expect(names).toContain('test');
      expect(names).toContain('test1');
    });

    it('should apply numeric suffixes when renames also conflict', () => {
      const user1 = createMockCommand('deploy', CommandKind.USER_FILE);
      const user2 = createMockCommand('gcp:deploy', CommandKind.USER_FILE);
      const extension = {
        ...createMockCommand('deploy', CommandKind.EXTENSION_FILE),
        extensionName: 'gcp',
      };

      const { finalCommands } = SlashCommandResolver.resolve([
        user1,
        user2,
        extension,
      ]);

      expect(finalCommands.find((c) => c.name === 'gcp:deploy1')).toBeDefined();
    });

    it('should prefix skills with extension name when they conflict with built-in', () => {
      const builtin = createMockCommand('chat', CommandKind.BUILT_IN);
      const skill = {
        ...createMockCommand('chat', CommandKind.SKILL),
        extensionName: 'google-workspace',
      };

      const { finalCommands } = SlashCommandResolver.resolve([builtin, skill]);

      const names = finalCommands.map((c) => c.name);
      expect(names).toContain('chat');
      expect(names).toContain('google-workspace:chat');
    });

    it('should ALWAYS prefix extension skills even if no conflict exists', () => {
      const skill = {
        ...createMockCommand('chat', CommandKind.SKILL),
        extensionName: 'google-workspace',
      };

      const { finalCommands } = SlashCommandResolver.resolve([skill]);

      const names = finalCommands.map((c) => c.name);
      expect(names).toContain('google-workspace:chat');
      expect(names).not.toContain('chat');
    });

    it('should use numeric suffixes if prefixed skill names collide', () => {
      const skill1 = {
        ...createMockCommand('chat', CommandKind.SKILL),
        extensionName: 'google-workspace',
      };
      const skill2 = {
        ...createMockCommand('chat', CommandKind.SKILL),
        extensionName: 'google-workspace',
      };

      const { finalCommands } = SlashCommandResolver.resolve([skill1, skill2]);

      const names = finalCommands.map((c) => c.name);
      expect(names).toContain('google-workspace:chat');
      expect(names).toContain('google-workspace:chat1');
    });

    it('should NOT prefix skills with "skill" when extension name is missing', () => {
      const builtin = createMockCommand('chat', CommandKind.BUILT_IN);
      const skill = createMockCommand('chat', CommandKind.SKILL);

      const { finalCommands } = SlashCommandResolver.resolve([builtin, skill]);

      const names = finalCommands.map((c) => c.name);
      expect(names).toContain('chat');
      expect(names).toContain('chat1');
    });
  });
});
