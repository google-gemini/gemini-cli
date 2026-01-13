/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

vi.mock('../ui/commands/profileCommand.js', async () => {
  const { CommandKind } = await import('../ui/commands/types.js');
  return {
    profileCommand: {
      name: 'profile',
      description: 'Profile command',
      kind: CommandKind.BUILT_IN,
    },
  };
});

vi.mock('../ui/commands/aboutCommand.js', async () => {
  const { CommandKind } = await import('../ui/commands/types.js');
  return {
    aboutCommand: {
      name: 'about',
      description: 'About the CLI',
      kind: CommandKind.BUILT_IN,
    },
  };
});

vi.mock('../ui/commands/ideCommand.js', async () => {
  const { CommandKind } = await import('../ui/commands/types.js');
  return {
    ideCommand: vi.fn().mockResolvedValue({
      name: 'ide',
      description: 'IDE command',
      kind: CommandKind.BUILT_IN,
    }),
  };
});
vi.mock('../ui/commands/restoreCommand.js', () => ({
  restoreCommand: vi.fn(),
}));
vi.mock('../ui/commands/permissionsCommand.js', async () => {
  const { CommandKind } = await import('../ui/commands/types.js');
  return {
    permissionsCommand: {
      name: 'permissions',
      description: 'Permissions command',
      kind: CommandKind.BUILT_IN,
    },
  };
});

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { BuiltinCommandLoader } from './BuiltinCommandLoader.js';
import type { Config } from '@google/gemini-cli-core';
import { isNightly } from '@google/gemini-cli-core';
import { CommandKind } from '../ui/commands/types.js';

import { restoreCommand } from '../ui/commands/restoreCommand.js';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    isNightly: vi.fn().mockResolvedValue(false),
  };
});

vi.mock('../ui/commands/authCommand.js', () => ({ authCommand: {} }));
vi.mock('../ui/commands/agentsCommand.js', () => ({
  agentsCommand: { name: 'agents' },
}));
vi.mock('../ui/commands/bugCommand.js', () => ({ bugCommand: {} }));
vi.mock('../ui/commands/chatCommand.js', () => ({
  chatCommand: { name: 'chat', subCommands: [] },
  debugCommand: { name: 'debug' },
}));
vi.mock('../ui/commands/clearCommand.js', () => ({ clearCommand: {} }));
vi.mock('../ui/commands/compressCommand.js', () => ({ compressCommand: {} }));
vi.mock('../ui/commands/corgiCommand.js', () => ({ corgiCommand: {} }));
vi.mock('../ui/commands/docsCommand.js', () => ({ docsCommand: {} }));
vi.mock('../ui/commands/editorCommand.js', () => ({ editorCommand: {} }));
vi.mock('../ui/commands/extensionsCommand.js', () => ({
  extensionsCommand: () => ({}),
}));
vi.mock('../ui/commands/helpCommand.js', () => ({ helpCommand: {} }));
vi.mock('../ui/commands/memoryCommand.js', () => ({ memoryCommand: {} }));
vi.mock('../ui/commands/modelCommand.js', () => ({
  modelCommand: { name: 'model' },
}));
vi.mock('../ui/commands/privacyCommand.js', () => ({ privacyCommand: {} }));
vi.mock('../ui/commands/quitCommand.js', () => ({ quitCommand: {} }));
vi.mock('../ui/commands/resumeCommand.js', () => ({ resumeCommand: {} }));
vi.mock('../ui/commands/statsCommand.js', () => ({ statsCommand: {} }));
vi.mock('../ui/commands/themeCommand.js', () => ({ themeCommand: {} }));
vi.mock('../ui/commands/toolsCommand.js', () => ({ toolsCommand: {} }));
vi.mock('../ui/commands/skillsCommand.js', () => ({
  skillsCommand: { name: 'skills' },
}));
vi.mock('../ui/commands/mcpCommand.js', () => ({
  mcpCommand: {
    name: 'mcp',
    description: 'MCP command',
    kind: 'BUILT_IN',
  },
}));

