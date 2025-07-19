/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { BuiltinCommandLoader } from './BuiltinCommandLoader.js';
import { Config } from '@google/gemini-cli-core';

vi.mock('../ui/commands/aboutCommand.js', () => ({
  aboutCommand: { name: 'about', description: 'About the CLI' },
}));
vi.mock('../ui/commands/chatCommand.js', () => ({
  chatCommand: {
    name: 'chat',
    description: 'A nested command',
    subCommands: [{ name: 'save', description: 'A subcommand' }],
  },
}));

vi.mock('../ui/commands/ideCommand.js', () => ({ ideCommand: vi.fn() }));
vi.mock('../ui/commands/restoreCommand.js', () => ({
  restoreCommand: vi.fn(),
}));

import { ideCommand } from '../ui/commands/ideCommand.js';
import { restoreCommand } from '../ui/commands/restoreCommand.js';

vi.mock('../ui/commands/authCommand.js', () => ({ authCommand: {} }));
vi.mock('../ui/commands/bugCommand.js', () => ({ bugCommand: {} }));
vi.mock('../ui/commands/clearCommand.js', () => ({ clearCommand: {} }));
vi.mock('../ui/commands/compressCommand.js', () => ({ compressCommand: {} }));
vi.mock('../ui/commands/corgiCommand.js', () => ({ corgiCommand: {} }));
vi.mock('../ui/commands/docsCommand.js', () => ({ docsCommand: {} }));
vi.mock('../ui/commands/editorCommand.js', () => ({ editorCommand: {} }));
vi.mock('../ui/commands/extensionsCommand.js', () => ({
  extensionsCommand: {},
}));
vi.mock('../ui/commands/helpCommand.js', () => ({ helpCommand: {} }));
vi.mock('../ui/commands/mcpCommand.js', () => ({ mcpCommand: {} }));
vi.mock('../ui/commands/memoryCommand.js', () => ({ memoryCommand: {} }));
vi.mock('../ui/commands/privacyCommand.js', () => ({ privacyCommand: {} }));
vi.mock('../ui/commands/quitCommand.js', () => ({ quitCommand: {} }));
vi.mock('../ui/commands/statsCommand.js', () => ({ statsCommand: {} }));
vi.mock('../ui/commands/themeCommand.js', () => ({ themeCommand: {} }));
vi.mock('../ui/commands/toolsCommand.js', () => ({ toolsCommand: {} }));

describe('BuiltinCommandLoader', () => {
  let mockConfig: Config;

  const ideCommandMock = ideCommand as Mock;
  const restoreCommandMock = restoreCommand as Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = { some: 'config' } as unknown as Config;

    ideCommandMock.mockReturnValue({
      name: 'ide',
      description: 'IDE command',
    });
    restoreCommandMock.mockReturnValue({
      name: 'restore',
      description: 'Restore command',
    });
  });

  it('should load all command definitions and add built-in metadata', async () => {
    const loader = new BuiltinCommandLoader(mockConfig);
    const commands = await loader.loadCommands();
    const aboutCmd = commands.find((c) => c.name === 'about');
    expect(aboutCmd).toBeDefined();
    expect(aboutCmd?.metadata).toEqual({
      source: 'built-in',
      behavior: 'Custom',
    });
  });

  it('should recursively add metadata to nested sub-commands', async () => {
    const loader = new BuiltinCommandLoader(mockConfig);
    const commands = await loader.loadCommands();
    const chatCmd = commands.find((c) => c.name === 'chat');
    expect(chatCmd).toBeDefined();
    expect(chatCmd?.metadata).toEqual({
      source: 'built-in',
      behavior: 'Custom',
    });
    expect(chatCmd?.subCommands).toHaveLength(1);
    const saveSubCmd = chatCmd?.subCommands?.[0];
    expect(saveSubCmd?.name).toBe('save');
    expect(saveSubCmd?.metadata).toEqual({
      source: 'built-in',
      behavior: 'Custom',
    });
  });

  it('should correctly pass the config object to command factory functions', async () => {
    const loader = new BuiltinCommandLoader(mockConfig);
    await loader.loadCommands();

    expect(ideCommandMock).toHaveBeenCalledTimes(1);
    expect(ideCommandMock).toHaveBeenCalledWith(mockConfig);
    expect(restoreCommandMock).toHaveBeenCalledTimes(1);
    expect(restoreCommandMock).toHaveBeenCalledWith(mockConfig);
  });

  it('should filter out null command definitions returned by factories', async () => {
    // Override the imported mock's behavior for this test
    ideCommandMock.mockReturnValue(null);
    const loader = new BuiltinCommandLoader(mockConfig);
    const commands = await loader.loadCommands();
    const ideCmd = commands.find((c) => c.name === 'ide');
    expect(ideCmd).toBeUndefined();
    const aboutCmd = commands.find((c) => c.name === 'about');
    expect(aboutCmd).toBeDefined();
  });

  it('should handle a null config gracefully when calling factories', async () => {
    const loader = new BuiltinCommandLoader(null);
    await loader.loadCommands();
    expect(ideCommandMock).toHaveBeenCalledTimes(1);
    expect(ideCommandMock).toHaveBeenCalledWith(null);
    expect(restoreCommandMock).toHaveBeenCalledTimes(1);
    expect(restoreCommandMock).toHaveBeenCalledWith(null);
  });

  it('should not modify the original command definition objects', async () => {
    const { chatCommand: originalChatCommand } = await import(
      '../ui/commands/chatCommand.js'
    );
    const loader = new BuiltinCommandLoader(mockConfig);
    const commands = await loader.loadCommands();
    const transformedChatCommand = commands.find((c) => c.name === 'chat');

    expect(transformedChatCommand?.metadata).toBeDefined();
    expect(originalChatCommand).not.toHaveProperty('metadata');
  });
});
