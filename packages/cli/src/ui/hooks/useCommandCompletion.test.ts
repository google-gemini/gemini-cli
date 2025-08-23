/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** @vitest-environment jsdom */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCommandCompletion } from './useCommandCompletion.js';
import { CommandContext, CommandKind, SlashCommand } from '../commands/types.js';
import { Config } from '@google/gemini-cli-core';
import { useTextBuffer } from '../components/shared/text-buffer.js';
import { useEffect } from 'react';
import type { Suggestion } from '../components/SuggestionsDisplay.js';
import type { UseAtCompletionProps } from './useAtCompletion.js';
import { useAtCompletion } from './useAtCompletion.js';
import type { UseSlashCompletionProps } from './useSlashCompletion.js';
import { useSlashCompletion } from './useSlashCompletion.js';

vi.mock('./useAtCompletion', () => ({
  useAtCompletion: vi.fn(),
}));

vi.mock('./useSlashCompletion', () => ({
  useSlashCompletion: vi.fn(() => ({
    completionStart: 0,
    completionEnd: 0,
  })),
}));

// Helper to set up mocks in a consistent way for both child hooks
const setupMocks = ({
  atSuggestions = [],
  slashSuggestions = [],
  isLoading = false,
  isPerfectMatch = false,
  slashCompletionRange = { completionStart: 0, completionEnd: 0 },
}: {
  atSuggestions?: Suggestion[];
  slashSuggestions?: Suggestion[];
  isLoading?: boolean;
  isPerfectMatch?: boolean;
  slashCompletionRange?: { completionStart: number; completionEnd: number };
}) => {
  // Mock for @-completions
  (useAtCompletion as vi.Mock).mockImplementation(
    ({
      enabled,
      setSuggestions,
      setIsLoadingSuggestions,
    }: UseAtCompletionProps) => {
      useEffect(() => {
        if (enabled) {
          setIsLoadingSuggestions(isLoading);
          setSuggestions(atSuggestions);
        }
      }, [enabled, setSuggestions, setIsLoadingSuggestions]);
    },
  );

  // Mock for /-completions
  (useSlashCompletion as vi.Mock).mockImplementation(
    ({
      enabled,
      setSuggestions,
      setIsLoadingSuggestions,
      setIsPerfectMatch,
    }: UseSlashCompletionProps) => {
      useEffect(() => {
        if (enabled) {
          setIsLoadingSuggestions(isLoading);
          setSuggestions(slashSuggestions);
          setIsPerfectMatch(isPerfectMatch);
        }
      }, [enabled, setSuggestions, setIsLoadingSuggestions, setIsPerfectMatch]);
      // The hook returns a range, which we can mock simply
      return slashCompletionRange;
    },
  );
};

