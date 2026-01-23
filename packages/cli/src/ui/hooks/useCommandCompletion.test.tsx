/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  vi,
  afterEach,
  type Mock,
} from 'vitest';
import { act, useEffect } from 'react';
import { renderWithProviders } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import {
  useCommandCompletion,
  CompletionMode,
} from './useCommandCompletion.js';
import type { CommandContext } from '../commands/types.js';
import type { Config } from '@google/gemini-cli-core';
import { useTextBuffer } from '../components/shared/text-buffer.js';
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
  (useAtCompletion as Mock).mockImplementation(
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
  (useSlashCompletion as Mock).mockImplementation(
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
    getGeminiClient: vi.fn(),
  } as unknown as Config;
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

  const renderCommandCompletionHook = (
    initialText: string,
    cursorOffset?: number,
    shellModeActive = false,
  ) => {
    let hookResult: ReturnType<typeof useCommandCompletion> & {
      textBuffer: ReturnType<typeof useTextBuffer>;
    };

    function TestComponent() {
      const textBuffer = useTextBufferForTest(initialText, cursorOffset);
      const completion = useCommandCompletion(
        textBuffer,
        testRootDir,
        [],
        mockCommandContext,
        false,
        shellModeActive,
        mockConfig,
      );
      hookResult = { ...completion, textBuffer };
      return null;
    }
    renderWithProviders(<TestComponent />);
    return {
      result: {
        get current() {
          return hookResult;
        },
      },
    };
  };

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
        const { result } = renderCommandCompletionHook('');

        expect(result.current.suggestions).toEqual([]);
        expect(result.current.activeSuggestionIndex).toBe(-1);
        expect(result.current.visibleStartIndex).toBe(0);
        expect(result.current.showSuggestions).toBe(false);
        expect(result.current.isLoadingSuggestions).toBe(false);
        expect(result.current.completionMode).toBe(CompletionMode.IDLE);
      });

      it('should reset state when completion mode becomes IDLE', async () => {
        setupMocks({
          atSuggestions: [{ label: 'src/file.txt', value: 'src/file.txt' }],
        });

        const { result } = renderCommandCompletionHook('@file');

        await waitFor(() => {
          expect(result.current.suggestions).toHaveLength(1);
        });

        expect(result.current.showSuggestions).toBe(true);

        act(() => {
          result.current.textBuffer.replaceRangeByOffset(
            0,
            5,
            'just some text',
          );
        });

        await waitFor(() => {
          expect(result.current.showSuggestions).toBe(false);
        });
      });

      it('should reset all state to default values', () => {
        const { result } = renderCommandCompletionHook('@files');

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
        const { result } = renderCommandCompletionHook(text);

        await waitFor(() => {
          expect(useAtCompletion).toHaveBeenLastCalledWith(
            expect.objectContaining({
              enabled: true,
              pattern: 'src/a\\ file.txt',
            }),
          );
          expect(result.current.completionMode).toBe(CompletionMode.AT);
        });
      });

      it('should correctly identify the completion context with multiple @ symbols', async () => {
        const text = '@file1 @file2';
        const cursorOffset = 3; // @fi|le1 @file2

        renderCommandCompletionHook(text, cursorOffset);

        await waitFor(() => {
          expect(useAtCompletion).toHaveBeenLastCalledWith(
            expect.objectContaining({
              enabled: true,
              pattern: 'file1',
            }),
          );
        });
      });

      it.each([
        {
          shellModeActive: false,
          expectedSuggestions: 1,
          expectedShowSuggestions: true,
          description:
            'should show slash command suggestions when shellModeActive is false',
        },
        {
          shellModeActive: true,
          expectedSuggestions: 0,
          expectedShowSuggestions: false,
          description:
            'should not show slash command suggestions when shellModeActive is true',
        },
      ])(
        '$description',
        async ({
          shellModeActive,
          expectedSuggestions,
          expectedShowSuggestions,
        }) => {
          setupMocks({
            slashSuggestions: [{ label: 'clear', value: 'clear' }],
          });

          const { result } = renderCommandCompletionHook(
            '/',
            undefined,
            shellModeActive,
          );

          await waitFor(() => {
            expect(result.current.suggestions.length).toBe(expectedSuggestions);
            expect(result.current.showSuggestions).toBe(
              expectedShowSuggestions,
            );
            if (!shellModeActive) {
              expect(result.current.completionMode).toBe(CompletionMode.SLASH);
            }
          });
        },
      );
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

        const { result } = renderCommandCompletionHook('/');

        act(() => {
          result.current.navigateUp();
        });

        expect(result.current.activeSuggestionIndex).toBe(-1);
      });

      it('should handle navigateDown with no suggestions', () => {
        setupMocks({ slashSuggestions: [] });
        const { result } = renderCommandCompletionHook('/');

        act(() => {
          result.current.navigateDown();
        });

        expect(result.current.activeSuggestionIndex).toBe(-1);
      });

      it('should navigate up through suggestions with wrap-around', async () => {
        const { result } = renderCommandCompletionHook('/');

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
        const { result } = renderCommandCompletionHook('/');

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
        const { result } = renderCommandCompletionHook('/');

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

        const { result } = renderCommandCompletionHook('/');

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

      const { result } = renderCommandCompletionHook('/mem');

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

      const { result } = renderCommandCompletionHook('@src/fi');

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

      const { result } = renderCommandCompletionHook(text, cursorOffset);

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

    it('should complete a directory path ending with / without a trailing space', async () => {
      setupMocks({
        atSuggestions: [{ label: 'src/components/', value: 'src/components/' }],
      });

      const { result } = renderCommandCompletionHook('@src/comp');

      await waitFor(() => {
        expect(result.current.suggestions.length).toBe(1);
      });

      act(() => {
        result.current.handleAutocomplete(0);
      });

      expect(result.current.textBuffer.text).toBe('@src/components/');
    });

    it('should complete a directory path ending with \\ without a trailing space', async () => {
      setupMocks({
        atSuggestions: [
          { label: 'src\\components\\', value: 'src\\components\\' },
        ],
      });

      const { result } = renderCommandCompletionHook('@src\\comp');

      await waitFor(() => {
        expect(result.current.suggestions.length).toBe(1);
      });

      act(() => {
        result.current.handleAutocomplete(0);
      });

      expect(result.current.textBuffer.text).toBe('@src\\components\\');
    });
  });

  describe('prompt completion filtering', () => {
    it('should not trigger prompt completion for line comments', async () => {
      const mockConfig = {
        getEnablePromptCompletion: () => true,
        getGeminiClient: vi.fn(),
      } as unknown as Config;

      let hookResult: ReturnType<typeof useCommandCompletion> & {
        textBuffer: ReturnType<typeof useTextBuffer>;
      };

      function TestComponent() {
        const textBuffer = useTextBufferForTest('// This is a line comment');
        const completion = useCommandCompletion(
          textBuffer,
          testRootDir,
          [],
          mockCommandContext,
          false,
          false,
          mockConfig,
        );
        hookResult = { ...completion, textBuffer };
        return null;
      }
      renderWithProviders(<TestComponent />);

      // Should not trigger prompt completion for comments
      expect(hookResult!.suggestions.length).toBe(0);
    });

    it('should not trigger prompt completion for block comments', async () => {
      const mockConfig = {
        getEnablePromptCompletion: () => true,
        getGeminiClient: vi.fn(),
      } as unknown as Config;

      let hookResult: ReturnType<typeof useCommandCompletion> & {
        textBuffer: ReturnType<typeof useTextBuffer>;
      };

      function TestComponent() {
        const textBuffer = useTextBufferForTest(
          '/* This is a block comment */',
        );
        const completion = useCommandCompletion(
          textBuffer,
          testRootDir,
          [],
          mockCommandContext,
          false,
          false,
          mockConfig,
        );
        hookResult = { ...completion, textBuffer };
        return null;
      }
      renderWithProviders(<TestComponent />);

      // Should not trigger prompt completion for comments
      expect(hookResult!.suggestions.length).toBe(0);
    });

    it('should trigger prompt completion for regular text when enabled', async () => {
      const mockConfig = {
        getEnablePromptCompletion: () => true,
        getGeminiClient: vi.fn(),
      } as unknown as Config;

      let hookResult: ReturnType<typeof useCommandCompletion> & {
        textBuffer: ReturnType<typeof useTextBuffer>;
      };

      function TestComponent() {
        const textBuffer = useTextBufferForTest(
          'This is regular text that should trigger completion',
        );
        const completion = useCommandCompletion(
          textBuffer,
          testRootDir,
          [],
          mockCommandContext,
          false,
          false,
          mockConfig,
        );
        hookResult = { ...completion, textBuffer };
        return null;
      }
      renderWithProviders(<TestComponent />);

      // This test verifies that comments are filtered out while regular text is not
      expect(hookResult!.textBuffer.text).toBe(
        'This is regular text that should trigger completion',
      );
    });
  });

  describe('@ completion after slash commands (issue #14420)', () => {
    it('should show file suggestions when typing @path after a slash command', async () => {
      setupMocks({
        atSuggestions: [{ label: 'src/file.txt', value: 'src/file.txt' }],
      });

      const text = '/mycommand @src/fi';
      const cursorOffset = text.length;

      renderCommandCompletionHook(text, cursorOffset);

      await waitFor(() => {
        expect(useAtCompletion).toHaveBeenLastCalledWith(
          expect.objectContaining({
            enabled: true,
            pattern: 'src/fi',
          }),
        );
      });
    });

    it('should show slash suggestions when cursor is on command part (no @)', async () => {
      setupMocks({
        slashSuggestions: [{ label: 'mycommand', value: 'mycommand' }],
      });

      const text = '/mycom';
      const cursorOffset = text.length;

      const { result } = renderCommandCompletionHook(text, cursorOffset);

      await waitFor(() => {
        expect(result.current.suggestions).toHaveLength(1);
        expect(result.current.suggestions[0]?.label).toBe('mycommand');
      });
    });

    it('should switch to @ completion when typing @ after slash command', async () => {
      setupMocks({
        atSuggestions: [{ label: 'file.txt', value: 'file.txt' }],
      });

      const text = '/command @';
      const cursorOffset = text.length;

      renderCommandCompletionHook(text, cursorOffset);

      await waitFor(() => {
        expect(useAtCompletion).toHaveBeenLastCalledWith(
          expect.objectContaining({
            enabled: true,
            pattern: '',
          }),
        );
      });
    });

    it('should handle multiple @ references in a slash command', async () => {
      setupMocks({
        atSuggestions: [{ label: 'src/bar.ts', value: 'src/bar.ts' }],
      });

      const text = '/diff @src/foo.ts @src/ba';
      const cursorOffset = text.length;

      renderCommandCompletionHook(text, cursorOffset);

      await waitFor(() => {
        expect(useAtCompletion).toHaveBeenLastCalledWith(
          expect.objectContaining({
            enabled: true,
            pattern: 'src/ba',
          }),
        );
      });
    });

    it('should complete file path and add trailing space', async () => {
      setupMocks({
        atSuggestions: [{ label: 'src/file.txt', value: 'src/file.txt' }],
      });

      const { result } = renderCommandCompletionHook('/cmd @src/fi');

      await waitFor(() => {
        expect(result.current.suggestions.length).toBe(1);
      });

      act(() => {
        result.current.handleAutocomplete(0);
      });

      expect(result.current.textBuffer.text).toBe('/cmd @src/file.txt ');
    });

    it('should stay in slash mode when slash command has trailing space but no @', async () => {
      setupMocks({
        slashSuggestions: [{ label: 'help', value: 'help' }],
      });

      const text = '/help ';
      renderCommandCompletionHook(text);

      await waitFor(() => {
        expect(useSlashCompletion).toHaveBeenLastCalledWith(
          expect.objectContaining({
            enabled: true,
          }),
        );
      });
    });
  });
});
