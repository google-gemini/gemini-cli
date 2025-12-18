/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { act, useState } from 'react';
import { renderHook } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { useSlashCompletion } from './useSlashCompletion.js';
import type { CommandContext, SlashCommand } from '../commands/types.js';
import { CommandKind } from '../commands/types.js';
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
          description:
            'check session stats. Usage: /stats [session|model|tools]',
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
      let result: {
        current: ReturnType<typeof useTestHarnessForSlashCompletion>;
      };
      let unmount: () => void;
      await act(async () => {
        const hook = renderHook(() =>
          useTestHarnessForSlashCompletion(
            true,
            '/',
            slashCommands,
            mockCommandContext,
          ),
        );
        result = hook.result;
        unmount = hook.unmount;
      });

      await act(async () => {
        await waitFor(() => {
          expect(result.current.suggestions.length).toBe(slashCommands.length);
          expect(result.current.suggestions.map((s) => s.label)).toEqual(
            expect.arrayContaining([
              'help',
              'clear',
              'memory',
              'chat',
              'stats',
            ]),
          );
        });
      });
      unmount!();
    });

    it('should filter commands based on partial input', async () => {
      const slashCommands = [
        createTestCommand({ name: 'memory', description: 'Manage memory' }),
      ];
      const setSuggestions = vi.fn();
      const setIsLoadingSuggestions = vi.fn();
      const setIsPerfectMatch = vi.fn();

      let result: {
        current: { completionStart: number; completionEnd: number };
      };
      let unmount: () => void;
      await act(async () => {
        const hook = renderHook(() =>
          useSlashCompletion({
            enabled: true,
            query: '/mem',
            slashCommands,
            commandContext: mockCommandContext,
            setSuggestions,
            setIsLoadingSuggestions,
            setIsPerfectMatch,
          }),
        );
        result = hook.result;
        unmount = hook.unmount;
      });

      await act(async () => {
        await waitFor(() => {
          expect(setSuggestions).toHaveBeenCalledWith([
            {
              label: 'memory',
              value: 'memory',
              description: 'Manage memory',
              commandKind: CommandKind.BUILT_IN,
            },
          ]);
          expect(result.current.completionStart).toBe(1);
          expect(result.current.completionEnd).toBe(4);
        });
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      unmount!();
    });

    it('should suggest commands based on partial altNames', async () => {
      const slashCommands = [
        createTestCommand({
          name: 'stats',
          altNames: ['usage'],
          description:
            'check session stats. Usage: /stats [session|model|tools]',
        }),
      ];
      let result: {
        current: ReturnType<typeof useTestHarnessForSlashCompletion>;
      };
      let unmount: () => void;
      await act(async () => {
        const hook = renderHook(() =>
          useTestHarnessForSlashCompletion(
            true,
            '/usage',
            slashCommands,
            mockCommandContext,
          ),
        );
        result = hook.result;
        unmount = hook.unmount;
      });

      await waitFor(() => {
        expect(result.current.suggestions).toEqual([
          {
            label: 'stats',
            value: 'stats',
            description:
              'check session stats. Usage: /stats [session|model|tools]',
            commandKind: CommandKind.BUILT_IN,
          },
        ]);
        expect(result.current.completionStart).toBe(1);
      });
      unmount!();
    });

    it('should provide suggestions even for a perfectly typed command that is a leaf node', async () => {
      const slashCommands = [
        createTestCommand({
          name: 'clear',
          description: 'Clear the screen',
          action: vi.fn(),
        }),
      ];
      let result: {
        current: ReturnType<typeof useTestHarnessForSlashCompletion>;
      };
      let unmount: () => void;
      await act(async () => {
        const hook = renderHook(() =>
          useTestHarnessForSlashCompletion(
            true,
            '/clear',
            slashCommands,
            mockCommandContext,
          ),
        );
        result = hook.result;
        unmount = hook.unmount;
      });
      await waitFor(() => {
        expect(result.current.suggestions).toHaveLength(1);
        expect(result.current.suggestions[0].label).toBe('clear');
        expect(result.current.completionStart).toBe(1);
      });
      unmount!();
    });

    it.each([['/?'], ['/usage']])(
      'should suggest commands even when altNames is fully typed',
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
            description:
              'check session stats. Usage: /stats [session|model|tools]',
            action: vi.fn(),
          }),
        ];

        let result: {
          current: ReturnType<typeof useTestHarnessForSlashCompletion>;
        };
        let unmount: () => void;
        await act(async () => {
          const hook = renderHook(() =>
            useTestHarnessForSlashCompletion(
              true,
              query,
              mockSlashCommands,
              mockCommandContext,
            ),
          );
          result = hook.result;
          unmount = hook.unmount;
        });

        await waitFor(() => {
          expect(result.current.suggestions).toHaveLength(1);
          expect(result.current.completionStart).toBe(1);
        });
        unmount!();
      },
    );

    it('should show all matching suggestions even when one is a perfect match', async () => {
      const slashCommands = [
        createTestCommand({
          name: 'review',
          description: 'Review code',
          action: vi.fn(),
        }),
        createTestCommand({
          name: 'review-frontend',
          description: 'Review frontend code',
          action: vi.fn(),
        }),
        createTestCommand({
          name: 'oncall:pr-review',
          description: 'Review PR as oncall',
          action: vi.fn(),
        }),
      ];

      const { result, unmount } = renderHook(() =>
        useTestHarnessForSlashCompletion(
          true,
          '/review',
          slashCommands,
          mockCommandContext,
        ),
      );

      await waitFor(() => {
        // All three should match 'review' in our fuzzy mock or as prefix/exact
        expect(result.current.suggestions.length).toBe(3);
        // 'review' should be first because it is an exact match
        expect(result.current.suggestions[0].label).toBe('review');

        const labels = result.current.suggestions.map((s) => s.label);
        expect(labels).toContain('review');
        expect(labels).toContain('review-frontend');
        expect(labels).toContain('oncall:pr-review');
        expect(result.current.isPerfectMatch).toBe(true);
      });
      unmount();
    });

    it('should sort exact altName matches to the top', async () => {
      const slashCommands = [
        createTestCommand({
          name: 'help',
          altNames: ['?'],
          description: 'Show help',
          action: vi.fn(),
        }),
        createTestCommand({
          name: 'question-mark',
          description: 'Alternative name for help',
          action: vi.fn(),
        }),
      ];

      const { result, unmount } = renderHook(() =>
        useTestHarnessForSlashCompletion(
          true,
          '/?',
          slashCommands,
          mockCommandContext,
        ),
      );

      await waitFor(() => {
        // 'help' should be first because '?' is an exact altName match
        expect(result.current.suggestions[0].label).toBe('help');
        expect(result.current.isPerfectMatch).toBe(true);
      });
      unmount();
    });

    it('should suggest subcommands when a parent command is fully typed without a trailing space', async () => {
      const slashCommands = [
        createTestCommand({
          name: 'chat',
          description: 'Manage chat history',
          subCommands: [
            createTestCommand({ name: 'list', description: 'List chats' }),
            createTestCommand({ name: 'save', description: 'Save chat' }),
          ],
        }),
      ];

      const { result, unmount } = renderHook(() =>
        useTestHarnessForSlashCompletion(
          true,
          '/chat',
          slashCommands,
          mockCommandContext,
        ),
      );

      await waitFor(() => {
        // Should show subcommands of 'chat'
        expect(result.current.suggestions).toHaveLength(2);
        expect(result.current.suggestions.map((s) => s.label)).toEqual(
          expect.arrayContaining(['list', 'save']),
        );
        // completionStart should be at the end of '/chat' to append subcommands
        expect(result.current.completionStart).toBe(5);
      });
      unmount();
    });

    it('should not provide suggestions for a fully typed command that has no sub-commands or argument completion', async () => {
      const slashCommands = [
        createTestCommand({ name: 'clear', description: 'Clear the screen' }),
      ];
      let result: {
        current: ReturnType<typeof useTestHarnessForSlashCompletion>;
      };
      let unmount: () => void;
      await act(async () => {
        const hook = renderHook(() =>
          useTestHarnessForSlashCompletion(
            true,
            '/clear ',
            slashCommands,
            mockCommandContext,
          ),
        );
        result = hook.result;
        unmount = hook.unmount;
      });

      await waitFor(() => {
        expect(result.current.suggestions).toHaveLength(0);
      });
      unmount!();
    });

    it('should not provide suggestions for an unknown command', async () => {
      const slashCommands = [
        createTestCommand({ name: 'help', description: 'Show help' }),
      ];
      let result: {
        current: ReturnType<typeof useTestHarnessForSlashCompletion>;
      };
      let unmount: () => void;
      await act(async () => {
        const hook = renderHook(() =>
          useTestHarnessForSlashCompletion(
            true,
            '/unknown-command',
            slashCommands,
            mockCommandContext,
          ),
        );
        result = hook.result;
        unmount = hook.unmount;
      });

      await waitFor(() => {
        expect(result.current.suggestions).toHaveLength(0);
        expect(result.current.completionStart).toBe(1);
      });
      unmount!();
    });

    it('should not suggest hidden commands', async () => {
      const slashCommands = [
        createTestCommand({
          name: 'visible',
          description: 'A visible command',
        }),
        createTestCommand({
          name: 'hidden',
          description: 'A hidden command',
          hidden: true,
        }),
      ];
      let result: {
        current: ReturnType<typeof useTestHarnessForSlashCompletion>;
      };
      let unmount: () => void;
      await act(async () => {
        const hook = renderHook(() =>
          useTestHarnessForSlashCompletion(
            true,
            '/',
            slashCommands,
            mockCommandContext,
          ),
        );
        result = hook.result;
        unmount = hook.unmount;
      });

      await waitFor(() => {
        expect(result.current.suggestions.length).toBe(1);
        expect(result.current.suggestions[0].label).toBe('visible');
      });
      unmount!();
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

      const { result, unmount } = renderHook(() =>
        useTestHarnessForSlashCompletion(
          true,
          '/memory ',
          slashCommands,
          mockCommandContext,
        ),
      );

      await waitFor(() => {
        expect(result.current.suggestions).toHaveLength(2);
        expect(result.current.suggestions).toEqual(
          expect.arrayContaining([
            {
              label: 'show',
              value: 'show',
              description: 'Show memory',
              commandKind: CommandKind.BUILT_IN,
            },
            {
              label: 'add',
              value: 'add',
              description: 'Add to memory',
              commandKind: CommandKind.BUILT_IN,
            },
          ]),
        );
      });
      unmount();
    });

    it('should suggest parent command (and siblings) instead of sub-commands when no trailing space', async () => {
      const slashCommands = [
        createTestCommand({
          name: 'memory',
          description: 'Manage memory',
          subCommands: [
            createTestCommand({ name: 'show', description: 'Show memory' }),
          ],
        }),
        createTestCommand({
          name: 'memory-leak',
          description: 'Debug memory leaks',
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

      // Should verify that we see BOTH 'memory' and 'memory-leak'
      await waitFor(() => {
        expect(result.current.suggestions).toHaveLength(2);
        expect(result.current.suggestions).toEqual(
          expect.arrayContaining([
            {
              label: 'memory',
              value: 'memory',
              description: 'Manage memory',
              commandKind: CommandKind.BUILT_IN,
            },
            {
              label: 'memory-leak',
              value: 'memory-leak',
              description: 'Debug memory leaks',
              commandKind: CommandKind.BUILT_IN,
            },
          ]),
        );
      });
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
      const { result, unmount } = renderHook(() =>
        useTestHarnessForSlashCompletion(
          true,
          '/memory ',
          slashCommands,
          mockCommandContext,
        ),
      );

      await waitFor(() => {
        expect(result.current.suggestions).toHaveLength(2);
        expect(result.current.suggestions).toEqual(
          expect.arrayContaining([
            {
              label: 'show',
              value: 'show',
              description: 'Show memory',
              commandKind: CommandKind.BUILT_IN,
            },
            {
              label: 'add',
              value: 'add',
              description: 'Add to memory',
              commandKind: CommandKind.BUILT_IN,
            },
          ]),
        );
      });
      unmount();
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
      const { result, unmount } = renderHook(() =>
        useTestHarnessForSlashCompletion(
          true,
          '/memory a',
          slashCommands,
          mockCommandContext,
        ),
      );

      await waitFor(() => {
        expect(result.current.suggestions).toEqual([
          {
            label: 'add',
            value: 'add',
            description: 'Add to memory',
            commandKind: CommandKind.BUILT_IN,
          },
        ]);
        expect(result.current.completionStart).toBe(8);
      });
      unmount();
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
      const { result, unmount } = renderHook(() =>
        useTestHarnessForSlashCompletion(
          true,
          '/memory dothisnow',
          slashCommands,
          mockCommandContext,
        ),
      );
      await act(async () => {
        await waitFor(() => {
          expect(result.current.suggestions).toHaveLength(0);
          expect(result.current.completionStart).toBe(8);
        });
      });
      unmount();
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

      const { result, unmount } = renderHook(() =>
        useTestHarnessForSlashCompletion(
          true,
          '/chat resume my-ch',
          slashCommands,
          mockCommandContext,
        ),
      );

      await act(async () => {
        await waitFor(() => {
          expect(mockCompletionFn).toHaveBeenCalledWith(
            expect.objectContaining({
              invocation: {
                raw: '/chat resume my-ch',
                name: 'resume',
                args: 'my-ch',
              },
            }),
            'my-ch',
          );
        });
      });

      await act(async () => {
        await waitFor(() => {
          expect(result.current.suggestions).toEqual([
            { label: 'my-chat-tag-1', value: 'my-chat-tag-1' },
            { label: 'my-chat-tag-2', value: 'my-chat-tag-2' },
          ]);
          expect(result.current.completionStart).toBe(13);
          expect(result.current.isLoadingSuggestions).toBe(false);
        });
      });
      unmount();
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

      const { result, unmount } = renderHook(() =>
        useTestHarnessForSlashCompletion(
          true,
          '/chat resume ',
          slashCommands,
          mockCommandContext,
        ),
      );

      await act(async () => {
        await waitFor(() => {
          expect(mockCompletionFn).toHaveBeenCalledWith(
            expect.objectContaining({
              invocation: {
                raw: '/chat resume ',
                name: 'resume',
                args: '',
              },
            }),
            '',
          );
        });
      });

      await act(async () => {
        await waitFor(() => {
          expect(result.current.suggestions).toHaveLength(3);
          expect(result.current.completionStart).toBe(13);
        });
      });
      unmount();
    });

    it('should handle completion function that returns null', async () => {
      const mockCompletionFn = vi.fn().mockResolvedValue(null);

      const slashCommands = [
        createTestCommand({
          name: 'test',
          description: 'Test command',
          completion: mockCompletionFn,
        }),
      ];

      const { result, unmount } = renderHook(() =>
        useTestHarnessForSlashCompletion(
          true,
          '/test arg',
          slashCommands,
          mockCommandContext,
        ),
      );

      await waitFor(() => {
        expect(result.current.suggestions).toEqual([]);
        expect(result.current.isLoadingSuggestions).toBe(false);
      });
      unmount();
    });
  });

  describe('Command Kind Information', () => {
    it('should include commandKind for MCP commands in suggestions', async () => {
      const slashCommands = [
        {
          name: 'summarize',
          description: 'Summarize content',
          kind: CommandKind.MCP_PROMPT,
          action: vi.fn(),
        },
        {
          name: 'help',
          description: 'Show help',
          kind: CommandKind.BUILT_IN,
          action: vi.fn(),
        },
      ] as SlashCommand[];

      const { result, unmount } = renderHook(() =>
        useTestHarnessForSlashCompletion(
          true,
          '/',
          slashCommands,
          mockCommandContext,
        ),
      );

      await waitFor(() => {
        expect(result.current.suggestions).toEqual(
          expect.arrayContaining([
            {
              label: 'summarize',
              value: 'summarize',
              description: 'Summarize content',
              commandKind: CommandKind.MCP_PROMPT,
            },
            {
              label: 'help',
              value: 'help',
              description: 'Show help',
              commandKind: CommandKind.BUILT_IN,
            },
          ]),
        );
      });
      unmount();
    });

    it('should include commandKind when filtering MCP commands by prefix', async () => {
      const slashCommands = [
        {
          name: 'summarize',
          description: 'Summarize content',
          kind: CommandKind.MCP_PROMPT,
          action: vi.fn(),
        },
        {
          name: 'settings',
          description: 'Open settings',
          kind: CommandKind.BUILT_IN,
          action: vi.fn(),
        },
      ] as SlashCommand[];

      const { result, unmount } = renderHook(() =>
        useTestHarnessForSlashCompletion(
          true,
          '/summ',
          slashCommands,
          mockCommandContext,
        ),
      );

      await waitFor(() => {
        expect(result.current.suggestions).toEqual([
          {
            label: 'summarize',
            value: 'summarize',
            description: 'Summarize content',
            commandKind: CommandKind.MCP_PROMPT,
          },
        ]);
        expect(result.current.completionStart).toBe(1);
      });
      unmount();
    });

    it('should include commandKind for sub-commands', async () => {
      const slashCommands = [
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
              kind: CommandKind.MCP_PROMPT,
              action: vi.fn(),
            },
          ],
        },
      ] as SlashCommand[];

      const { result, unmount } = renderHook(() =>
        useTestHarnessForSlashCompletion(
          true,
          '/memory ',
          slashCommands,
          mockCommandContext,
        ),
      );

      await waitFor(() => {
        expect(result.current.suggestions).toEqual(
          expect.arrayContaining([
            {
              label: 'show',
              value: 'show',
              description: 'Show memory',
              commandKind: CommandKind.BUILT_IN,
            },
            {
              label: 'add',
              value: 'add',
              description: 'Add to memory',
              commandKind: CommandKind.MCP_PROMPT,
            },
          ]),
        );
      });
      unmount();
    });

    it('should include commandKind for file commands', async () => {
      const slashCommands = [
        {
          name: 'custom-script',
          description: 'Run custom script',
          kind: CommandKind.FILE,
          action: vi.fn(),
        },
      ] as SlashCommand[];

      const { result, unmount } = renderHook(() =>
        useTestHarnessForSlashCompletion(
          true,
          '/custom',
          slashCommands,
          mockCommandContext,
        ),
      );

      await waitFor(() => {
        expect(result.current.suggestions).toEqual([
          {
            label: 'custom-script',
            value: 'custom-script',
            description: 'Run custom script',
            commandKind: CommandKind.FILE,
          },
        ]);
        expect(result.current.completionStart).toBe(1);
      });
      unmount();
    });
  });

  it('should not call shared callbacks when disabled', async () => {
    const mockSetSuggestions = vi.fn();
    const mockSetIsLoadingSuggestions = vi.fn();
    const mockSetIsPerfectMatch = vi.fn();

    const slashCommands = [
      createTestCommand({
        name: 'help',
        description: 'Show help',
      }),
    ];

    const { rerender, unmount } = renderHook(
      ({ enabled, query }) =>
        useSlashCompletion({
          enabled,
          query,
          slashCommands,
          commandContext: mockCommandContext,
          setSuggestions: mockSetSuggestions,
          setIsLoadingSuggestions: mockSetIsLoadingSuggestions,
          setIsPerfectMatch: mockSetIsPerfectMatch,
        }),
      {
        initialProps: { enabled: false, query: '@src/file' },
      },
    );

    // Clear any initial calls
    mockSetSuggestions.mockClear();
    mockSetIsLoadingSuggestions.mockClear();
    mockSetIsPerfectMatch.mockClear();

    // Change query while disabled (simulating @ completion typing)
    rerender({ enabled: false, query: '@src/file.ts' });
    rerender({ enabled: false, query: '@src/file.tsx' });

    // Wait for any internal async operations to settle to avoid act warnings
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // Should not have called shared callbacks during @ completion typing
    await waitFor(() => {
      expect(mockSetSuggestions).not.toHaveBeenCalled();
      expect(mockSetIsLoadingSuggestions).not.toHaveBeenCalled();
      expect(mockSetIsPerfectMatch).not.toHaveBeenCalled();
    });
    unmount();
  });
});