describe('BuiltinCommandLoader', () => {
  let mockConfig: Config;

  const restoreCommandMock = restoreCommand as Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = {
      getFolderTrust: vi.fn().mockReturnValue(true),
      getEnableExtensionReloading: () => false,
      getEnableHooks: () => false,
      getEnableHooksUI: () => false,
      getExtensionsEnabled: vi.fn().mockReturnValue(true),
      isSkillsSupportEnabled: vi.fn().mockReturnValue(false),
      isAgentsEnabled: vi.fn().mockReturnValue(false),
      getMcpEnabled: vi.fn().mockReturnValue(true),
      getSkillManager: vi.fn().mockReturnValue({
        getAllSkills: vi.fn().mockReturnValue([]),
      }),
    } as unknown as Config;

    restoreCommandMock.mockReturnValue({
      name: 'restore',
      description: 'Restore command',
      kind: CommandKind.BUILT_IN,
    });
  });

  it('should correctly pass the config object to restore command factory', async () => {
    const loader = new BuiltinCommandLoader(mockConfig);
    await loader.loadCommands(new AbortController().signal);

    // ideCommand is now a constant, no longer needs config
    expect(restoreCommandMock).toHaveBeenCalledTimes(1);
    expect(restoreCommandMock).toHaveBeenCalledWith(mockConfig);
  });

  it('should filter out null command definitions returned by factories', async () => {
    // ideCommand is now a constant SlashCommand
    const loader = new BuiltinCommandLoader(mockConfig);
    const commands = await loader.loadCommands(new AbortController().signal);

    // The 'ide' command should be present.
    const ideCmd = commands.find((c) => c.name === 'ide');
    expect(ideCmd).toBeDefined();

    // Other commands should still be present.
    const aboutCmd = commands.find((c) => c.name === 'about');
    expect(aboutCmd).toBeDefined();
  });

  it('should handle a null config gracefully when calling factories', async () => {
    const loader = new BuiltinCommandLoader(null);
    await loader.loadCommands(new AbortController().signal);
    // ideCommand is now a constant, no longer needs config
    expect(restoreCommandMock).toHaveBeenCalledTimes(1);
    expect(restoreCommandMock).toHaveBeenCalledWith(null);
  });

  it('should return a list of all loaded commands', async () => {
    const loader = new BuiltinCommandLoader(mockConfig);
    const commands = await loader.loadCommands(new AbortController().signal);

    const aboutCmd = commands.find((c) => c.name === 'about');
    expect(aboutCmd).toBeDefined();
    expect(aboutCmd?.kind).toBe(CommandKind.BUILT_IN);

    const ideCmd = commands.find((c) => c.name === 'ide');
    expect(ideCmd).toBeDefined();

    const mcpCmd = commands.find((c) => c.name === 'mcp');
    expect(mcpCmd).toBeDefined();
  });

  it('should include permissions command when folder trust is enabled', async () => {
    const loader = new BuiltinCommandLoader(mockConfig);
    const commands = await loader.loadCommands(new AbortController().signal);
    const permissionsCmd = commands.find((c) => c.name === 'permissions');
    expect(permissionsCmd).toBeDefined();
  });

  it('should exclude permissions command when folder trust is disabled', async () => {
    (mockConfig.getFolderTrust as Mock).mockReturnValue(false);
    const loader = new BuiltinCommandLoader(mockConfig);
    const commands = await loader.loadCommands(new AbortController().signal);
    const permissionsCmd = commands.find((c) => c.name === 'permissions');
    expect(permissionsCmd).toBeUndefined();
  });

  it('should include policies command when message bus integration is enabled', async () => {
    const mockConfigWithMessageBus = {
      ...mockConfig,
      getEnableHooks: () => false,
      getMcpEnabled: () => true,
    } as unknown as Config;
    const loader = new BuiltinCommandLoader(mockConfigWithMessageBus);
    const commands = await loader.loadCommands(new AbortController().signal);
    const policiesCmd = commands.find((c) => c.name === 'policies');
    expect(policiesCmd).toBeDefined();
  });

  it('should include agents command when agents are enabled', async () => {
    mockConfig.isAgentsEnabled = vi.fn().mockReturnValue(true);
    const loader = new BuiltinCommandLoader(mockConfig);
    const commands = await loader.loadCommands(new AbortController().signal);
    const agentsCmd = commands.find((c) => c.name === 'agents');
    expect(agentsCmd).toBeDefined();
  });

  it('should exclude agents command when agents are disabled', async () => {
    mockConfig.isAgentsEnabled = vi.fn().mockReturnValue(false);
    const loader = new BuiltinCommandLoader(mockConfig);
    const commands = await loader.loadCommands(new AbortController().signal);
    const agentsCmd = commands.find((c) => c.name === 'agents');
    expect(agentsCmd).toBeUndefined();
  });

  describe('chat debug command', () => {
    it('should NOT add debug subcommand to chatCommand if not a nightly build', async () => {
      vi.mocked(isNightly).mockResolvedValue(false);
      const loader = new BuiltinCommandLoader(mockConfig);
      const commands = await loader.loadCommands(new AbortController().signal);

      const chatCmd = commands.find((c) => c.name === 'chat');
      expect(chatCmd?.subCommands).toBeDefined();
      const hasDebug = chatCmd!.subCommands!.some((c) => c.name === 'debug');
      expect(hasDebug).toBe(false);
    });

    it('should add debug subcommand to chatCommand if it is a nightly build', async () => {
      vi.mocked(isNightly).mockResolvedValue(true);
      const loader = new BuiltinCommandLoader(mockConfig);
      const commands = await loader.loadCommands(new AbortController().signal);

      const chatCmd = commands.find((c) => c.name === 'chat');
      expect(chatCmd?.subCommands).toBeDefined();
      const hasDebug = chatCmd!.subCommands!.some((c) => c.name === 'debug');
      expect(hasDebug).toBe(true);
    });
  });
});

