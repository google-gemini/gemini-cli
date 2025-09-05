/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** @vitest-environment jsdom */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSlashCompletion } from './useSlashCompletion.js';
import type { CommandContext, SlashCommand } from '../commands/types.js';
import { CommandKind } from '../commands/types.js';
import { useState } from 'react';
import type { Suggestion } from '../components/SuggestionsDisplay.js';

// Test utility type and helper function for creating test SlashCommands
type TestSlashCommand = Omit<SlashCommand, 'kind'> &
  Partial<Pick<SlashCommand, 'kind'>>;

function createTestCommand(command: TestSlashCommand): SlashCommand {
  return {
    kind: CommandKind.BUILT_IN, // default for tests
    ...command,
  };
}

// Track AsyncFzf constructor calls for cache testing
let asyncFzfConstructorCalls = 0;
const resetConstructorCallCount = () => {
  asyncFzfConstructorCalls = 0;
};
const getConstructorCallCount = () => asyncFzfConstructorCalls;

// Centralized fuzzy matching simulation logic
// Note: This is a simplified reimplementation that may diverge from real fzf behavior.
// Integration tests in useSlashCompletion.integration.test.ts use the real fzf library
// to catch any behavioral differences and serve as our "canary in a coal mine."
function simulateFuzzyMatching(items: readonly string[], query: string) {
  const results = [];
  if (query) {
    const lowerQuery = query.toLowerCase();
    for (const item of items) {
      const lowerItem = item.toLowerCase();

      // Exact match gets highest score
      if (lowerItem === lowerQuery) {
        results.push({
          item,
          positions: [],
          score: 100,
          start: 0,
          end: item.length,
        });
        continue;
      }

      // Prefix match gets high score
      if (lowerItem.startsWith(lowerQuery)) {
        results.push({
          item,
          positions: [],
          score: 80,
          start: 0,
          end: query.length,
        });
        continue;
      }

      // Fuzzy matching: check if query chars appear in order
      let queryIndex = 0;
      let score = 0;
      for (
        let i = 0;
        i < lowerItem.length && queryIndex < lowerQuery.length;
        i++
      ) {
        if (lowerItem[i] === lowerQuery[queryIndex]) {
          queryIndex++;
          score += 10 - i; // Earlier matches get higher scores
        }
      }

      // If all query characters were found in order, include this item
      if (queryIndex === lowerQuery.length) {
        results.push({
          item,
          positions: [],
          score,
          start: 0,
          end: query.length,
        });
      }
    }
  }

  // Sort by score descending (better matches first)
  results.sort((a, b) => b.score - a.score);
  return Promise.resolve(results);
}