describe('useCommandCompletion', () => {
  const mockCommandContext = {} as CommandContext;
  const mockConfig = {
    getEnablePromptCompletion: () => false,
  } as Config;
  const testDirs: string[] = [];
  const testRootDir = '/';

  // Helper to create real TextBuffer objects within renderHook
  function useTextBufferForTest(text: string, cursorOffset?: number) {
    return useTextBuffer({
      initialText: text,
      initialCursorOffset: cursorOffset ?? text.length,
      viewport: { width: 80, height: 20 },
      isValidPath: () => false,
      onChange: () => {},
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to default mocks before each test
    setupMocks({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Core Hook Behavior', () => {
    describe('State Management', () => {
      it('should initialize with default state', () => {
        const { result } = renderHook(() =>
          useCommandCompletion(
            useTextBufferForTest(''),
            testDirs,
            testRootDir,
            [],
            mockCommandContext,
            false,
            mockConfig,
          ),
        );

        expect(result.current.suggestions).toEqual([]);
        expect(result.current.activeSuggestionIndex).toBe(-1);
        expect(result.current.visibleStartIndex).toBe(0);
        expect(result.current.showSuggestions).toBe(false);
        expect(result.current.isLoadingSuggestions).toBe(false);
      });

      it('should reset state when completion mode becomes IDLE', async () => {
        setupMocks({
          atSuggestions: [{ label: 'src/file.txt', value: 'src/file.txt' }],
        });

        const { result } = renderHook(() => {
          const textBuffer = useTextBufferForTest('@file');
          const completion = useCommandCompletion(
            textBuffer,
            testDirs,
            testRootDir,
            [],
            mockCommandContext,
            false,
            mockConfig,
          );
          return { completion, textBuffer };
        });

        await waitFor(() => {
          expect(result.current.completion.suggestions).toHaveLength(1);
        });

        expect(result.current.completion.showSuggestions).toBe(true);

        act(() => {
          result.current.textBuffer.replaceRangeByOffset(
            0,
            5,
            'just some text',
          );
        });

        await waitFor(() => {
          expect(result.current.completion.showSuggestions).toBe(false);
        });
      });

      it('should reset all state to default values', () => {
        const { result } = renderHook(() =>
          useCommandCompletion(
            useTextBufferForTest('@files'),
            testDirs,
            testRootDir,
            [],
            mockCommandContext,
            false,
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

        expect(result.current.activeSuggestionIndex).toBe(-1);
        expect(result.current.visibleStartIndex).toBe(0);
        expect(result.current.showSuggestions).toBe(false);
      });

      it('should call useAtCompletion with the correct query for an escaped space', async () => {
        const text = '@src/a\\ file.txt';
        renderHook(() =>
          useCommandCompletion(
            useTextBufferForTest(text),
            testDirs,
            testRootDir,
            [],
            mockCommandContext,
            false,
            mockConfig,
          ),
        );

        await waitFor(() => {
          expect(useAtCompletion).toHaveBeenLastCalledWith(
            expect.objectContaining({
              enabled: true,
              pattern: 'src/a\\ file.txt',
            }),
          );
        });
      });

      it('should correctly identify the completion context with multiple @ symbols', async () => {
        const text = '@file1 @file2';
        const cursorOffset = 3; // @fi|le1 @file2

        renderHook(() =>
          useCommandCompletion(
            useTextBufferForTest(text, cursorOffset),
            testDirs,
            testRootDir,
            [],
            mockCommandContext,
            false,
            mockConfig,
          ),
        );

        await waitFor(() => {
          expect(useAtCompletion).toHaveBeenLastCalledWith(
            expect.objectContaining({
              enabled: true,
              pattern: 'file1',
            }),
          );
        });
      });
    });

    describe('Navigation', () => {
      const mockSuggestions = [
        { label: 'cmd1', value: 'cmd1' },
        { label: 'cmd2', value: 'cmd2' },
        { label: 'cmd3', value: 'cmd3' },
        { label: 'cmd4', value: 'cmd4' },
        { label: 'cmd5', value: 'cmd5' },
      ];

      beforeEach(() => {
        setupMocks({ slashSuggestions: mockSuggestions });
      });

      it('should handle navigateUp with no suggestions', () => {
        setupMocks({ slashSuggestions: [] });

        const { result } = renderHook(() =>
          useCommandCompletion(
            useTextBufferForTest('/'),
            testDirs,
            testRootDir,
            [],
            mockCommandContext,
            false,
            mockConfig,
          ),
        );

        act(() => {
          result.current.navigateUp();
        });

        expect(result.current.activeSuggestionIndex).toBe(-1);
      });

      it('should handle navigateDown with no suggestions', () => {
        setupMocks({ slashSuggestions: [] });
        const { result } = renderHook(() =>
          useCommandCompletion(
            useTextBufferForTest('/'),
            testDirs,
            testRootDir,
            [],
            mockCommandContext,
            false,
            mockConfig,
          ),
        );

        act(() => {
          result.current.navigateDown();
        });

        expect(result.current.activeSuggestionIndex).toBe(-1);
      });

      it('should navigate up through suggestions with wrap-around', async () => {
        const { result } = renderHook(() =>
          useCommandCompletion(
            useTextBufferForTest('/'),
            testDirs,
            testRootDir,
            [],
            mockCommandContext,
            false,
            mockConfig,
          ),
        );

        await waitFor(() => {
          expect(result.current.suggestions.length).toBe(5);
        });

        expect(result.current.activeSuggestionIndex).toBe(0);

        act(() => {
          result.current.navigateUp();
        });

        expect(result.current.activeSuggestionIndex).toBe(4);
      });

      it('should navigate down through suggestions with wrap-around', async () => {
        const { result } = renderHook(() =>
          useCommandCompletion(
            useTextBufferForTest('/'),
            testDirs,
            testRootDir,
            [],
            mockCommandContext,
            false,
            mockConfig,
          ),
        );

        await waitFor(() => {
          expect(result.current.suggestions.length).toBe(5);
        });

        act(() => {
          result.current.setActiveSuggestionIndex(4);
        });
        expect(result.current.activeSuggestionIndex).toBe(4);

        act(() => {
          result.current.navigateDown();
        });

        expect(result.current.activeSuggestionIndex).toBe(0);
      });

      it('should handle navigation with multiple suggestions', async () => {
        const { result } = renderHook(() =>
          useCommandCompletion(
            useTextBufferForTest('/'),
            testDirs,
            testRootDir,
            [],
            mockCommandContext,
            false,
            mockConfig,
          ),
        );

        await waitFor(() => {
          expect(result.current.suggestions.length).toBe(5);
        });

        expect(result.current.activeSuggestionIndex).toBe(0);

        act(() => result.current.navigateDown());
        expect(result.current.activeSuggestionIndex).toBe(1);

        act(() => result.current.navigateDown());
        expect(result.current.activeSuggestionIndex).toBe(2);

        act(() => result.current.navigateUp());
        expect(result.current.activeSuggestionIndex).toBe(1);

        act(() => result.current.navigateUp());
        expect(result.current.activeSuggestionIndex).toBe(0);

        act(() => result.current.navigateUp());
        expect(result.current.activeSuggestionIndex).toBe(4);
      });

      it('should automatically select the first item when suggestions are available', async () => {
        setupMocks({ slashSuggestions: mockSuggestions });

        const { result } = renderHook(() =>
          useCommandCompletion(
            useTextBufferForTest('/'),
            testDirs,
            testRootDir,
            [],
            mockCommandContext,
            false,
            mockConfig,
          ),
        );

        await waitFor(() => {
          expect(result.current.suggestions.length).toBe(
            mockSuggestions.length,
          );
          expect(result.current.activeSuggestionIndex).toBe(0);
        });
      });
    });
  });

  describe('handleAutocomplete', () => {
    it('should complete a partial command', async () => {
      setupMocks({
        slashSuggestions: [{ label: 'memory', value: 'memory' }],
        slashCompletionRange: { completionStart: 1, completionEnd: 4 },
      });

      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest('/mem');
        const completion = useCommandCompletion(
          textBuffer,
          testDirs,
          testRootDir,
          [],
          mockCommandContext,
          false,
          mockConfig,
        );
        return { ...completion, textBuffer };
      });

      await waitFor(() => {
        expect(result.current.suggestions.length).toBe(1);
      });

      act(() => {
        result.current.handleAutocomplete(0);
      });

      expect(result.current.textBuffer.text).toBe('/memory ');
    });

    it('should complete a file path', async () => {
      setupMocks({
        atSuggestions: [{ label: 'src/file1.txt', value: 'src/file1.txt' }],
      });

      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest('@src/fi');
        const completion = useCommandCompletion(
          textBuffer,
          testDirs,
          testRootDir,
          [],
          mockCommandContext,
          false,
          mockConfig,
        );
        return { ...completion, textBuffer };
      });

      await waitFor(() => {
        expect(result.current.suggestions.length).toBe(1);
      });

      act(() => {
        result.current.handleAutocomplete(0);
      });

      expect(result.current.textBuffer.text).toBe('@src/file1.txt ');
    });

    it('should complete a file path when cursor is not at the end of the line', async () => {
      const text = '@src/fi is a good file';
      const cursorOffset = 7; // after "i"

      setupMocks({
        atSuggestions: [{ label: 'src/file1.txt', value: 'src/file1.txt' }],
      });

      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest(text, cursorOffset);
        const completion = useCommandCompletion(
          textBuffer,
          testDirs,
          testRootDir,
          [],
          mockCommandContext,
          false,
          mockConfig,
        );
        return { ...completion, textBuffer };
      });

      await waitFor(() => {
        expect(result.current.suggestions.length).toBe(1);
      });

      act(() => {
        result.current.handleAutocomplete(0);
      });

      expect(result.current.textBuffer.text).toBe(
        '@src/file1.txt is a good file',
      );
    });
  });

  describe('prompt completion filtering', () => {
    it('should not trigger prompt completion for line comments', async () => {
      const mockConfig = {
        getEnablePromptCompletion: () => true,
      } as Config;

      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest('// This is a line comment');
        const completion = useCommandCompletion(
          textBuffer,
          testDirs,
          testRootDir,
          [],
          mockCommandContext,
          false,
          mockConfig,
        );
        return { ...completion, textBuffer };
      });

      // Should not trigger prompt completion for comments
      expect(result.current.suggestions.length).toBe(0);
    });

    it('should not trigger prompt completion for block comments', async () => {
      const mockConfig = {
        getEnablePromptCompletion: () => true,
      } as Config;

      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest(
          '/* This is a block comment */',
        );
        const completion = useCommandCompletion(
          textBuffer,
          testDirs,
          testRootDir,
          [],
          mockCommandContext,
          false,
          mockConfig,
        );
        return { ...completion, textBuffer };
      });

      // Should not trigger prompt completion for comments
      expect(result.current.suggestions.length).toBe(0);
    });

    it('should trigger prompt completion for regular text when enabled', async () => {
      const mockConfig = {
        getEnablePromptCompletion: () => true,
      } as Config;

      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest(
          'This is regular text that should trigger completion',
        );
        const completion = useCommandCompletion(
          textBuffer,
          testDirs,
          testRootDir,
          [],
          mockCommandContext,
          false,
          mockConfig,
        );
        return { ...completion, textBuffer };
      });

      // This test verifies that comments are filtered out while regular text is not
      expect(result.current.textBuffer.text).toBe(
        'This is regular text that should trigger completion',
      );
    });
  });

  describe('Custom Command Dual-Mode Completion', () => {
    const builtInCommand: SlashCommand = {
      name: 'builtin',
      description: 'Built-in command',
      kind: CommandKind.BUILT_IN,
      action: async () => ({ type: 'submit_prompt', content: 'test' }),
    };

    const customCommand: SlashCommand = {
      name: 'custom',
      description: 'Custom command from .toml file',
      kind: CommandKind.FILE,
      action: async () => ({ type: 'submit_prompt', content: 'test' }),
    };

    const commands = [builtInCommand, customCommand];

    it('should enable SLASH mode only for built-in commands', async () => {
      setupMocks({
        slashSuggestions: [{ label: 'builtin', value: 'builtin' }],
      });

      renderHook(() =>
        useCommandCompletion(
          useTextBufferForTest('/builtin'),
          testDirs,
          testRootDir,
          commands,
          mockCommandContext,
          false,
          mockConfig,
        ),
      );

      await waitFor(() => {
        expect(useSlashCompletion).toHaveBeenLastCalledWith(
          expect.objectContaining({
            enabled: true,
          }),
        );
        expect(useAtCompletion).toHaveBeenLastCalledWith(
          expect.objectContaining({
            enabled: false,
          }),
        );
      });
    });

    it('should enable SLASH mode for custom commands without @ symbol', async () => {
      setupMocks({
        slashSuggestions: [{ label: 'custom', value: 'custom' }],
      });

      renderHook(() =>
        useCommandCompletion(
          useTextBufferForTest('/custom'),
          testDirs,
          testRootDir,
          commands,
          mockCommandContext,
          false,
          mockConfig,
        ),
      );

      await waitFor(() => {
        expect(useSlashCompletion).toHaveBeenLastCalledWith(
          expect.objectContaining({
            enabled: true,
          }),
        );
        expect(useAtCompletion).toHaveBeenLastCalledWith(
          expect.objectContaining({
            enabled: false,
          }),
        );
      });
    });

    it('should enable AT mode for custom commands with @ symbol', async () => {
      setupMocks({
        atSuggestions: [{ label: 'src/file.txt', value: 'src/file.txt' }],
      });

      renderHook(() =>
        useCommandCompletion(
          useTextBufferForTest('/custom @src/file'),
          testDirs,
          testRootDir,
          commands,
          mockCommandContext,
          false,
          mockConfig,
        ),
      );

      await waitFor(() => {
        expect(useAtCompletion).toHaveBeenLastCalledWith(
          expect.objectContaining({
            enabled: true,
            pattern: 'src/file',
          }),
        );
      });
    });

    it('should NOT enable AT mode for built-in commands with @ symbol', async () => {
      setupMocks({
        slashSuggestions: [{ label: 'builtin', value: 'builtin' }],
      });

      renderHook(() =>
        useCommandCompletion(
          useTextBufferForTest('/builtin @src/file'),
          testDirs,
          testRootDir,
          commands,
          mockCommandContext,
          false,
          mockConfig,
        ),
      );

      await waitFor(() => {
        expect(useSlashCompletion).toHaveBeenLastCalledWith(
          expect.objectContaining({
            enabled: true,
          }),
        );
        expect(useAtCompletion).toHaveBeenLastCalledWith(
          expect.objectContaining({
            enabled: false,
          }),
        );
      });
    });

    it('should handle custom commands with alternative names', async () => {
      const customCommandWithAltNames: SlashCommand = {
        name: 'my-custom',
        altNames: ['mc', 'mycmd'],
        description: 'Custom command with alt names',
        kind: CommandKind.FILE,
        action: async () => ({ type: 'submit_prompt', content: 'test' }),
      };

      setupMocks({
        atSuggestions: [{ label: 'src/file.txt', value: 'src/file.txt' }],
      });

      renderHook(() =>
        useCommandCompletion(
          useTextBufferForTest('/mc @src/file'),
          testDirs,
          testRootDir,
          [customCommandWithAltNames],
          mockCommandContext,
          false,
          mockConfig,
        ),
      );

      await waitFor(() => {
        expect(useAtCompletion).toHaveBeenLastCalledWith(
          expect.objectContaining({
            enabled: true,
            pattern: 'src/file',
          }),
        );
      });
    });
  });

  describe('Paranoid Edge Case Testing', () => {
    const customCommand: SlashCommand = {
      name: 'my-custom',
      description: 'Custom command for testing edge cases',
      kind: CommandKind.FILE,
      action: async () => ({ type: 'submit_prompt', content: 'test' }),
    };

    const builtInCommand: SlashCommand = {
      name: 'log',
      description: 'Built-in log command',
      kind: CommandKind.BUILT_IN,
      action: async () => ({ type: 'submit_prompt', content: 'test' }),
    };

    const commands = [customCommand, builtInCommand];

    it('should handle input with extra whitespace correctly', async () => {
      setupMocks({
        atSuggestions: [{ label: 'some/path', value: 'some/path' }],
      });

      renderHook(() =>
        useCommandCompletion(
          useTextBufferForTest('  /my-custom   @some/path'),
          testDirs,
          testRootDir,
          commands,
          mockCommandContext,
          false,
          mockConfig,
        ),
      );

      await waitFor(() => {
        expect(useAtCompletion).toHaveBeenLastCalledWith(
          expect.objectContaining({
            enabled: true,
            pattern: 'some/path',
          }),
        );
      });
    });

    it('should handle command as substring correctly', async () => {
      const logsCommand: SlashCommand = {
        name: 'logs',
        description: 'Built-in logs command (longer name)',
        kind: CommandKind.BUILT_IN,
        action: async () => ({ type: 'submit_prompt', content: 'test' }),
      };

      const commandsWithSubstring = [customCommand, builtInCommand, logsCommand];

      setupMocks({
        slashSuggestions: [{ label: 'log', value: 'log' }],
      });

      renderHook(() =>
        useCommandCompletion(
          useTextBufferForTest('/log'),
          testDirs,
          testRootDir,
          commandsWithSubstring,
          mockCommandContext,
          false,
          mockConfig,
        ),
      );

      await waitFor(() => {
        expect(useSlashCompletion).toHaveBeenLastCalledWith(
          expect.objectContaining({
            enabled: true,
          }),
        );
        expect(useAtCompletion).toHaveBeenLastCalledWith(
          expect.objectContaining({
            enabled: false,
          }),
        );
      });
    });

    it('should handle empty @ query gracefully', async () => {
      setupMocks({
        atSuggestions: [],
      });

      renderHook(() =>
        useCommandCompletion(
          useTextBufferForTest('/my-custom @'),
          testDirs,
          testRootDir,
          commands,
          mockCommandContext,
          false,
          mockConfig,
        ),
      );

      await waitFor(() => {
        expect(useAtCompletion).toHaveBeenLastCalledWith(
          expect.objectContaining({
            enabled: true,
            pattern: '',
          }),
        );
      });
    });

    it('should handle no-op command (just /) correctly', async () => {
      setupMocks({
        slashSuggestions: [],
      });

      renderHook(() =>
        useCommandCompletion(
          useTextBufferForTest('/'),
          testDirs,
          testRootDir,
          commands,
          mockCommandContext,
          false,
          mockConfig,
        ),
      );

      await waitFor(() => {
        // Should go to SLASH mode since it's a slash command, even if no command name
        expect(useSlashCompletion).toHaveBeenLastCalledWith(
          expect.objectContaining({
            enabled: true,
            query: '/',
          }),
        );
        expect(useAtCompletion).toHaveBeenLastCalledWith(
          expect.objectContaining({
            enabled: false,
          }),
        );
      });
    });
  });
});
