/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, type Mocked } from 'vitest';
import { CommandService } from './CommandService.js';
import { type Config } from '@google/gemini-cli-core';
import { type SlashCommand } from '../ui/commands/types.js';
import { memoryCommand } from '../ui/commands/memoryCommand.js';
import { helpCommand } from '../ui/commands/helpCommand.js';
import { clearCommand } from '../ui/commands/clearCommand.js';
import { corgiCommand } from '../ui/commands/corgiCommand.js';
import { docsCommand } from '../ui/commands/docsCommand.js';
import { chatCommand } from '../ui/commands/chatCommand.js';
import { authCommand } from '../ui/commands/authCommand.js';
import { themeCommand } from '../ui/commands/themeCommand.js';
import { statsCommand } from '../ui/commands/statsCommand.js';
import { privacyCommand } from '../ui/commands/privacyCommand.js';
import { aboutCommand } from '../ui/commands/aboutCommand.js';
import { ideCommand } from '../ui/commands/ideCommand.js';
import { extensionsCommand } from '../ui/commands/extensionsCommand.js';
import { toolsCommand } from '../ui/commands/toolsCommand.js';
import { compressCommand } from '../ui/commands/compressCommand.js';
import { mcpCommand } from '../ui/commands/mcpCommand.js';
import { editorCommand } from '../ui/commands/editorCommand.js';
import { bugCommand } from '../ui/commands/bugCommand.js';
import { quitCommand } from '../ui/commands/quitCommand.js';
import { restoreCommand } from '../ui/commands/restoreCommand.js';

// Mock the command modules to isolate the service from the command implementations.
vi.mock('../ui/commands/memoryCommand.js', () => ({
  memoryCommand: { name: 'memory', description: 'Mock Memory' },
}));
vi.mock('../ui/commands/helpCommand.js', () => ({
  helpCommand: { name: 'help', description: 'Mock Help' },
}));
vi.mock('../ui/commands/clearCommand.js', () => ({
  clearCommand: { name: 'clear', description: 'Mock Clear' },
}));
vi.mock('../ui/commands/corgiCommand.js', () => ({
  corgiCommand: { name: 'corgi', description: 'Mock Corgi' },
}));
vi.mock('../ui/commands/docsCommand.js', () => ({
  docsCommand: { name: 'docs', description: 'Mock Docs' },
}));
vi.mock('../ui/commands/authCommand.js', () => ({
  authCommand: { name: 'auth', description: 'Mock Auth' },
}));
vi.mock('../ui/commands/themeCommand.js', () => ({
  themeCommand: { name: 'theme', description: 'Mock Theme' },
}));
vi.mock('../ui/commands/privacyCommand.js', () => ({
  privacyCommand: { name: 'privacy', description: 'Mock Privacy' },
}));
vi.mock('../ui/commands/statsCommand.js', () => ({
  statsCommand: { name: 'stats', description: 'Mock Stats' },
}));
vi.mock('../ui/commands/aboutCommand.js', () => ({
  aboutCommand: { name: 'about', description: 'Mock About' },
}));
vi.mock('../ui/commands/ideCommand.js', () => ({
  ideCommand: vi.fn(),
}));
vi.mock('../ui/commands/extensionsCommand.js', () => ({
  extensionsCommand: { name: 'extensions', description: 'Mock Extensions' },
}));
vi.mock('../ui/commands/toolsCommand.js', () => ({
  toolsCommand: { name: 'tools', description: 'Mock Tools' },
}));
vi.mock('../ui/commands/compressCommand.js', () => ({
  compressCommand: { name: 'compress', description: 'Mock Compress' },
}));
vi.mock('../ui/commands/mcpCommand.js', () => ({
  mcpCommand: { name: 'mcp', description: 'Mock MCP' },
}));
vi.mock('../ui/commands/editorCommand.js', () => ({
  editorCommand: { name: 'editor', description: 'Mock Editor' },
}));
vi.mock('../ui/commands/bugCommand.js', () => ({
  bugCommand: { name: 'bug', description: 'Mock Bug' },
}));
vi.mock('../ui/commands/quitCommand.js', () => ({
  quitCommand: { name: 'quit', description: 'Mock Quit' },
}));
vi.mock('../ui/commands/restoreCommand.js', () => ({
  restoreCommand: vi.fn(),
}));

