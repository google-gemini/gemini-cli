/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** @vitest-environment jsdom */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCommandCompletion } from './useCommandCompletion.js';
import { CommandContext } from '../commands/types.js';
import { Config } from '@google/gemini-cli-core';
import { useTextBuffer } from '../components/shared/text-buffer.js';

vi.mock('./useAtCompletion', () => ({
  useAtCompletion: vi.fn(() => ({
    suggestions: [],
    isLoadingSuggestions: false,
  })),
}));

vi.mock('./useSlashCompletion', () => ({
  useSlashCompletion: vi.fn(() => ({
    suggestions: [],
    isLoadingSuggestions: false,
    isPerfectMatch: false,
    completionStart: 0,
    completionEnd: 0,
  })),
}));

import { useAtCompletion } from './useAtCompletion.js';
import { useSlashCompletion } from './useSlashCompletion.js';

describe('useCommandCompletion', () => {
  const mockCommandContext = {} as CommandContext;
  const mockConfig = {} as Config;
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

      it('should reset state when completion mode becomes IDLE', () => {
        (useAtCompletion as vi.Mock).mockReturnValue({
          suggestions: [{ label: 'src/file.txt', value: 'src/file.txt' }],
          isLoadingSuggestions: false,
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

        // Suggestions are now available
        expect(result.current.completion.suggestions).toHaveLength(1);
        // And the panel should be visible
        expect(result.current.completion.showSuggestions).toBe(true);

        // Rerender with text that is not a completion trigger
        act(() => {
          result.current.textBuffer.replaceRangeByOffset(
            0,
            5,
            'just some text',
          );
        });

        expect(result.current.completion.showSuggestions).toBe(false);
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

      it('should call useAtCompletion with the correct query for an escaped space', () => {
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

        expect(useAtCompletion).toHaveBeenCalledWith(
          true,
          'src/a\\ file.txt',
          mockConfig,
          testRootDir,
        );
      });

      it('should correctly identify the completion context with multiple @ symbols', () => {
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

        expect(useAtCompletion).toHaveBeenCalledWith(
          true,
          'file1',
          mockConfig,
          testRootDir,
        );
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
        (useSlashCompletion as vi.Mock).mockReturnValue({
          suggestions: mockSuggestions,
          isLoadingSuggestions: false,
          isPerfectMatch: false,
        });
      });

      it('should handle navigateUp with no suggestions', () => {
        (useSlashCompletion as vi.Mock).mockReturnValue({
          suggestions: [],
          isLoadingSuggestions: false,
        });

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
        (useSlashCompletion as vi.Mock).mockReturnValue({
          suggestions: [],
          isLoadingSuggestions: false,
        });
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

      it('should navigate up through suggestions with wrap-around', () => {
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

        expect(result.current.suggestions.length).toBe(5);
        // The new useEffect sets the initial index to 0
        expect(result.current.activeSuggestionIndex).toBe(0);

        act(() => {
          result.current.navigateUp();
        });

        expect(result.current.activeSuggestionIndex).toBe(4);
      });

      it('should navigate down through suggestions with wrap-around', () => {
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

        expect(result.current.suggestions.length).toBe(5);
        act(() => {
          result.current.setActiveSuggestionIndex(4);
        });
        expect(result.current.activeSuggestionIndex).toBe(4);

        act(() => {
          result.current.navigateDown();
        });

        expect(result.current.activeSuggestionIndex).toBe(0);
      });

      it('should handle navigation with multiple suggestions', () => {
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

        expect(result.current.suggestions.length).toBe(5);
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

      it('should automatically select the first item when suggestions appear', () => {
        const { result, rerender } = renderHook(
          ({ suggestions }) => {
            (useSlashCompletion as vi.Mock).mockReturnValue({
              suggestions,
              isLoadingSuggestions: false,
            });
            return useCommandCompletion(
              useTextBufferForTest('/'),
              testDirs,
              testRootDir,
              [],
              mockCommandContext,
              false,
              mockConfig,
            );
          },
          { initialProps: { suggestions: [] } },
        );

        expect(result.current.activeSuggestionIndex).toBe(-1);

        rerender({ suggestions: mockSuggestions });

        expect(result.current.activeSuggestionIndex).toBe(0);
      });
    });
  });

  describe('handleAutocomplete', () => {
    it('should complete a partial command', () => {
      (useSlashCompletion as vi.Mock).mockReturnValue({
        suggestions: [{ label: 'memory', value: 'memory' }],
        isLoadingSuggestions: false,
        isPerfectMatch: false,
        completionStart: 1,
        completionEnd: 4,
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

      act(() => {
        result.current.handleAutocomplete(0);
      });

      expect(result.current.textBuffer.text).toBe('/memory ');
    });

    it('should complete a file path', () => {
      (useAtCompletion as vi.Mock).mockReturnValue({
        suggestions: [{ label: 'src/file1.txt', value: 'src/file1.txt' }],
        isLoadingSuggestions: false,
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

      act(() => {
        result.current.handleAutocomplete(0);
      });

      expect(result.current.textBuffer.text).toBe('@src/file1.txt ');
    });

    it('should complete a file path when cursor is not at the end of the line', () => {
      const text = '@src/fi is a good file';
      const cursorOffset = 7; // after "i"

      (useAtCompletion as vi.Mock).mockReturnValue({
        suggestions: [{ label: 'src/file1.txt', value: 'src/file1.txt' }],
        isLoadingSuggestions: false,
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

      act(() => {
        result.current.handleAutocomplete(0);
      });

      expect(result.current.textBuffer.text).toBe(
        '@src/file1.txt  is a good file',
      );
    });
  });
});
