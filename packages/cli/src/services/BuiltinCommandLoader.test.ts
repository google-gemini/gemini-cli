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
import { CommandKind } from '../ui/commands/types.js';

import { restoreCommand } from '../ui/commands/restoreCommand.js';

vi.mock('../ui/commands/authCommand.js', () => ({ authCommand: {} }));
vi.mock('../ui/commands/bugCommand.js', () => ({ bugCommand: {} }));
vi.mock('../ui/commands/chatCommand.js', () => ({ chatCommand: {} }));
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
vi.mock('../ui/commands/statsCommand.js', () => ({ statsCommand: {} }));
vi.mock('../ui/commands/themeCommand.js', () => ({ themeCommand: {} }));
vi.mock('../ui/commands/toolsCommand.js', () => ({ toolsCommand: {} }));
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
      getUseModelRouter: () => false,
      getEnableMessageBusIntegration: () => false,
      getEnableExtensionReloading: () => false,
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

  it('should include modelCommand when getUseModelRouter is true', async () => {
    const mockConfigWithModelRouter = {
      ...mockConfig,
      getUseModelRouter: () => true,
    } as unknown as Config;
    const loader = new BuiltinCommandLoader(mockConfigWithModelRouter);
    const commands = await loader.loadCommands(new AbortController().signal);
    const modelCmd = commands.find((c) => c.name === 'model');
    expect(modelCmd).toBeDefined();
  });

  it('should not include modelCommand when getUseModelRouter is false', async () => {
    const mockConfigWithoutModelRouter = {
      ...mockConfig,
      getUseModelRouter: () => false,
    } as unknown as Config;
    const loader = new BuiltinCommandLoader(mockConfigWithoutModelRouter);
    const commands = await loader.loadCommands(new AbortController().signal);
    const modelCmd = commands.find((c) => c.name === 'model');
    expect(modelCmd).toBeUndefined();
  });

  it('should include policies command when message bus integration is enabled', async () => {
    const mockConfigWithMessageBus = {
      ...mockConfig,
      getEnableMessageBusIntegration: () => true,
    } as unknown as Config;
    const loader = new BuiltinCommandLoader(mockConfigWithMessageBus);
    const commands = await loader.loadCommands(new AbortController().signal);
    const policiesCmd = commands.find((c) => c.name === 'policies');
    expect(policiesCmd).toBeDefined();
  });

  it('should exclude policies command when message bus integration is disabled', async () => {
    const mockConfigWithoutMessageBus = {
      ...mockConfig,
      getEnableMessageBusIntegration: () => false,
    } as unknown as Config;
    const loader = new BuiltinCommandLoader(mockConfigWithoutMessageBus);
    const commands = await loader.loadCommands(new AbortController().signal);
    const policiesCmd = commands.find((c) => c.name === 'policies');
    expect(policiesCmd).toBeUndefined();
  });
});

describe('BuiltinCommandLoader profile', () => {
  let mockConfig: Config;

  beforeEach(() => {
    vi.resetModules();
    mockConfig = {
      getFolderTrust: vi.fn().mockReturnValue(false),
      getUseModelRouter: () => false,
      getCheckpointingEnabled: () => false,
      getEnableMessageBusIntegration: () => false,
      getEnableExtensionReloading: () => false,
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
