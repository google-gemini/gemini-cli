/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCompletion } from './useCompletion.js';
import {
  CommandContext,
  CommandKind,
  SlashCommand,
} from '../commands/types.js';
import {
  createTmpDir,
  cleanupTmpDir,
  FileSystemStructure,
} from '@google/gemini-cli-test-utils';

const mockCommandContext = {} as CommandContext;

const fileSystemStructure: FileSystemStructure = {
  'README.md': '# Test Project',
  src: {
    'index.ts': 'console.log("hello");',
    'App.tsx': '<App />',
    components: {
      'Button.tsx': '<button />',
      'Input.tsx': '<input />',
    },
  },
  // To be ignored by .gitignore
  node_modules: { react: '...' },
  dist: { 'bundle.js': '...' },
  coverage: { 'lcov.info': '...' },
  data: {
    logs: {
      'test.log': 'log data',
    },
  },
  // To be ignored by .geminiignore
  secrets: { 'api.key': '...' },
  temp_data: { 'temp.txt': '...' },
  // The ignore files themselves
  '.gitignore': ['node_modules/', 'dist/', '/coverage', '*.log'].join('\n'),
  '.geminiignore': ['secrets/', 'temp_data/'].join('\n'),
};

describe('useCompletion integration with FileSearch', () => {
  let testCwd: string;

  // We are not testing slash commands here, so a minimal mock is fine.
  const mockSlashCommands: SlashCommand[] = [
    {
      name: 'help',
      description: 'Show help',
      kind: CommandKind.BUILT_IN,
      action: vi.fn(),
    },
  ];

  beforeAll(async () => {
    testCwd = await createTmpDir(fileSystemStructure);
  });

  afterAll(async () => {
    await cleanupTmpDir(testCwd);
  });

  it('should provide basic completion for a nested file', async () => {
    const { result } = renderHook(() =>
      useCompletion(
        '@src/App',
        testCwd,
        true,
        mockSlashCommands,
        mockCommandContext,
      ),
    );

    await waitFor(() => {
      const labels = result.current.suggestions.map((s) => s.label);
      expect(labels).toEqual(['src/App.tsx']);
    });
  });

  it('should respect .gitignore and not suggest ignored files', async () => {
    const { result } = renderHook(() =>
      useCompletion(
        '@data/logs/t',
        testCwd,
        true,
        mockSlashCommands,
        mockCommandContext,
      ),
    );

    await waitFor(() => {
      expect(result.current.isLoadingSuggestions).toBe(false);
    });

    const labels = result.current.suggestions.map((s) => s.label);
    expect(labels).toEqual([]);
  });

  it('should respect .gitignore and not suggest ignored directories', async () => {
    const { result } = renderHook(() =>
      useCompletion(
        '@di',
        testCwd,
        true,
        mockSlashCommands,
        mockCommandContext,
      ),
    );

    await waitFor(() => {
      expect(result.current.isLoadingSuggestions).toBe(false);
    });

    const labels = result.current.suggestions.map((s) => s.label);
    expect(labels).toEqual([]);
  });

  it('should respect .geminiignore and not suggest ignored directories', async () => {
    const { result } = renderHook(() =>
      useCompletion(
        '@sec',
        testCwd,
        true,
        mockSlashCommands,
        mockCommandContext,
      ),
    );

    await waitFor(() => {
      expect(result.current.isLoadingSuggestions).toBe(false);
    });

    const labels = result.current.suggestions.map((s) => s.label);
    expect(labels).toEqual([]);
  });

  it('should provide suggestions for the root directory', async () => {
    const { result } = renderHook(() =>
      useCompletion('@', testCwd, true, mockSlashCommands, mockCommandContext),
    );

    await waitFor(() => {
      expect(result.current.suggestions.length).toBeGreaterThan(0);
    });

    const labels = result.current.suggestions.map((s) => s.label);
    // Directories come first, then files, sorted alphabetically.
    expect(labels).toEqual([
      'data/',
      'data/logs/',
      'src/',
      'src/components/',
      '.geminiignore',
      '.gitignore',
      'README.md',
      'src/App.tsx',
    ]);
  });

  it('should show no suggestions for a nonexistent file', async () => {
    const { result } = renderHook(() =>
      useCompletion(
        '@nonexistent',
        testCwd,
        true,
        mockSlashCommands,
        mockCommandContext,
      ),
    );

    await waitFor(() => {
      expect(result.current.isLoadingSuggestions).toBe(false);
    });

    expect(result.current.suggestions).toEqual([]);
  });
});

