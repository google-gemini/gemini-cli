/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** @vitest-environment jsdom */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSlashCompletion } from './useSlashCompletion.js';
import { CommandContext, SlashCommand } from '../commands/types.js';

describe('useSlashCompletion', () => {
  // A minimal mock is sufficient for these tests.
  const mockCommandContext = {} as CommandContext;

  describe('Top-Level Commands', () => {
    it('should suggest all top-level commands for the root slash', async () => {
      const slashCommands = [
        { name: 'help', altNames: ['?'], description: 'Show help' },
        {
          name: 'stats',
          altNames: ['usage'],
          description: 'check session stats. Usage: /stats [model|tools]',
        },
        { name: 'clear', description: 'Clear the screen' },
        {
          name: 'memory',
          description: 'Manage memory',
          subCommands: [{ name: 'show', description: 'Show memory' }],
        },
        { name: 'chat', description: 'Manage chat history' },
      ] as unknown as SlashCommand[];
      const { result } = renderHook(() =>
        useSlashCompletion(true, '/', slashCommands, mockCommandContext),
      );

      expect(result.current.suggestions.length).toBe(slashCommands.length);
      expect(result.current.suggestions.map((s) => s.label)).toEqual(
        expect.arrayContaining(['help', 'clear', 'memory', 'chat', 'stats']),
      );
    });

    it('should filter commands based on partial input', async () => {
      const slashCommands = [
        { name: 'memory', description: 'Manage memory' },
      ] as unknown as SlashCommand[];
      const { result } = renderHook(() =>
        useSlashCompletion(true, '/mem', slashCommands, mockCommandContext),
      );

      expect(result.current.suggestions).toEqual([
        { label: 'memory', value: 'memory', description: 'Manage memory' },
      ]);
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
        useSlashCompletion(true, '/usag', slashCommands, mockCommandContext),
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
        { name: 'clear', description: 'Clear the screen', action: vi.fn() },
      ] as unknown as SlashCommand[];
      const { result } = renderHook(() =>
        useSlashCompletion(true, '/clear', slashCommands, mockCommandContext),
      );

      expect(result.current.suggestions).toHaveLength(0);
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
          useSlashCompletion(
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
        { name: 'clear', description: 'Clear the screen' },
      ] as unknown as SlashCommand[];
      const { result } = renderHook(() =>
        useSlashCompletion(true, '/clear ', slashCommands, mockCommandContext),
      );

      expect(result.current.suggestions).toHaveLength(0);
    });

    it('should not provide suggestions for an unknown command', async () => {
      const slashCommands = [
        { name: 'help', description: 'Show help' },
      ] as unknown as SlashCommand[];
      const { result } = renderHook(() =>
        useSlashCompletion(
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
        {
          name: 'memory',
          description: 'Manage memory',
          subCommands: [
            { name: 'show', description: 'Show memory' },
            { name: 'add', description: 'Add to memory' },
          ],
        },
      ] as unknown as SlashCommand[];

      const { result } = renderHook(() =>
        useSlashCompletion(true, '/memory', slashCommands, mockCommandContext),
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
        {
          name: 'memory',
          description: 'Manage memory',
          subCommands: [
            { name: 'show', description: 'Show memory' },
            { name: 'add', description: 'Add to memory' },
          ],
        },
      ] as unknown as SlashCommand[];
      const { result } = renderHook(() =>
        useSlashCompletion(true, '/memory ', slashCommands, mockCommandContext),
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
            { name: 'show', description: 'Show memory' },
            { name: 'add', description: 'Add to memory' },
          ],
        },
      ] as unknown as SlashCommand[];
      const { result } = renderHook(() =>
        useSlashCompletion(
          true,
          '/memory a',
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
            { name: 'show', description: 'Show memory' },
            { name: 'add', description: 'Add to memory' },
          ],
        },
      ] as unknown as SlashCommand[];
      const { result } = renderHook(() =>
        useSlashCompletion(
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
        useSlashCompletion(
          true,
          '/chat resume my-ch',
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
        useSlashCompletion(
          true,
          '/chat resume ',
          slashCommands,
          mockCommandContext,
        ),
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      expect(mockCompletionFn).toHaveBeenCalledWith(mockCommandContext, '');
      expect(result.current.suggestions).toHaveLength(3);
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
        useSlashCompletion(
          true,
          '/chat resume ',
          slashCommands,
          mockCommandContext,
        ),
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      expect(result.current.suggestions).toHaveLength(0);
    });
  });
});