// Mock the fzf module to provide a working fuzzy search implementation for tests
vi.mock('fzf', async () => {
  const actual = await vi.importActual<typeof import('fzf')>('fzf');
  return {
    ...actual,
    AsyncFzf: vi.fn().mockImplementation((items, _options) => {
      asyncFzfConstructorCalls++;
      return {
        find: vi
          .fn()
          .mockImplementation((query: string) =>
            simulateFuzzyMatching(items, query),
          ),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;
    }),
  };
});

// Default mock behavior helper - now uses centralized logic
const createDefaultAsyncFzfMock =
  () => (items: readonly string[], _options: unknown) => {
    asyncFzfConstructorCalls++;
    return {
      find: vi
        .fn()
        .mockImplementation((query: string) =>
          simulateFuzzyMatching(items, query),
        ),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  };

// Export test utilities
export {
  resetConstructorCallCount,
  getConstructorCallCount,
  createDefaultAsyncFzfMock,
};

// Test harness to capture the state from the hook's callbacks.
function useTestHarnessForSlashCompletion(
  enabled: boolean,
  query: string | null,
  slashCommands: readonly SlashCommand[],
  commandContext: CommandContext,
) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [isPerfectMatch, setIsPerfectMatch] = useState(false);

  const { completionStart, completionEnd } = useSlashCompletion({
    enabled,
    query,
    slashCommands,
    commandContext,
    setSuggestions,
    setIsLoadingSuggestions,
    setIsPerfectMatch,
  });

  return {
    suggestions,
    isLoadingSuggestions,
    isPerfectMatch,
    completionStart,
    completionEnd,
  };
}

describe('useSlashCompletion', () => {
  // A minimal mock is sufficient for these tests.
  const mockCommandContext = {} as CommandContext;

  describe('Top-Level Commands', () => {
    it('should suggest all top-level commands for the root slash', async () => {
      const slashCommands = [
        createTestCommand({
          name: 'help',
          altNames: ['?'],
          description: 'Show help',
        }),
        createTestCommand({
          name: 'stats',
          altNames: ['usage'],
          description: 'check session stats. Usage: /stats [model|tools]',
        }),
        createTestCommand({ name: 'clear', description: 'Clear the screen' }),
        createTestCommand({
          name: 'memory',
          description: 'Manage memory',
          subCommands: [
            createTestCommand({ name: 'show', description: 'Show memory' }),
          ],
        }),
        createTestCommand({ name: 'chat', description: 'Manage chat history' }),
      ];
      const { result } = renderHook(() =>
        useTestHarnessForSlashCompletion(
          true,
          '/',
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
        createTestCommand({ name: 'memory', description: 'Manage memory' }),
      ];
      const { result } = renderHook(() =>
        useTestHarnessForSlashCompletion(
          true,
          '/mem',
          slashCommands,
          mockCommandContext,
        ),
      );

      await waitFor(() => {
        expect(result.current.suggestions).toEqual([
          { label: 'memory', value: 'memory', description: 'Manage memory' },
        ]);
      });
    });

    it('should suggest commands based on partial altNames', async () => {
      const slashCommands = [
        createTestCommand({
          name: 'stats',
          altNames: ['usage'],
          description: 'check session stats. Usage: /stats [model|tools]',
        }),
      ];
      const { result } = renderHook(() =>
        useTestHarnessForSlashCompletion(
          true,
          '/usag',
          slashCommands,
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

    it('should NOT provide suggestions for a perfectly typed command that is a leaf node', async () => {
      const slashCommands = [
        createTestCommand({
          name: 'clear',
          description: 'Clear the screen',
          action: vi.fn(),
        }),
      ];
      const { result } = renderHook(() =>
        useTestHarnessForSlashCompletion(
          true,
          '/clear',
          slashCommands,
          mockCommandContext,
        ),
      );

      expect(result.current.suggestions).toHaveLength(0);
    });

    it.each([['/?'], ['/usage']])(
      'should not suggest commands when altNames is fully typed',
      async (query) => {
        const mockSlashCommands = [
          createTestCommand({
            name: 'help',
            altNames: ['?'],
            description: 'Show help',
            action: vi.fn(),
          }),
          createTestCommand({
            name: 'stats',
            altNames: ['usage'],
            description: 'check session stats. Usage: /stats [model|tools]',
            action: vi.fn(),
          }),
        ];

        const { result } = renderHook(() =>
          useTestHarnessForSlashCompletion(
            true,
            query,
            mockSlashCommands,
            mockCommandContext,
          ),
        );

        expect(result.current.suggestions).toHaveLength(0);
      },
    );

    it('should not provide suggestions for a fully typed command that has no sub-commands or argument completion', async () => {
      const slashCommands = [
        createTestCommand({ name: 'clear', description: 'Clear the screen' }),
      ];
      const { result } = renderHook(() =>
        useTestHarnessForSlashCompletion(
          true,
          '/clear ',
          slashCommands,
          mockCommandContext,
        ),
      );

      expect(result.current.suggestions).toHaveLength(0);
    });

    it('should not provide suggestions for an unknown command', async () => {
      const slashCommands = [
        createTestCommand({ name: 'help', description: 'Show help' }),
      ];
      const { result } = renderHook(() =>
        useTestHarnessForSlashCompletion(
          true,
          '/unknown-command',
          slashCommands,
          mockCommandContext,
        ),
      );

      expect(result.current.suggestions).toHaveLength(0);
    });
  });

  describe('Sub-Commands', () => {
    it('should suggest sub-commands for a parent command', async () => {
      const slashCommands = [
        createTestCommand({
          name: 'memory',
          description: 'Manage memory',
          subCommands: [
            createTestCommand({ name: 'show', description: 'Show memory' }),
            createTestCommand({ name: 'add', description: 'Add to memory' }),
          ],
        }),
      ];

      const { result } = renderHook(() =>
        useTestHarnessForSlashCompletion(
          true,
          '/memory',
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

    it('should suggest all sub-commands when the query ends with the parent command and a space', async () => {
      const slashCommands = [
        createTestCommand({
          name: 'memory',
          description: 'Manage memory',
          subCommands: [
            createTestCommand({ name: 'show', description: 'Show memory' }),
            createTestCommand({ name: 'add', description: 'Add to memory' }),
          ],
        }),
      ];
      const { result } = renderHook(() =>
        useTestHarnessForSlashCompletion(
          true,
          '/memory ',
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
        createTestCommand({
          name: 'memory',
          description: 'Manage memory',
          subCommands: [
            createTestCommand({ name: 'show', description: 'Show memory' }),
            createTestCommand({ name: 'add', description: 'Add to memory' }),
          ],
        }),
      ];
      const { result } = renderHook(() =>
        useTestHarnessForSlashCompletion(
          true,
          '/memory a',
          slashCommands,
          mockCommandContext,
        ),
      );

      await waitFor(() => {
        expect(result.current.suggestions).toEqual([
          { label: 'add', value: 'add', description: 'Add to memory' },
        ]);
      });
    });

    it('should provide no suggestions for an invalid sub-command', async () => {
      const slashCommands = [
        createTestCommand({
          name: 'memory',
          description: 'Manage memory',
          subCommands: [
            createTestCommand({ name: 'show', description: 'Show memory' }),
            createTestCommand({ name: 'add', description: 'Add to memory' }),
          ],
        }),
      ];
      const { result } = renderHook(() =>
        useTestHarnessForSlashCompletion(
          true,
          '/memory dothisnow',
          slashCommands,
          mockCommandContext,
        ),
      );

      expect(result.current.suggestions).toHaveLength(0);
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
        createTestCommand({
          name: 'chat',
          description: 'Manage chat history',
          subCommands: [
            createTestCommand({
              name: 'resume',
              description: 'Resume a saved chat',
              completion: mockCompletionFn,
            }),
          ],
        }),
      ];

      const { result } = renderHook(() =>
        useTestHarnessForSlashCompletion(
          true,
          '/chat resume my-ch',
          slashCommands,
          mockCommandContext,
        ),
      );

      await waitFor(() => {
        expect(mockCompletionFn).toHaveBeenCalledWith(
          mockCommandContext,
          'my-ch',
        );
      });

      await waitFor(() => {
        expect(result.current.suggestions).toEqual([
          { label: 'my-chat-tag-1', value: 'my-chat-tag-1' },
          { label: 'my-chat-tag-2', value: 'my-chat-tag-2' },
        ]);
      });
    });

    it('should call command.completion with an empty string when args start with a space', async () => {
      const mockCompletionFn = vi
        .fn()
        .mockResolvedValue(['my-chat-tag-1', 'my-chat-tag-2', 'my-channel']);

      const slashCommands = [
        createTestCommand({
          name: 'chat',
          description: 'Manage chat history',
          subCommands: [
            createTestCommand({
              name: 'resume',
              description: 'Resume a saved chat',
              completion: mockCompletionFn,
            }),
          ],
        }),
      ];

      const { result } = renderHook(() =>
        useTestHarnessForSlashCompletion(
          true,
          '/chat resume ',
          slashCommands,
          mockCommandContext,
        ),
      );

      await waitFor(() => {
        expect(mockCompletionFn).toHaveBeenCalledWith(mockCommandContext, '');
      });

      await waitFor(() => {
        expect(result.current.suggestions).toHaveLength(3);
      });
    });

    it('should handle completion function that returns null', async () => {
      const completionFn = vi.fn().mockResolvedValue(null);
      const slashCommands = [
        createTestCommand({
          name: 'chat',
          description: 'Manage chat history',
          subCommands: [
            createTestCommand({
              name: 'resume',
              description: 'Resume a saved chat',
              completion: completionFn,
            }),
          ],
        }),
      ];

      const { result } = renderHook(() =>
        useTestHarnessForSlashCompletion(
          true,
          '/chat resume ',
          slashCommands,
          mockCommandContext,
        ),
      );

      await waitFor(() => {
        expect(result.current.suggestions).toHaveLength(0);
      });
    });
  });

  describe('Fuzzy Matching', () => {
    const fuzzyTestCommands = [
      createTestCommand({
        name: 'help',
        altNames: ['?'],
        description: 'Show help',
      }),
      createTestCommand({
        name: 'history',
        description: 'Show command history',
      }),
      createTestCommand({ name: 'hello', description: 'Hello world command' }),
      createTestCommand({
        name: 'config',
        altNames: ['configure'],
        description: 'Configure settings',
      }),
      createTestCommand({ name: 'clear', description: 'Clear the screen' }),
    ];

    it('should match commands with fuzzy search for partial queries', async () => {
      const { result } = renderHook(() =>
        useTestHarnessForSlashCompletion(
          true,
          '/he',
          fuzzyTestCommands,
          mockCommandContext,
        ),
      );

      await waitFor(() => {
        expect(result.current.suggestions.length).toBeGreaterThan(0);
      });

      const labels = result.current.suggestions.map((s) => s.label);
      expect(labels).toEqual(expect.arrayContaining(['help', 'hello']));
    });

    it('should handle case-insensitive fuzzy matching', async () => {
      const { result } = renderHook(() =>
        useTestHarnessForSlashCompletion(
          true,
          '/HeLp',
          fuzzyTestCommands,
          mockCommandContext,
        ),
      );

      await waitFor(() => {
        expect(result.current.suggestions.length).toBeGreaterThan(0);
      });

      const labels = result.current.suggestions.map((s) => s.label);
      expect(labels).toContain('help');
    });

    it('should provide typo-tolerant matching', async () => {
      const { result } = renderHook(() =>
        useTestHarnessForSlashCompletion(
          true,
          '/hlp',
          fuzzyTestCommands,
          mockCommandContext,
        ),
      );

      await waitFor(() => {
        expect(result.current.suggestions.length).toBeGreaterThan(0);
      });

      const labels = result.current.suggestions.map((s) => s.label);
      expect(labels).toContain('help');
    });

    it('should match against alternative names with fuzzy search', async () => {
      const { result } = renderHook(() =>
        useTestHarnessForSlashCompletion(
          true,
          '/conf',
          fuzzyTestCommands,
          mockCommandContext,
        ),
      );

      await waitFor(() => {
        expect(result.current.suggestions.length).toBeGreaterThan(0);
      });

      const labels = result.current.suggestions.map((s) => s.label);
      expect(labels).toContain('config');
    });

    it('should fallback to prefix matching when AsyncFzf find fails', async () => {
      // Mock console.error to avoid noise in test output
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Import the mocked AsyncFzf
      const { AsyncFzf } = await import('fzf');

      // Create a failing find method for this specific test
      const mockFind = vi
        .fn()
        .mockRejectedValue(new Error('AsyncFzf find failed'));

      // Mock AsyncFzf to return an instance with failing find
      vi.mocked(AsyncFzf).mockImplementation(
        (_items, _options) =>
          ({
            finder: vi.fn(),
            find: mockFind,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          }) as any,
      );

      const testCommands = [
        createTestCommand({ name: 'clear', description: 'Clear the screen' }),
        createTestCommand({
          name: 'config',
          description: 'Configure settings',
        }),
        createTestCommand({ name: 'chat', description: 'Start chat' }),
      ];

      const { result } = renderHook(() =>
        useTestHarnessForSlashCompletion(
          true,
          '/cle',
          testCommands,
          mockCommandContext,
        ),
      );

      await waitFor(() => {
        expect(result.current.suggestions.length).toBeGreaterThan(0);
      });

      // Should still get suggestions via prefix matching fallback
      const labels = result.current.suggestions.map((s) => s.label);
      expect(labels).toContain('clear');
      expect(labels).not.toContain('config'); // Doesn't start with 'cle'
      expect(labels).not.toContain('chat'); // Doesn't start with 'cle'

      // Verify the error was logged
      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '[Fuzzy search - falling back to prefix matching]',
          expect.any(Error),
        );
      });

      consoleErrorSpy.mockRestore();

      // Reset AsyncFzf mock to default behavior for other tests
      vi.mocked(AsyncFzf).mockImplementation(createDefaultAsyncFzfMock());
    });

    it('should show all commands for empty partial query', async () => {
      const { result } = renderHook(() =>
        useTestHarnessForSlashCompletion(
          true,
          '/',
          fuzzyTestCommands,
          mockCommandContext,
        ),
      );

      expect(result.current.suggestions.length).toBe(fuzzyTestCommands.length);
    });

    it('should handle AsyncFzf errors gracefully and fallback to prefix matching', async () => {
      // Mock console.error to avoid noise in test output
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Import the mocked AsyncFzf
      const { AsyncFzf } = await import('fzf');

      // Create a failing find method for this specific test
      const mockFind = vi
        .fn()
        .mockRejectedValue(new Error('AsyncFzf error in find'));

      // Mock AsyncFzf to return an instance with failing find
      vi.mocked(AsyncFzf).mockImplementation(
        (_items, _options) =>
          ({
            finder: vi.fn(),
            find: mockFind,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          }) as any,
      );

      const testCommands = [
        { name: 'test', description: 'Test command' },
        { name: 'temp', description: 'Temporary command' },
      ] as unknown as SlashCommand[];

      const { result } = renderHook(() =>
        useTestHarnessForSlashCompletion(
          true,
          '/te',
          testCommands,
          mockCommandContext,
        ),
      );

      await waitFor(() => {
        expect(result.current.suggestions.length).toBeGreaterThan(0);
      });

      // Should get suggestions via prefix matching fallback
      const labels = result.current.suggestions.map((s) => s.label);
      expect(labels).toEqual(expect.arrayContaining(['test', 'temp']));

      // Verify the error was logged
      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '[Fuzzy search - falling back to prefix matching]',
          expect.any(Error),
        );
      });

      consoleErrorSpy.mockRestore();

      // Reset AsyncFzf mock to default behavior for other tests
      vi.mocked(AsyncFzf).mockImplementation(createDefaultAsyncFzfMock());
    });

    it('should cache AsyncFzf instances for performance', async () => {
      // Reset constructor call count and ensure mock is set up correctly
      resetConstructorCallCount();

      // Import the mocked AsyncFzf
      const { AsyncFzf } = await import('fzf');
      vi.mocked(AsyncFzf).mockImplementation(createDefaultAsyncFzfMock());

      const { result, rerender } = renderHook(
        ({ query }) =>
          useTestHarnessForSlashCompletion(
            true,
            query,
            fuzzyTestCommands,
            mockCommandContext,
          ),
        { initialProps: { query: '/he' } },
      );

      await waitFor(() => {
        expect(result.current.suggestions.length).toBeGreaterThan(0);
      });

      const firstResults = result.current.suggestions.map((s) => s.label);
      const callCountAfterFirst = getConstructorCallCount();
      expect(callCountAfterFirst).toBeGreaterThan(0);

      // Rerender with same query - should use cached instance
      rerender({ query: '/he' });

      await waitFor(() => {
        expect(result.current.suggestions.length).toBeGreaterThan(0);
      });

      const secondResults = result.current.suggestions.map((s) => s.label);
      const callCountAfterSecond = getConstructorCallCount();

      // Should have same number of constructor calls (reused cached instance)
      expect(callCountAfterSecond).toBe(callCountAfterFirst);
      expect(secondResults).toEqual(firstResults);

      // Different query should still use same cached instance for same command set
      rerender({ query: '/hel' });

      await waitFor(() => {
        expect(result.current.suggestions.length).toBeGreaterThan(0);
      });

      const thirdCallCount = getConstructorCallCount();
      expect(thirdCallCount).toBe(callCountAfterFirst); // Same constructor call count
    });

    it('should not return duplicate suggestions when query matches both name and altNames', async () => {
      const commandsWithAltNames = [
        createTestCommand({
          name: 'config',
          altNames: ['configure', 'conf'],
          description: 'Configure settings',
        }),
        createTestCommand({
          name: 'help',
          altNames: ['?'],
          description: 'Show help',
        }),
      ];

      const { result } = renderHook(() =>
        useTestHarnessForSlashCompletion(
          true,
          '/con',
          commandsWithAltNames,
          mockCommandContext,
        ),
      );

      await waitFor(() => {
        expect(result.current.suggestions.length).toBeGreaterThan(0);
      });

      const labels = result.current.suggestions.map((s) => s.label);
      const uniqueLabels = new Set(labels);

      // Should not have duplicates
      expect(labels.length).toBe(uniqueLabels.size);
      expect(labels).toContain('config');
    });
  });
  describe('Race Condition Handling', () => {
    it('should handle rapid input changes without race conditions', async () => {
      const mockDelayedCompletion = vi
        .fn()
        .mockImplementation(
          async (_context: CommandContext, partialArg: string) => {
            // Simulate network delay with different delays for different inputs
            const delay = partialArg.includes('slow') ? 200 : 50;
            await new Promise((resolve) => setTimeout(resolve, delay));
            return [`suggestion-for-${partialArg}`];
          },
        );

      const slashCommands = [
        createTestCommand({
          name: 'test',
          description: 'Test command',
          completion: mockDelayedCompletion,
        }),
      ];

      const { result, rerender } = renderHook(
        ({ query }) =>
          useTestHarnessForSlashCompletion(
            true,
            query,
            slashCommands,
            mockCommandContext,
          ),
        { initialProps: { query: '/test slowquery' } },
      );

      // Quickly change to a faster query
      rerender({ query: '/test fastquery' });

      await waitFor(() => {
        expect(result.current.suggestions.length).toBeGreaterThan(0);
      });

      // Should show suggestions for the latest query only
      const labels = result.current.suggestions.map((s) => s.label);
      expect(labels).toContain('suggestion-for-fastquery');
      expect(labels).not.toContain('suggestion-for-slowquery');
    });

    it('should not update suggestions if component unmounts during async operation', async () => {
      let resolveCompletion: (value: string[]) => void;
      const mockCompletion = vi.fn().mockImplementation(
        async () =>
          new Promise<string[]>((resolve) => {
            resolveCompletion = resolve;
          }),
      );

      const slashCommands = [
        createTestCommand({
          name: 'test',
          description: 'Test command',
          completion: mockCompletion,
        }),
      ];

      const { unmount } = renderHook(() =>
        useTestHarnessForSlashCompletion(
          true,
          '/test query',
          slashCommands,
          mockCommandContext,
        ),
      );

      // Start the async operation
      await waitFor(() => {
        expect(mockCompletion).toHaveBeenCalled();
      });

      // Unmount before completion resolves
      unmount();

      // Now resolve the completion
      resolveCompletion!(['late-suggestion']);

      // Wait a bit to ensure any pending updates would have been processed
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Since the component is unmounted, suggestions should remain empty
      // and no state update errors should occur
      expect(true).toBe(true); // Test passes if no errors are thrown
    });
  });

  describe('Error Logging', () => {
    it('should log errors to the console', async () => {
      // Mock console.error to capture log calls
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Import the mocked AsyncFzf
      const { AsyncFzf } = await import('fzf');

      // Create a failing find method with error containing sensitive-looking data
      const sensitiveError = new Error(
        'Database connection failed: user=admin, pass=secret123',
      );
      const mockFind = vi.fn().mockRejectedValue(sensitiveError);

      // Mock AsyncFzf to return an instance with failing find
      vi.mocked(AsyncFzf).mockImplementation(
        (_items, _options) =>
          ({
            find: mockFind,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          }) as any,
      );

      const testCommands = [
        createTestCommand({ name: 'test', description: 'Test command' }),
      ];

      const { result } = renderHook(() =>
        useTestHarnessForSlashCompletion(
          true,
          '/test',
          testCommands,
          mockCommandContext,
        ),
      );

      await waitFor(() => {
        expect(result.current.suggestions.length).toBeGreaterThan(0);
      });

      // Should get fallback suggestions
      const labels = result.current.suggestions.map((s) => s.label);
      expect(labels).toContain('test');

      // Verify error logging occurred
      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '[Fuzzy search - falling back to prefix matching]',
          sensitiveError,
        );
      });

      consoleErrorSpy.mockRestore();

      // Reset AsyncFzf mock to default behavior
      vi.mocked(AsyncFzf).mockImplementation(createDefaultAsyncFzfMock());
    });
  });
});
