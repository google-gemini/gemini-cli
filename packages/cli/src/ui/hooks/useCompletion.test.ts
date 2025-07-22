/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** @vitest-environment jsdom */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mocked } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCompletion } from './useCompletion.js';

import {
  CommandContext,
  CommandKind,
  SlashCommand,
} from '../commands/types.js';
import { Config, FileSearch, AbortError } from '@google/gemini-cli-core';

// Mock dependencies
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    FileSearch: vi.fn(),
    AbortError: class AbortError extends Error {
      constructor(message = 'Search aborted') {
        super(message);
        this.name = 'AbortError';
      }
    },
  };
});

const mockFileSearchInstance = {
  initialize: vi.fn(),
  search: vi.fn(),
};

describe('useCompletion', () => {
  let mockConfig: Mocked<Config>;
  let mockCommandContext: CommandContext;
  let mockSlashCommands: SlashCommand[];

  const testCwd = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(FileSearch).mockImplementation(
      () => mockFileSearchInstance as unknown as FileSearch,
    );

    mockFileSearchInstance.initialize.mockResolvedValue(undefined);
    mockFileSearchInstance.search.mockResolvedValue([]);

    mockConfig = {
      getTargetDir: vi.fn(() => testCwd),
    } as unknown as Mocked<Config>;

    mockCommandContext = {} as CommandContext;

    mockSlashCommands = [
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
            completion: vi.fn().mockResolvedValue(['chat1', 'chat2']),
          },
        ],
      },
    ];
  });

  describe('Hook initialization and state', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '',
          testCwd,
          false,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions).toEqual([]);
      expect(result.current.activeSuggestionIndex).toBe(-1);
      expect(result.current.visibleStartIndex).toBe(0);
      expect(result.current.showSuggestions).toBe(false);
      expect(result.current.isLoadingSuggestions).toBe(false);
    });

    it('should reset state when isActive becomes false', () => {
      const { result, rerender } = renderHook(
        ({ isActive }) =>
          useCompletion(
            '/help',
            testCwd,
            isActive,
            mockSlashCommands,
            mockCommandContext,
            mockConfig,
          ),
        { initialProps: { isActive: true } },
      );

      rerender({ isActive: false });

      expect(result.current.suggestions).toEqual([]);
      expect(result.current.activeSuggestionIndex).toBe(-1);
      expect(result.current.visibleStartIndex).toBe(0);
      expect(result.current.showSuggestions).toBe(false);
      expect(result.current.isLoadingSuggestions).toBe(false);
    });

    it('should provide required functions', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(typeof result.current.setActiveSuggestionIndex).toBe('function');
      expect(typeof result.current.setShowSuggestions).toBe('function');
      expect(typeof result.current.resetCompletionState).toBe('function');
      expect(typeof result.current.navigateUp).toBe('function');
      expect(typeof result.current.navigateDown).toBe('function');
    });
  });

  describe('resetCompletionState', () => {
    it('should reset all state to default values', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '/help',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      act(() => {
        result.current.setActiveSuggestionIndex(5);
        result.current.setShowSuggestions(true);
      });

      act(() => {
        result.current.resetCompletionState();
      });

      expect(result.current.suggestions).toEqual([]);
      expect(result.current.activeSuggestionIndex).toBe(-1);
      expect(result.current.visibleStartIndex).toBe(0);
      expect(result.current.showSuggestions).toBe(false);
      expect(result.current.isLoadingSuggestions).toBe(false);
    });
  });

  describe('Navigation functions', () => {
    it('should handle navigateUp with no suggestions', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      act(() => {
        result.current.navigateUp();
      });

      expect(result.current.activeSuggestionIndex).toBe(-1);
    });

    it('should handle navigateDown with no suggestions', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      act(() => {
        result.current.navigateDown();
      });

      expect(result.current.activeSuggestionIndex).toBe(-1);
    });

    it('should navigate up through suggestions with wrap-around', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '/h',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions.length).toBe(1);
      expect(result.current.activeSuggestionIndex).toBe(0);

      act(() => {
        result.current.navigateUp();
      });

      expect(result.current.activeSuggestionIndex).toBe(0);
    });

    it('should navigate down through suggestions with wrap-around', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '/h',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions.length).toBe(1);
      expect(result.current.activeSuggestionIndex).toBe(0);

      act(() => {
        result.current.navigateDown();
      });

      expect(result.current.activeSuggestionIndex).toBe(0);
    });

    it('should handle navigation with multiple suggestions', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '/',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions.length).toBe(5);
      expect(result.current.activeSuggestionIndex).toBe(0);

      act(() => {
        result.current.navigateDown();
      });
      expect(result.current.activeSuggestionIndex).toBe(1);

      act(() => {
        result.current.navigateDown();
      });
      expect(result.current.activeSuggestionIndex).toBe(2);

      act(() => {
        result.current.navigateUp();
      });
      expect(result.current.activeSuggestionIndex).toBe(1);

      act(() => {
        result.current.navigateUp();
      });
      expect(result.current.activeSuggestionIndex).toBe(0);

      act(() => {
        result.current.navigateUp();
      });
      expect(result.current.activeSuggestionIndex).toBe(4);
    });

    it('should handle navigation with large suggestion lists and scrolling', () => {
      const largeMockCommands = Array.from({ length: 15 }, (_, i) => ({
        name: `command${i}`,
        description: `Command ${i}`,
        kind: CommandKind.BUILT_IN,
        action: vi.fn(),
      }));

      const { result } = renderHook(() =>
        useCompletion(
          '/command',
          testCwd,
          true,
          largeMockCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions.length).toBe(15);
      expect(result.current.activeSuggestionIndex).toBe(0);
      expect(result.current.visibleStartIndex).toBe(0);

      act(() => {
        result.current.navigateUp();
      });

      expect(result.current.activeSuggestionIndex).toBe(14);
      expect(result.current.visibleStartIndex).toBe(Math.max(0, 15 - 8));
    });
  });

  describe('Slash command completion', () => {
    it('should show all commands for root slash', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '/',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions).toHaveLength(5);
      expect(result.current.suggestions.map((s) => s.label)).toEqual(
        expect.arrayContaining(['help', 'clear', 'memory', 'chat', 'stats']),
      );
      expect(result.current.showSuggestions).toBe(true);
      expect(result.current.activeSuggestionIndex).toBe(0);
    });

    it('should filter commands by prefix', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '/h',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions).toHaveLength(1);
      expect(result.current.suggestions[0].label).toBe('help');
      expect(result.current.suggestions[0].description).toBe('Show help');
    });

    it.each([['/?'], ['/usage']])(
      'should not suggest commands when altNames is fully typed',
      (altName) => {
        const { result } = renderHook(() =>
          useCompletion(
            altName,
            testCwd,
            true,
            mockSlashCommands,
            mockCommandContext,
            mockConfig,
          ),
        );

        expect(result.current.suggestions).toHaveLength(0);
      },
    );

    it('should suggest commands based on partial altNames matches', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '/usag', // part of the word "usage"
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions).toHaveLength(1);
      expect(result.current.suggestions[0].label).toBe('stats');
    });

    it('should not show suggestions for exact leaf command match', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '/clear',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions).toHaveLength(0);
      expect(result.current.showSuggestions).toBe(false);
    });

    it('should show sub-commands for parent commands', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '/memory',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions).toHaveLength(2);
      expect(result.current.suggestions.map((s) => s.label)).toEqual(
        expect.arrayContaining(['show', 'add']),
      );
    });

    it('should show all sub-commands after parent command with space', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '/memory ',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions).toHaveLength(2);
      expect(result.current.suggestions.map((s) => s.label)).toEqual(
        expect.arrayContaining(['show', 'add']),
      );
    });

    it('should filter sub-commands by prefix', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '/memory a',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions).toHaveLength(1);
      expect(result.current.suggestions[0].label).toBe('add');
    });

    it('should handle unknown command gracefully', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '/unknown',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions).toHaveLength(0);
      expect(result.current.showSuggestions).toBe(false);
    });
  });

  describe('Command argument completion', () => {
    it('should call completion function for command arguments', async () => {
      const completionFn = vi.fn().mockResolvedValue(['arg1', 'arg2']);
      const commandsWithCompletion = [...mockSlashCommands];
      const chatCommand = commandsWithCompletion.find(
        (cmd) => cmd.name === 'chat',
      );
      const resumeCommand = chatCommand?.subCommands?.find(
        (cmd) => cmd.name === 'resume',
      );
      if (resumeCommand) {
        resumeCommand.completion = completionFn;
      }

      const { result } = renderHook(() =>
        useCompletion(
          '/chat resume ',
          testCwd,
          true,
          commandsWithCompletion,
          mockCommandContext,
          mockConfig,
        ),
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      expect(completionFn).toHaveBeenCalledWith(mockCommandContext, '');
      expect(result.current.suggestions).toHaveLength(2);
      expect(result.current.suggestions.map((s) => s.label)).toEqual([
        'arg1',
        'arg2',
      ]);
    });

    it('should call completion function with partial argument', async () => {
      const completionFn = vi.fn().mockResolvedValue(['arg1', 'arg2']);
      const commandsWithCompletion = [...mockSlashCommands];
      const chatCommand = commandsWithCompletion.find(
        (cmd) => cmd.name === 'chat',
      );
      const resumeCommand = chatCommand?.subCommands?.find(
        (cmd) => cmd.name === 'resume',
      );
      if (resumeCommand) {
        resumeCommand.completion = completionFn;
      }

      renderHook(() =>
        useCompletion(
          '/chat resume ar',
          testCwd,
          true,
          commandsWithCompletion,
          mockCommandContext,
          mockConfig,
        ),
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      expect(completionFn).toHaveBeenCalledWith(mockCommandContext, 'ar');
    });

    it('should handle completion function that returns null', async () => {
      const completionFn = vi.fn().mockResolvedValue(null);
      const commandsWithCompletion = [...mockSlashCommands];
      const chatCommand = commandsWithCompletion.find(
        (cmd) => cmd.name === 'chat',
      );
      const resumeCommand = chatCommand?.subCommands?.find(
        (cmd) => cmd.name === 'resume',
      );
      if (resumeCommand) {
        resumeCommand.completion = completionFn;
      }

      const { result } = renderHook(() =>
        useCompletion(
          '/chat resume ',
          testCwd,
          true,
          commandsWithCompletion,
          mockCommandContext,
          mockConfig,
        ),
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      expect(result.current.suggestions).toHaveLength(0);
      expect(result.current.showSuggestions).toBe(false);
    });
  });

  describe('Slash command completion with namespaced names', () => {
    let commandsWithNamespaces: SlashCommand[];

    beforeEach(() => {
      commandsWithNamespaces = [
        ...mockSlashCommands,
        {
          name: 'git:commit',
          description: 'A namespaced git command',
          kind: CommandKind.FILE,
          action: vi.fn(),
        },
        {
          name: 'git:push',
          description: 'Another namespaced git command',
          kind: CommandKind.FILE,
          action: vi.fn(),
        },
        {
          name: 'docker:build',
          description: 'A docker command',
          kind: CommandKind.FILE,
          action: vi.fn(),
        },
      ];
    });

    it('should suggest a namespaced command based on a partial match', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '/git:co',
          testCwd,
          true,
          commandsWithNamespaces,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions).toHaveLength(1);
      expect(result.current.suggestions[0].label).toBe('git:commit');
    });

    it('should suggest all commands within a namespace when the namespace prefix is typed', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '/git:',
          testCwd,
          true,
          commandsWithNamespaces,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions).toHaveLength(2);
      expect(result.current.suggestions.map((s) => s.label)).toEqual(
        expect.arrayContaining(['git:commit', 'git:push']),
      );

      expect(result.current.suggestions.map((s) => s.label)).not.toContain(
        'docker:build',
      );
    });

    it('should not provide suggestions if the namespaced command is a perfect leaf match', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '/git:commit',
          testCwd,
          true,
          commandsWithNamespaces,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.showSuggestions).toBe(false);
      expect(result.current.suggestions).toHaveLength(0);
    });
  });

  describe('Query handling edge cases', () => {
    it('should handle empty query', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions).toHaveLength(0);
      expect(result.current.showSuggestions).toBe(false);
    });

    it('should handle query without slash or @', () => {
      const { result } = renderHook(() =>
        useCompletion(
          'regular text',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions).toHaveLength(0);
      expect(result.current.showSuggestions).toBe(false);
    });

    it('should handle query with whitespace', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '   /hel',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions).toHaveLength(1);
      expect(result.current.suggestions[0].label).toBe('help');
    });
  });

  describe('File path completion (@-syntax)', () => {
    let initializePromise: Promise<void>;
    let initializeResolve: () => void;
    let searchPromise: Promise<string[]>;
    let searchResolve: (value: string[]) => void;
    let searchReject: (reason?: unknown) => void;

    beforeEach(() => {
      // Reset the mock instance before each test
      vi.mocked(mockFileSearchInstance.initialize).mockClear();
      vi.mocked(mockFileSearchInstance.search).mockClear();

      initializePromise = new Promise((resolve) => {
        initializeResolve = resolve;
      });
      mockFileSearchInstance.initialize.mockReturnValue(initializePromise);

      searchPromise = new Promise((resolve, reject) => {
        searchResolve = resolve;
        searchReject = reject;
      });
      mockFileSearchInstance.search.mockReturnValue(searchPromise);
    });

    it('should initialize FileSearch and show loading state', async () => {
      const { result } = renderHook(() =>
        useCompletion(
          '@file',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(FileSearch).toHaveBeenCalledWith({
        projectRoot: testCwd,
        ignoreDirs: [],
        useGitignore: true,
        useGeminiignore: true,
        cache: true,
        cacheTtl: 30,
      });
      expect(mockFileSearchInstance.initialize).toHaveBeenCalled();
      // It's loading because the initialize promise hasn't resolved.
      expect(result.current.isLoadingSuggestions).toBe(true);

      await act(async () => {
        initializeResolve();
        await initializePromise;
      });

      // Now it's loading because the search promise hasn't resolved.
      expect(mockFileSearchInstance.search).toHaveBeenCalledWith('file', {
        signal: expect.any(AbortSignal),
        maxResults: 8,
      });
      expect(result.current.isLoadingSuggestions).toBe(true);
    });

    it('should display suggestions after search completes', async () => {
      const { result } = renderHook(() =>
        useCompletion(
          '@file',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      await act(async () => {
        initializeResolve();
        await initializePromise;
        searchResolve(['file1.txt', 'file2.js']);
        await searchPromise;
      });

      expect(result.current.isLoadingSuggestions).toBe(false);
      expect(result.current.suggestions).toHaveLength(2);
      expect(result.current.suggestions.map((s) => s.label)).toEqual([
        'file1.txt',
        'file2.js',
      ]);
      expect(result.current.showSuggestions).toBe(true);
    });

    it('should queue a search if the engine is still initializing', async () => {
      const { rerender } = renderHook(
        ({ query }) =>
          useCompletion(
            query,
            testCwd,
            true,
            mockSlashCommands,
            mockCommandContext,
            mockConfig,
          ),
        { initialProps: { query: '@fi' } },
      );

      // Engine is still initializing, so search should not be called yet
      expect(mockFileSearchInstance.search).not.toHaveBeenCalled();

      // User types more characters
      rerender({ query: '@file' });

      expect(mockFileSearchInstance.search).not.toHaveBeenCalled();

      // Now, let the initialization finish
      await act(async () => {
        initializeResolve();
        await initializePromise;
      });

      // The hook should now execute the *latest* search query
      expect(mockFileSearchInstance.search).toHaveBeenCalledTimes(1);
      expect(mockFileSearchInstance.search).toHaveBeenCalledWith('file', {
        signal: expect.any(AbortSignal),
        maxResults: 8,
      });
    });

    it('should abort the previous search when the query changes', async () => {
      const abortSpy = vi.spyOn(AbortController.prototype, 'abort');

      const { rerender } = renderHook(
        ({ query }) =>
          useCompletion(
            query,
            testCwd,
            true,
            mockSlashCommands,
            mockCommandContext,
            mockConfig,
          ),
        { initialProps: { query: '@file' } },
      );

      await act(async () => {
        initializeResolve();
        await initializePromise;
      });

      expect(mockFileSearchInstance.search).toHaveBeenCalledTimes(1);

      // Change the query, which should trigger a new search and abort the old one
      rerender({ query: '@file-new' });

      expect(abortSpy).toHaveBeenCalledTimes(1);
      expect(mockFileSearchInstance.search).toHaveBeenCalledTimes(2);
      expect(mockFileSearchInstance.search).toHaveBeenCalledWith('file-new', {
        signal: expect.any(AbortSignal),
        maxResults: 8,
      });

      abortSpy.mockRestore();
    });

    it('should handle AbortError gracefully', async () => {
      const { result } = renderHook(() =>
        useCompletion(
          '@file',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      await act(async () => {
        initializeResolve();
        await initializePromise;
        searchReject(new AbortError());
        try {
          await searchPromise;
        } catch (_e) {
          // ignore
        }
      });

      // State should not have changed, no suggestions, loading is false
      expect(result.current.isLoadingSuggestions).toBe(false);
      expect(result.current.suggestions).toHaveLength(0);
    });

    it('should abort the search when the hook becomes inactive', async () => {
      const abortSpy = vi.spyOn(AbortController.prototype, 'abort');

      const { unmount } = renderHook(() =>
        useCompletion(
          '@file',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      await act(async () => {
        initializeResolve();
        await initializePromise;
      });

      unmount();

      expect(abortSpy).toHaveBeenCalledTimes(1);
      abortSpy.mockRestore();
    });

    it('should handle @ at the end of query', async () => {
      mockFileSearchInstance.search.mockResolvedValue([
        'path/to/file.txt',
        'another/file.js',
      ]);

      const { result } = renderHook(() =>
        useCompletion(
          'some text @',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      await act(async () => {
        initializeResolve();
        await initializePromise;
        searchResolve(['path/to/file.txt', 'another/file.js']);
        await searchPromise;
      });

      expect(mockFileSearchInstance.search).toHaveBeenCalledWith('', {
        signal: expect.any(AbortSignal),
        maxResults: 8,
      });
      expect(result.current.isLoadingSuggestions).toBe(false);
      expect(result.current.suggestions).toHaveLength(2);
      expect(result.current.suggestions.map((s) => s.label)).toEqual([
        'path/to/file.txt',
        'another/file.js',
      ]);
      expect(result.current.showSuggestions).toBe(true);
    });
  });
});
