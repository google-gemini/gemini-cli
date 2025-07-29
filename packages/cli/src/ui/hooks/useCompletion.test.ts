/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** @vitest-environment jsdom */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCompletion } from './useCompletion.js';

import { CommandContext, SlashCommand } from '../commands/types.js';
import { useTextBuffer, TextBuffer } from '../components/shared/text-buffer.js';
import { Config, FileSearch, AbortError } from '@google/gemini-cli-core';

// Mock FileSearch
const mockInitialize = vi.fn();
const mockSearch = vi.fn();
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...original,
    FileSearch: vi.fn().mockImplementation(() => ({
      initialize: mockInitialize,
      search: mockSearch,
    })),
    AbortError: class AbortError extends Error {
      constructor(message?: string) {
        super(message);
        this.name = 'AbortError';
      }
    },
  };
});

describe('useCompletion', () => {
  // A minimal mock is sufficient for these tests.
  const mockCommandContext = {} as CommandContext;
  const testRootDir = 'test/root/dir';
  const mockConfig = {
    getFileFilteringOptions: () => ({
      respectGitIgnore: true,
      respectGeminiIgnore: true,
    }),
  } as unknown as Config;

  beforeEach(() => {
    vi.clearAllMocks();
    mockInitialize.mockResolvedValue(undefined);
    mockSearch.mockResolvedValue([]);
  });

  // Helper to create real TextBuffer objects within renderHook
  function useTextBufferForTest(text: string) {
    return useTextBuffer({
      initialText: text,
      initialCursorOffset: text.length,
      viewport: { width: 80, height: 20 },
      isValidPath: () => false,
      onChange: () => {},
    });
  }

  describe('Core Hook Behavior', () => {
    describe('State Management', () => {
      it('should initialize with default state', () => {
        const slashCommands = [
          { name: 'dummy', description: 'dummy' },
        ] as unknown as SlashCommand[];
        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest(''),
            testRootDir,
            slashCommands,
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
        const slashCommands = [
          {
            name: 'help',
            altNames: ['?'],
            description: 'Show help',
            action: vi.fn(),
          },
        ] as unknown as SlashCommand[];

        const { result, rerender } = renderHook(
          ({ text }) => {
            const textBuffer = useTextBufferForTest(text);
            return useCompletion(
              textBuffer,
              testRootDir,
              slashCommands,
              mockCommandContext,
              mockConfig,
            );
          },
          { initialProps: { text: '/help' } },
        );

        // Inactive because of the leading space
        rerender({ text: ' /help' });

        expect(result.current.suggestions).toEqual([]);
        expect(result.current.activeSuggestionIndex).toBe(-1);
        expect(result.current.visibleStartIndex).toBe(0);
        expect(result.current.showSuggestions).toBe(false);
        expect(result.current.isLoadingSuggestions).toBe(false);
      });

      it('should reset all state to default values', () => {
        const slashCommands = [
          {
            name: 'help',
            description: 'Show help',
          },
        ] as unknown as SlashCommand[];

        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest('/help'),
            testRootDir,
            slashCommands,
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

    describe('Navigation', () => {
      it('should handle navigateUp with no suggestions', () => {
        const slashCommands = [
          { name: 'dummy', description: 'dummy' },
        ] as unknown as SlashCommand[];
        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest(''),
            testRootDir,
            slashCommands,
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
        const slashCommands = [
          { name: 'dummy', description: 'dummy' },
        ] as unknown as SlashCommand[];
        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest(''),
            testRootDir,
            slashCommands,
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
        const slashCommands = [
          {
            name: 'help',
            description: 'Show help',
          },
        ] as unknown as SlashCommand[];
        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest('/h'),
            testRootDir,
            slashCommands,
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
        const slashCommands = [
          {
            name: 'help',
            description: 'Show help',
          },
        ] as unknown as SlashCommand[];
        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest('/h'),
            testRootDir,
            slashCommands,
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
        const slashCommands = [
          { name: 'help', description: 'Show help' },
          { name: 'stats', description: 'Show stats' },
          { name: 'clear', description: 'Clear screen' },
          { name: 'memory', description: 'Manage memory' },
          { name: 'chat', description: 'Manage chat' },
        ] as unknown as SlashCommand[];
        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest('/'),
            testRootDir,
            slashCommands,
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
        })) as unknown as SlashCommand[];

        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest('/command'),
            testRootDir,
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
  });

  describe('Slash Command Completion (`/`)', () => {
    describe('Top-Level Commands', () => {
      it('should suggest all top-level commands for the root slash', async () => {
        const slashCommands = [
          {
            name: 'help',
            altNames: ['?'],
            description: 'Show help',
          },
          {
            name: 'stats',
            altNames: ['usage'],
            description: 'check session stats. Usage: /stats [model|tools]',
          },
          {
            name: 'clear',
            description: 'Clear the screen',
          },
          {
            name: 'memory',
            description: 'Manage memory',
            subCommands: [
              {
                name: 'show',
                description: 'Show memory',
              },
            ],
          },
          {
            name: 'chat',
            description: 'Manage chat history',
          },
        ] as unknown as SlashCommand[];
        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest('/'),
            testRootDir,
            slashCommands,
            mockCommandContext,
          ),
        );

        expect(result.current.suggestions.length).toBe(slashCommands.length);
        expect(result.current.suggestions.map((s) => s.label)).toEqual(
          expect.arrayContaining(['help', 'clear', 'memory', 'chat', 'stats']),
        );
      });

      it('should filter commands based on partial input', async () => {
        const slashCommands = [
          {
            name: 'memory',
            description: 'Manage memory',
          },
        ] as unknown as SlashCommand[];
        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest('/mem'),
            testRootDir,
            slashCommands,
            mockCommandContext,
          ),
        );

        expect(result.current.suggestions).toEqual([
          { label: 'memory', value: 'memory', description: 'Manage memory' },
        ]);
        expect(result.current.showSuggestions).toBe(true);
      });

      it('should suggest commands based on partial altNames', async () => {
        const slashCommands = [
          {
            name: 'stats',
            altNames: ['usage'],
            description: 'check session stats. Usage: /stats [model|tools]',
          },
        ] as unknown as SlashCommand[];
        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest('/usag'), // part of the word "usage"
            testRootDir,
            slashCommands,
            mockCommandContext,
          ),
        );

        expect(result.current.suggestions).toEqual([
          {
            label: 'stats',
            value: 'stats',
            description: 'check session stats. Usage: /stats [model|tools]',
          },
        ]);
      });

      it('should NOT provide suggestions for a perfectly typed command that is a leaf node', async () => {
        const slashCommands = [
          {
            name: 'clear',
            description: 'Clear the screen',
            action: vi.fn(),
          },
        ] as unknown as SlashCommand[];
        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest('/clear'), // No trailing space
            testRootDir,
            slashCommands,
            mockCommandContext,
          ),
        );

        expect(result.current.suggestions).toHaveLength(0);
        expect(result.current.showSuggestions).toBe(false);
      });

      it.each([['/?'], ['/usage']])(
        'should not suggest commands when altNames is fully typed',
        async (query) => {
          const mockSlashCommands = [
            {
              name: 'help',
              altNames: ['?'],
              description: 'Show help',
              action: vi.fn(),
            },
            {
              name: 'stats',
              altNames: ['usage'],
              description: 'check session stats. Usage: /stats [model|tools]',
              action: vi.fn(),
            },
          ] as unknown as SlashCommand[];

          const { result } = renderHook(() =>
            useCompletion(
              useTextBufferForTest(query),
              testRootDir,
              mockSlashCommands,
              mockCommandContext,
            ),
          );

          expect(result.current.suggestions).toHaveLength(0);
        },
      );

      it('should not provide suggestions for a fully typed command that has no sub-commands or argument completion', async () => {
        const slashCommands = [
          {
            name: 'clear',
            description: 'Clear the screen',
          },
        ] as unknown as SlashCommand[];
        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest('/clear '),
            testRootDir,
            slashCommands,
            mockCommandContext,
          ),
        );

        expect(result.current.suggestions).toHaveLength(0);
        expect(result.current.showSuggestions).toBe(false);
      });

      it('should not provide suggestions for an unknown command', async () => {
        const slashCommands = [
          {
            name: 'help',
            description: 'Show help',
          },
        ] as unknown as SlashCommand[];
        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest('/unknown-command'),
            testRootDir,
            slashCommands,
            mockCommandContext,
          ),
        );

        expect(result.current.suggestions).toHaveLength(0);
        expect(result.current.showSuggestions).toBe(false);
      });
    });

    describe('Sub-Commands', () => {
      it('should suggest sub-commands for a parent command', async () => {
        const slashCommands = [
          {
            name: 'memory',
            description: 'Manage memory',
            subCommands: [
              {
                name: 'show',
                description: 'Show memory',
              },
              {
                name: 'add',
                description: 'Add to memory',
              },
            ],
          },
        ] as unknown as SlashCommand[];

        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest('/memory'), // Note: no trailing space
            testRootDir,
            slashCommands,
            mockCommandContext,
          ),
        );

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

      it('should suggest all sub-commands when the query ends with the parent command and a space', async () => {
        const slashCommands = [
          {
            name: 'memory',
            description: 'Manage memory',
            subCommands: [
              {
                name: 'show',
                description: 'Show memory',
              },
              {
                name: 'add',
                description: 'Add to memory',
              },
            ],
          },
        ] as unknown as SlashCommand[];
        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest('/memory'),
            testRootDir,
            slashCommands,
            mockCommandContext,
          ),
        );

        expect(result.current.suggestions).toHaveLength(2);
        expect(result.current.suggestions).toEqual(
          expect.arrayContaining([
            { label: 'show', value: 'show', description: 'Show memory' },
            { label: 'add', value: 'add', description: 'Add to memory' },
          ]),
        );
      });

      it('should filter sub-commands by prefix', async () => {
        const slashCommands = [
          {
            name: 'memory',
            description: 'Manage memory',
            subCommands: [
              {
                name: 'show',
                description: 'Show memory',
              },
              {
                name: 'add',
                description: 'Add to memory',
              },
            ],
          },
        ] as unknown as SlashCommand[];
        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest('/memory a'),
            testRootDir,
            slashCommands,
            mockCommandContext,
          ),
        );

        expect(result.current.suggestions).toEqual([
          { label: 'add', value: 'add', description: 'Add to memory' },
        ]);
      });

      it('should provide no suggestions for an invalid sub-command', async () => {
        const slashCommands = [
          {
            name: 'memory',
            description: 'Manage memory',
            subCommands: [
              {
                name: 'show',
                description: 'Show memory',
              },
              {
                name: 'add',
                description: 'Add to memory',
              },
            ],
          },
        ] as unknown as SlashCommand[];
        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest('/memory dothisnow'),
            testRootDir,
            slashCommands,
            mockCommandContext,
          ),
        );

        expect(result.current.suggestions).toHaveLength(0);
        expect(result.current.showSuggestions).toBe(false);
      });
    });

    describe('Argument Completion', () => {
      it('should call the command.completion function for argument suggestions', async () => {
        const availableTags = [
          'my-chat-tag-1',
          'my-chat-tag-2',
          'another-channel',
        ];
        const mockCompletionFn = vi
          .fn()
          .mockImplementation(
            async (_context: CommandContext, partialArg: string) =>
              availableTags.filter((tag) => tag.startsWith(partialArg)),
          );

        const slashCommands = [
          {
            name: 'chat',
            description: 'Manage chat history',
            subCommands: [
              {
                name: 'resume',
                description: 'Resume a saved chat',
                completion: mockCompletionFn,
              },
            ],
          },
        ] as unknown as SlashCommand[];

        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest('/chat resume my-ch'),
            testRootDir,
            slashCommands,
            mockCommandContext,
          ),
        );

        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 150));
        });

        expect(mockCompletionFn).toHaveBeenCalledWith(
          mockCommandContext,
          'my-ch',
        );

        expect(result.current.suggestions).toEqual([
          { label: 'my-chat-tag-1', value: 'my-chat-tag-1' },
          { label: 'my-chat-tag-2', value: 'my-chat-tag-2' },
        ]);
      });

      it('should call command.completion with an empty string when args start with a space', async () => {
        const mockCompletionFn = vi
          .fn()
          .mockResolvedValue(['my-chat-tag-1', 'my-chat-tag-2', 'my-channel']);

        const slashCommands = [
          {
            name: 'chat',
            description: 'Manage chat history',
            subCommands: [
              {
                name: 'resume',
                description: 'Resume a saved chat',
                completion: mockCompletionFn,
              },
            ],
          },
        ] as unknown as SlashCommand[];

        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest('/chat resume '),
            testRootDir,
            slashCommands,
            mockCommandContext,
          ),
        );

        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 150));
        });

        expect(mockCompletionFn).toHaveBeenCalledWith(mockCommandContext, '');
        expect(result.current.suggestions).toHaveLength(3);
        expect(result.current.showSuggestions).toBe(true);
      });

      it('should handle completion function that returns null', async () => {
        const completionFn = vi.fn().mockResolvedValue(null);
        const slashCommands = [
          {
            name: 'chat',
            description: 'Manage chat history',
            subCommands: [
              {
                name: 'resume',
                description: 'Resume a saved chat',
                completion: completionFn,
              },
            ],
          },
        ] as unknown as SlashCommand[];

        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest('/chat resume '),
            testRootDir,
            slashCommands,
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
  });

  describe('File path completion (`@`)', () => {
    it('should initialize FileSearch and show loading state', async () => {
      mockInitialize.mockResolvedValue(undefined);
      // Provide a mock implementation to prevent the unhandled error
      mockSearch.mockResolvedValue([]);
      const { result } = renderHook(() =>
        useCompletion(
          useTextBufferForTest('@'),
          testRootDir,
          [],
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.isLoadingSuggestions).toBe(true);
      expect(FileSearch).toHaveBeenCalledWith({
        projectRoot: testRootDir,
        ignoreDirs: [],
        useGitignore: true,
        useGeminiignore: true,
        cache: true,
        cacheTtl: 30,
      });

      await waitFor(() => {
        expect(result.current.isLoadingSuggestions).toBe(false);
      });
    });

    it('should display suggestions after search completes', async () => {
      mockInitialize.mockResolvedValue(undefined);
      mockSearch.mockResolvedValue(['file1.txt', 'file2.js']);

      const { result } = renderHook(() =>
        useCompletion(
          useTextBufferForTest('@f'),
          testRootDir,
          [],
          mockCommandContext,
          mockConfig,
        ),
      );

      await waitFor(() => {
        expect(result.current.isLoadingSuggestions).toBe(false);
      });

      expect(mockSearch).toHaveBeenCalledWith('f', {
        signal: expect.any(AbortSignal),
        maxResults: 24,
      });

      expect(result.current.suggestions).toEqual([
        { label: 'file1.txt', value: 'file1.txt' },
        { label: 'file2.js', value: 'file2.js' },
      ]);
      expect(result.current.showSuggestions).toBe(true);
    });

    it('should queue a search if the engine is still initializing', async () => {
      mockInitialize.mockReturnValue(new Promise(() => {})); // Never resolves

      const { result } = renderHook(() =>
        useCompletion(
          useTextBufferForTest('@'),
          testRootDir,
          [],
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.isLoadingSuggestions).toBe(true);
      expect(mockSearch).not.toHaveBeenCalled();
    });

    it('should abort the previous search when the query changes', async () => {
      const abortSpy = vi.spyOn(AbortController.prototype, 'abort');
      mockInitialize.mockResolvedValue(undefined);
      // Make the search promise never resolve so we can test the abort
      mockSearch.mockReturnValue(new Promise(() => {}));

      const { rerender, unmount } = renderHook(
        ({ text }) =>
          useCompletion(
            useTextBufferForTest(text),
            testRootDir,
            [],
            mockCommandContext,
            mockConfig,
          ),
        { initialProps: { text: '@a' } },
      );

      // Wait for initialization to complete and the first search to start
      await waitFor(() => {
        expect(mockSearch).toHaveBeenCalledTimes(1);
      });

      // Trigger a new search, which should abort the previous one
      rerender({ text: '@ab' });

      await waitFor(() => {
        expect(abortSpy).toHaveBeenCalled();
      });

      unmount();
    });

    it('should handle AbortError gracefully', async () => {
      mockInitialize.mockResolvedValue(undefined);
      mockSearch.mockRejectedValue(new AbortError());

      const { result } = renderHook(() =>
        useCompletion(
          useTextBufferForTest('@a'),
          testRootDir,
          [],
          mockCommandContext,
          mockConfig,
        ),
      );

      await waitFor(() => {
        // After an abort, loading should stop, but we keep the suggestion
        // box open for the user.
        expect(result.current.isLoadingSuggestions).toBe(false);
        expect(result.current.showSuggestions).toBe(true);
      });

      expect(result.current.suggestions).toEqual([]);
    });

    it('should abort the search when the hook becomes inactive', async () => {
      const abortSpy = vi.spyOn(AbortController.prototype, 'abort');
      mockInitialize.mockResolvedValue(undefined);
      mockSearch.mockReturnValue(new Promise(() => {}));

      const { rerender, unmount } = renderHook(
        ({ text }) =>
          useCompletion(
            useTextBufferForTest(text),
            testRootDir,
            [],
            mockCommandContext,
            mockConfig,
          ),
        { initialProps: { text: '@a' } },
      );

      // Wait for initialization to complete and the first search to start
      await waitFor(() => {
        expect(mockSearch).toHaveBeenCalledTimes(1);
      });

      rerender({ text: ' @a' }); // Becomes inactive

      await waitFor(() => {
        expect(abortSpy).toHaveBeenCalled();
      });

      unmount();
    });

    it('should handle @ at the end of query', async () => {
      mockInitialize.mockResolvedValue(undefined);
      mockSearch.mockResolvedValue(['file1.txt', 'file2.js']);

      const { result } = renderHook(() =>
        useCompletion(
          useTextBufferForTest('query @'),
          testRootDir,
          [],
          mockCommandContext,
          mockConfig,
        ),
      );

      await waitFor(() => {
        expect(result.current.isLoadingSuggestions).toBe(false);
      });

      expect(mockSearch).toHaveBeenCalledWith('', {
        signal: expect.any(AbortSignal),
        maxResults: 24,
      });

      expect(result.current.suggestions).toEqual([
        { label: 'file1.txt', value: 'file1.txt' },
        { label: 'file2.js', value: 'file2.js' },
      ]);
      expect(result.current.showSuggestions).toBe(true);
    });
  });

  describe('handleAutocomplete', () => {
    it('should complete a partial command', () => {
      const slashCommands = [
        {
          name: 'memory',
          description: 'Manage memory',
          subCommands: [
            {
              name: 'show',
              description: 'Show memory',
            },
            {
              name: 'add',
              description: 'Add to memory',
            },
          ],
        },
      ] as unknown as SlashCommand[];
      // Create a mock buffer that we can spy on directly
      const mockBuffer = {
        text: '/mem',
        setText: vi.fn(),
      } as unknown as TextBuffer;

      const { result } = renderHook(() =>
        useCompletion(
          mockBuffer,
          testRootDir,
          slashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions.map((s) => s.value)).toEqual([
        'memory',
      ]);

      act(() => {
        result.current.handleAutocomplete(0);
      });

      expect(mockBuffer.setText).toHaveBeenCalledWith('/memory ');
    });

    it('should append a sub-command when the parent is complete', () => {
      const mockBuffer = {
        text: '/memory',
        setText: vi.fn(),
      } as unknown as TextBuffer;
      const slashCommands = [
        {
          name: 'memory',
          description: 'Manage memory',
          subCommands: [
            {
              name: 'show',
              description: 'Show memory',
            },
            {
              name: 'add',
              description: 'Add to memory',
            },
          ],
        },
      ] as unknown as SlashCommand[];

      const { result } = renderHook(() =>
        useCompletion(
          mockBuffer,
          testRootDir,
          slashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      // Suggestions are populated by useEffect
      expect(result.current.suggestions.map((s) => s.value)).toEqual([
        'show',
        'add',
      ]);

      act(() => {
        result.current.handleAutocomplete(1); // index 1 is 'add'
      });

      expect(mockBuffer.setText).toHaveBeenCalledWith('/memory add ');
    });

    it('should complete a command with an alternative name', () => {
      const mockBuffer = {
        text: '/?',
        setText: vi.fn(),
      } as unknown as TextBuffer;
      const slashCommands = [
        {
          name: 'memory',
          description: 'Manage memory',
          subCommands: [
            {
              name: 'show',
              description: 'Show memory',
            },
            {
              name: 'add',
              description: 'Add to memory',
            },
          ],
        },
      ] as unknown as SlashCommand[];

      const { result } = renderHook(() =>
        useCompletion(
          mockBuffer,
          testRootDir,
          slashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      result.current.suggestions.push({
        label: 'help',
        value: 'help',
        description: 'Show help',
      });

      act(() => {
        result.current.handleAutocomplete(0);
      });

      expect(mockBuffer.setText).toHaveBeenCalledWith('/help ');
    });

    it('should complete a file path', async () => {
      const mockBuffer = {
        text: '@src/fi',
        lines: ['@src/fi'],
        cursor: [0, 7],
        setText: vi.fn(),
        replaceRangeByOffset: vi.fn(),
      } as unknown as TextBuffer;
      const slashCommands = [
        {
          name: 'memory',
          description: 'Manage memory',
          subCommands: [
            {
              name: 'show',
              description: 'Show memory',
            },
            {
              name: 'add',
              description: 'Add to memory',
            },
          ],
        },
      ] as unknown as SlashCommand[];

      const { result } = renderHook(() =>
        useCompletion(
          mockBuffer,
          testRootDir,
          slashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      result.current.suggestions.push({
        label: 'file1.txt',
        value: 'file1.txt',
      });

      act(() => {
        result.current.handleAutocomplete(0);
      });

      expect(mockBuffer.replaceRangeByOffset).toHaveBeenCalledWith(
        1, // after '@src/'
        mockBuffer.text.length,
        'file1.txt',
      );
    });
  });
});