describe('useCompletion slash commands', () => {
  const mockSlashCommands: SlashCommand[] = [
    {
      name: 'help',
      altNames: ['?'],
      description: 'Show help',
      action: vi.fn(),
      kind: CommandKind.BUILT_IN,
    },
    {
      name: 'stats',
      altNames: ['usage'],
      description: 'check session stats. Usage: /stats [model|tools]',
      action: vi.fn(),
      kind: CommandKind.BUILT_IN,
    },
    {
      name: 'clear',
      description: 'Clear the screen',
      action: vi.fn(),
      kind: CommandKind.BUILT_IN,
    },
    {
      name: 'memory',
      description: 'Manage memory',
      kind: CommandKind.BUILT_IN,
      // This command is a parent, no action.
      subCommands: [
        {
          name: 'show',
          description: 'Show memory',
          kind: CommandKind.BUILT_IN,
          action: vi.fn(),
        },
        {
          name: 'add',
          description: 'Add to memory',
          kind: CommandKind.BUILT_IN,
          action: vi.fn(),
        },
      ],
    },
    {
      name: 'chat',
      description: 'Manage chat history',
      kind: CommandKind.BUILT_IN,
      subCommands: [
        {
          name: 'save',
          description: 'Save chat',
          kind: CommandKind.BUILT_IN,
          action: vi.fn(),
        },
        {
          name: 'resume',
          description: 'Resume a saved chat',
          kind: CommandKind.BUILT_IN,
          action: vi.fn(),
          // This command provides its own argument completions
          completion: vi
            .fn()
            .mockResolvedValue([
              'my-chat-tag-1',
              'my-chat-tag-2',
              'my-channel',
            ]),
        },
      ],
    },
  ];

  it('should suggest top-level command names based on partial input', async () => {
    const { result } = renderHook(() =>
      useCompletion(
        '/mem',
        '/test/cwd',
        true,
        mockSlashCommands,
        mockCommandContext,
      ),
    );

    await waitFor(() => {
      expect(result.current.suggestions).toEqual([
        { label: 'memory', value: 'memory', description: 'Manage memory' },
      ]);
      expect(result.current.showSuggestions).toBe(true);
    });
  });

  it.each([['/?'], ['/usage']])(
    'should not suggest commands when altNames is fully typed',
    async (altName) => {
      const { result } = renderHook(() =>
        useCompletion(
          altName,
          '/test/cwd',
          true,
          mockSlashCommands,
          mockCommandContext,
        ),
      );

      await waitFor(() => {
        expect(result.current.suggestions).toHaveLength(0);
      });
    },
  );

  it('should suggest commands based on partial altNames matches', async () => {
    const { result } = renderHook(() =>
      useCompletion(
        '/usag', // part of the word "usage"
        '/test/cwd',
        true,
        mockSlashCommands,
        mockCommandContext,
      ),
    );

    await waitFor(() => {
      expect(result.current.suggestions).toEqual([
        {
          label: 'stats',
          value: 'stats',
          description: 'check session stats. Usage: /stats [model|tools]',
        },
      ]);
    });
  });

  it('should suggest sub-command names for a parent command', async () => {
    const { result } = renderHook(() =>
      useCompletion(
        '/memory a',
        '/test/cwd',
        true,
        mockSlashCommands,
        mockCommandContext,
      ),
    );

    await waitFor(() => {
      expect(result.current.suggestions).toEqual([
        { label: 'add', value: 'add', description: 'Add to memory' },
      ]);
    });
  });

  it('should suggest all sub-commands when the query ends with the parent command and a space', async () => {
    const { result } = renderHook(() =>
      useCompletion(
        '/memory ',
        '/test/cwd',
        true,
        mockSlashCommands,
        mockCommandContext,
      ),
    );

    await waitFor(() => {
      expect(result.current.suggestions).toHaveLength(2);
      expect(result.current.suggestions).toEqual(
        expect.arrayContaining([
          { label: 'show', value: 'show', description: 'Show memory' },
          { label: 'add', value: 'add', description: 'Add to memory' },
        ]),
      );
    });
  });

  it('should call the command.completion function for argument suggestions', async () => {
    const availableTags = ['my-chat-tag-1', 'my-chat-tag-2', 'another-channel'];
    const mockCompletionFn = vi
      .fn()
      .mockImplementation(async (context: CommandContext, partialArg: string) =>
        availableTags.filter((tag) => tag.startsWith(partialArg)),
      );

    const mockCommandsWithFiltering = JSON.parse(
      JSON.stringify(mockSlashCommands),
    ) as SlashCommand[];

    const chatCmd = mockCommandsWithFiltering.find(
      (cmd) => cmd.name === 'chat',
    );
    if (!chatCmd || !chatCmd.subCommands) {
      throw new Error(
        "Test setup error: Could not find the 'chat' command with subCommands in the mock data.",
      );
    }

    const resumeCmd = chatCmd.subCommands.find((sc) => sc.name === 'resume');
    if (!resumeCmd) {
      throw new Error(
        "Test setup error: Could not find the 'resume' sub-command in the mock data.",
      );
    }

    resumeCmd.completion = mockCompletionFn;

    const { result } = renderHook(() =>
      useCompletion(
        '/chat resume my-ch',
        '/test/cwd',
        true,
        mockCommandsWithFiltering,
        mockCommandContext,
      ),
    );

    await waitFor(() => {
      expect(mockCompletionFn).toHaveBeenCalledWith(
        mockCommandContext,
        'my-ch',
      );

      expect(result.current.suggestions).toEqual([
        { label: 'my-chat-tag-1', value: 'my-chat-tag-1' },
        { label: 'my-chat-tag-2', value: 'my-chat-tag-2' },
      ]);
    });
  });

  it('should not provide suggestions for a fully typed command that has no sub-commands or argument completion', async () => {
    const { result } = renderHook(() =>
      useCompletion(
        '/clear ',
        '/test/cwd',
        true,
        mockSlashCommands,
        mockCommandContext,
      ),
    );

    await waitFor(() => {
      expect(result.current.suggestions).toHaveLength(0);
      expect(result.current.showSuggestions).toBe(false);
    });
  });

  it('should not provide suggestions for an unknown command', async () => {
    const { result } = renderHook(() =>
      useCompletion(
        '/unknown-command',
        '/test/cwd',
        true,
        mockSlashCommands,
        mockCommandContext,
      ),
    );

    await waitFor(() => {
      expect(result.current.suggestions).toHaveLength(0);
      expect(result.current.showSuggestions).toBe(false);
    });
  });

  it('should suggest sub-commands for a fully typed parent command without a trailing space', async () => {
    const { result } = renderHook(() =>
      useCompletion(
        '/memory', // Note: no trailing space
        '/test/cwd',
        true,
        mockSlashCommands,
        mockCommandContext,
      ),
    );

    await waitFor(() => {
      // Assert that suggestions for sub-commands are shown immediately
      expect(result.current.suggestions).toHaveLength(2);
      expect(result.current.suggestions).toEqual(
        expect.arrayContaining([
          { label: 'show', value: 'show', description: 'Show memory' },
          { label: 'add', value: 'add', description: 'Add to memory' },
        ]),
      );
      expect(result.current.showSuggestions).toBe(true);
    });
  });

  it('should NOT provide suggestions for a perfectly typed command that is a leaf node', async () => {
    const { result } = renderHook(() =>
      useCompletion(
        '/clear', // No trailing space
        '/test/cwd',
        true,
        mockSlashCommands,
        mockCommandContext,
      ),
    );

    await waitFor(() => {
      expect(result.current.suggestions).toHaveLength(0);
      expect(result.current.showSuggestions).toBe(false);
    });
  });

  it('should call command.completion with an empty string when args start with a space', async () => {
    const mockCompletionFn = vi
      .fn()
      .mockResolvedValue(['my-chat-tag-1', 'my-chat-tag-2', 'my-channel']);

    const isolatedMockCommands = JSON.parse(
      JSON.stringify(mockSlashCommands),
    ) as SlashCommand[];

    const resumeCommand = isolatedMockCommands
      .find((cmd) => cmd.name === 'chat')
      ?.subCommands?.find((cmd) => cmd.name === 'resume');

    if (!resumeCommand) {
      throw new Error(
        'Test setup failed: could not find resume command in mock',
      );
    }
    resumeCommand.completion = mockCompletionFn;

    const { result } = renderHook(() =>
      useCompletion(
        '/chat resume ', // Trailing space, no partial argument
        '/test/cwd',
        true,
        isolatedMockCommands,
        mockCommandContext,
      ),
    );

    await waitFor(() => {
      expect(mockCompletionFn).toHaveBeenCalledWith(mockCommandContext, '');
      expect(result.current.suggestions).toHaveLength(3);
      expect(result.current.showSuggestions).toBe(true);
    });
  });

  it('should suggest all top-level commands for the root slash', async () => {
    const { result } = renderHook(() =>
      useCompletion(
        '/',
        '/test/cwd',
        true,
        mockSlashCommands,
        mockCommandContext,
      ),
    );

    await waitFor(() => {
      expect(result.current.suggestions.length).toBe(mockSlashCommands.length);
      expect(result.current.suggestions.map((s) => s.label)).toEqual(
        expect.arrayContaining(['help', 'clear', 'memory', 'chat', 'stats']),
      );
    });
  });

  it('should provide no suggestions for an invalid sub-command', async () => {
    const { result } = renderHook(() =>
      useCompletion(
        '/memory dothisnow',
        '/test/cwd',
        true,
        mockSlashCommands,
        mockCommandContext,
      ),
    );

    await waitFor(() => {
      expect(result.current.suggestions).toHaveLength(0);
      expect(result.current.showSuggestions).toBe(false);
    });
  });
});