describe('CommandService', () => {
  const subCommandLen = 18;
  let mockConfig: Mocked<Config>;

  beforeEach(() => {
    mockConfig = {
      getIdeMode: vi.fn(),
      getCheckpointingEnabled: vi.fn(),
    } as unknown as Mocked<Config>;
    vi.mocked(ideCommand).mockReturnValue(null);
    vi.mocked(restoreCommand).mockReturnValue(null);
  });

  describe('when using default production loader', () => {
    let commandService: CommandService;

    beforeEach(() => {
      commandService = new CommandService(mockConfig);
    });

    it('should initialize with an empty command tree', () => {
      const tree = commandService.getCommands();
      expect(tree).toBeInstanceOf(Array);
      expect(tree.length).toBe(0);
    });

    describe('loadCommands', () => {
      it('should load the built-in commands into the command tree', async () => {
        // Pre-condition check
        expect(commandService.getCommands().length).toBe(0);

        // Action
        await commandService.loadCommands();
        const tree = commandService.getCommands();

        // Post-condition assertions
        expect(tree.length).toBe(subCommandLen);

        const commandNames = tree.map((cmd) => cmd.name);
        expect(commandNames).toContain('auth');
        expect(commandNames).toContain('bug');
        expect(commandNames).toContain('memory');
        expect(commandNames).toContain('help');
        expect(commandNames).toContain('clear');
        expect(commandNames).toContain('compress');
        expect(commandNames).toContain('corgi');
        expect(commandNames).toContain('docs');
        expect(commandNames).toContain('chat');
        expect(commandNames).toContain('theme');
        expect(commandNames).toContain('stats');
        expect(commandNames).toContain('privacy');
        expect(commandNames).toContain('about');
        expect(commandNames).toContain('extensions');
        expect(commandNames).toContain('tools');
        expect(commandNames).toContain('mcp');
        expect(commandNames).not.toContain('ide');
      });

      it('should include ide command when ideMode is on', async () => {
        mockConfig.getIdeMode.mockReturnValue(true);
        vi.mocked(ideCommand).mockReturnValue({
          name: 'ide',
          description: 'Mock IDE',
        });
        await commandService.loadCommands();
        const tree = commandService.getCommands();

        expect(tree.length).toBe(subCommandLen + 1);
        const commandNames = tree.map((cmd) => cmd.name);
        expect(commandNames).toContain('ide');
        expect(commandNames).toContain('editor');
        expect(commandNames).toContain('quit');
      });

      it('should include restore command when checkpointing is on', async () => {
        mockConfig.getCheckpointingEnabled.mockReturnValue(true);
        vi.mocked(restoreCommand).mockReturnValue({
          name: 'restore',
          description: 'Mock Restore',
        });
        await commandService.loadCommands();
        const tree = commandService.getCommands();

        expect(tree.length).toBe(subCommandLen + 1);
        const commandNames = tree.map((cmd) => cmd.name);
        expect(commandNames).toContain('restore');
      });

      it('should overwrite any existing commands when called again', async () => {
        // Load once
        await commandService.loadCommands();
        expect(commandService.getCommands().length).toBe(subCommandLen);

        // Load again
        await commandService.loadCommands();
        const tree = commandService.getCommands();

        // Should not append, but overwrite
        expect(tree.length).toBe(subCommandLen);
      });
    });

    describe('getCommandTree', () => {
      it('should return the current command tree', async () => {
        const initialTree = commandService.getCommands();
        expect(initialTree).toEqual([]);

        await commandService.loadCommands();

        const loadedTree = commandService.getCommands();
        expect(loadedTree.length).toBe(subCommandLen);
        expect(loadedTree).toEqual([
          aboutCommand,
          authCommand,
          bugCommand,
          chatCommand,
          clearCommand,
          compressCommand,
          corgiCommand,
          docsCommand,
          editorCommand,
          extensionsCommand,
          helpCommand,
          mcpCommand,
          memoryCommand,
          privacyCommand,
          quitCommand,
          statsCommand,
          themeCommand,
          toolsCommand,
        ]);
      });
    });
  });

  describe('when initialized with an injected loader function', () => {
    it('should use the provided loader instead of the built-in one', async () => {
      // Arrange: Create a set of mock commands.
      const mockCommands: SlashCommand[] = [
        { name: 'injected-test-1', description: 'injected 1' },
        { name: 'injected-test-2', description: 'injected 2' },
      ];

      // Arrange: Create a mock loader FUNCTION that resolves with our mock commands.
      const mockLoader = vi.fn().mockResolvedValue(mockCommands);

      // Act: Instantiate the service WITH the injected loader function.
      const commandService = new CommandService(mockConfig, mockLoader);
      await commandService.loadCommands();
      const tree = commandService.getCommands();

      // Assert: The tree should contain ONLY our injected commands.
      expect(mockLoader).toHaveBeenCalled(); // Verify our mock loader was actually called.
      expect(tree.length).toBe(2);
      expect(tree).toEqual(mockCommands);

      const commandNames = tree.map((cmd) => cmd.name);
      expect(commandNames).not.toContain('memory'); // Verify it didn't load production commands.
    });
  });
});