describe('BuiltinCommandLoader profile', () => {
  let mockConfig: Config;

  beforeEach(() => {
    vi.resetModules();
    mockConfig = {
      getFolderTrust: vi.fn().mockReturnValue(false),
      getCheckpointingEnabled: () => false,
      getEnableExtensionReloading: () => false,
      getEnableHooks: () => false,
      getEnableHooksUI: () => false,
      getExtensionsEnabled: vi.fn().mockReturnValue(true),
      isSkillsSupportEnabled: vi.fn().mockReturnValue(false),
      isAgentsEnabled: vi.fn().mockReturnValue(false),
      getMcpEnabled: vi.fn().mockReturnValue(true),
      getSkillManager: vi.fn().mockReturnValue({
        getAllSkills: vi.fn().mockReturnValue([]),
      }),
    } as unknown as Config;
  });

  it('should not include profile command when isDevelopment is false', async () => {
    process.env['NODE_ENV'] = 'production';
    const { BuiltinCommandLoader } = await import('./BuiltinCommandLoader.js');
    const loader = new BuiltinCommandLoader(mockConfig);
    const commands = await loader.loadCommands(new AbortController().signal);
    const profileCmd = commands.find((c) => c.name === 'profile');
    expect(profileCmd).toBeUndefined();
  });

  it('should include profile command when isDevelopment is true', async () => {
    process.env['NODE_ENV'] = 'development';
    const { BuiltinCommandLoader } = await import('./BuiltinCommandLoader.js');
    const loader = new BuiltinCommandLoader(mockConfig);
    const commands = await loader.loadCommands(new AbortController().signal);
    const profileCmd = commands.find((c) => c.name === 'profile');
    expect(profileCmd).toBeDefined();
  });
});
