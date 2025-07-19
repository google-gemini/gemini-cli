/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CommandService } from './CommandService.js';
import { type ICommandLoader } from './types.js';
import { type SlashCommand } from '../ui/commands/types.js';
<<<<<<< HEAD
import { memoryCommand } from '../ui/commands/memoryCommand.js';
import { helpCommand } from '../ui/commands/helpCommand.js';
import { clearCommand } from '../ui/commands/clearCommand.js';
import { copyCommand } from '../ui/commands/copyCommand.js';
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
vi.mock('../ui/commands/copyCommand.js', () => ({
  copyCommand: { name: 'copy', description: 'Mock Copy' },
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
  const subCommandLen = 19;
  let mockConfig: Mocked<Config>;

=======

const createMockCommand = (
  name: string,
  source: 'built-in' | 'file',
): SlashCommand => ({
  name,
  description: `Description for ${name}`,
  metadata: {
    source,
    behavior: 'Custom',
  },
  action: vi.fn(),
});

const mockCommandA = createMockCommand('command-a', 'built-in');
const mockCommandB = createMockCommand('command-b', 'built-in');
const mockCommandC = createMockCommand('command-c', 'file');
const mockCommandB_Override = createMockCommand('command-b', 'file');

class MockCommandLoader implements ICommandLoader {
  private commandsToLoad: SlashCommand[];

  constructor(commandsToLoad: SlashCommand[]) {
    this.commandsToLoad = commandsToLoad;
  }

  loadCommands = vi.fn(
    async (): Promise<SlashCommand[]> => Promise.resolve(this.commandsToLoad),
  );
}

describe('CommandService', () => {
>>>>>>> 3d81bcd6 ((prefactor): Use loader system for slash commands)
  beforeEach(() => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

<<<<<<< HEAD
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
        expect(commandNames).toContain('copy');
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
          copyCommand,
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
=======
  afterEach(() => {
    vi.restoreAllMocks();
>>>>>>> 3d81bcd6 ((prefactor): Use loader system for slash commands)
  });

  it('should load commands from a single loader', async () => {
    const mockLoader = new MockCommandLoader([mockCommandA, mockCommandB]);
    const service = await CommandService.create([mockLoader]);

    const commands = service.getCommands();

    expect(mockLoader.loadCommands).toHaveBeenCalledTimes(1);
    expect(commands).toHaveLength(2);
    expect(commands).toEqual(
      expect.arrayContaining([mockCommandA, mockCommandB]),
    );
  });

  it('should aggregate commands from multiple loaders', async () => {
    const loader1 = new MockCommandLoader([mockCommandA]);
    const loader2 = new MockCommandLoader([mockCommandC]);
    const service = await CommandService.create([loader1, loader2]);

    const commands = service.getCommands();

    expect(loader1.loadCommands).toHaveBeenCalledTimes(1);
    expect(loader2.loadCommands).toHaveBeenCalledTimes(1);
    expect(commands).toHaveLength(2);
    expect(commands).toEqual(
      expect.arrayContaining([mockCommandA, mockCommandC]),
    );
  });

  it('should override commands from earlier loaders with those from later loaders', async () => {
    const loader1 = new MockCommandLoader([mockCommandA, mockCommandB]);
    const loader2 = new MockCommandLoader([
      mockCommandB_Override,
      mockCommandC,
    ]);
    const service = await CommandService.create([loader1, loader2]);

    const commands = service.getCommands();

    expect(commands).toHaveLength(3); // Should be A, C, and the overridden B.

    // The final list should contain the override from the *last* loader.
    const commandB = commands.find((cmd) => cmd.name === 'command-b');
    expect(commandB).toBeDefined();
    expect(commandB?.metadata.source).toBe('file'); // Verify it's the overridden version.
    expect(commandB).toEqual(mockCommandB_Override);

    // Ensure the other commands are still present.
    expect(commands).toEqual(
      expect.arrayContaining([
        mockCommandA,
        mockCommandC,
        mockCommandB_Override,
      ]),
    );
  });

  it('should handle loaders that return an empty array of commands gracefully', async () => {
    const loader1 = new MockCommandLoader([mockCommandA]);
    const emptyLoader = new MockCommandLoader([]);
    const loader3 = new MockCommandLoader([mockCommandB]);
    const service = await CommandService.create([
      loader1,
      emptyLoader,
      loader3,
    ]);

    const commands = service.getCommands();

    expect(emptyLoader.loadCommands).toHaveBeenCalledTimes(1);
    expect(commands).toHaveLength(2);
    expect(commands).toEqual(
      expect.arrayContaining([mockCommandA, mockCommandB]),
    );
  });

  it('should load commands from successful loaders even if one fails', async () => {
    const successfulLoader = new MockCommandLoader([mockCommandA]);
    const failingLoader = new MockCommandLoader([]);
    const error = new Error('Loader failed');
    vi.spyOn(failingLoader, 'loadCommands').mockRejectedValue(error);

    const service = await CommandService.create([
      successfulLoader,
      failingLoader,
    ]);

    const commands = service.getCommands();
    expect(commands).toHaveLength(1);
    expect(commands).toEqual([mockCommandA]);
    expect(console.debug).toHaveBeenCalledWith(
      'A command loader failed:',
      error,
    );
  });

  it('getCommands should return a readonly array that cannot be mutated', async () => {
    const service = await CommandService.create([
      new MockCommandLoader([mockCommandA]),
    ]);

    const commands = service.getCommands();

    // Expect it to throw a TypeError at runtime because the array is frozen.
    expect(() => {
      // @ts-expect-error - Testing immutability is intentional here.
      commands.push(mockCommandB);
    }).toThrow();

    // Verify the original array was not mutated.
    expect(service.getCommands()).toHaveLength(1);
  });

  it('should pass the abort signal to all loaders', async () => {
    const controller = new AbortController();
    const signal = controller.signal;

    const loader1 = new MockCommandLoader([mockCommandA]);
    const loader2 = new MockCommandLoader([mockCommandB]);

    await CommandService.create([loader1, loader2], signal);

    expect(loader1.loadCommands).toHaveBeenCalledTimes(1);
    expect(loader1.loadCommands).toHaveBeenCalledWith(signal);
    expect(loader2.loadCommands).toHaveBeenCalledTimes(1);
    expect(loader2.loadCommands).toHaveBeenCalledWith(signal);
  });
});
