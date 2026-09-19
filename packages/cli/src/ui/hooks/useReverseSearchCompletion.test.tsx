/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import {
  renderHookWithProviders,
  renderWithProviders,
} from '../../test-utils/render.js';
import { useReverseSearchCompletion } from './useReverseSearchCompletion.js';
import { useTextBuffer } from '../components/shared/text-buffer.js';
import { SuggestionsDisplay } from '../components/SuggestionsDisplay.js';

describe('useReverseSearchCompletion', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function useTextBufferForTest(text: string) {
    return useTextBuffer({
      initialText: text,
      initialCursorOffset: text.length,
      viewport: { width: 80, height: 20 },
      onChange: () => {},
    });
  }

  describe('Core Hook Behavior', () => {
    describe('State Management', () => {
      it('should initialize with default state', async () => {
        const mockShellHistory = ['echo hello'];

        const { result } = await renderHookWithProviders(() =>
          useReverseSearchCompletion(
            useTextBufferForTest(''),
            mockShellHistory,
            false,
          ),
        );

        expect(result.current.suggestions).toEqual([]);
        expect(result.current.activeSuggestionIndex).toBe(-1);
        expect(result.current.visibleStartIndex).toBe(0);
        expect(result.current.showSuggestions).toBe(false);
        expect(result.current.isLoadingSuggestions).toBe(false);
      });

      it('should reset state when reverseSearchActive becomes false', async () => {
        const mockShellHistory = ['echo hello'];
        const { result, rerender } = await renderHookWithProviders(
          ({ text, active }) => {
            const textBuffer = useTextBufferForTest(text);
            return useReverseSearchCompletion(
              textBuffer,
              mockShellHistory,
              active,
            );
          },
          { initialProps: { text: 'echo', active: true } },
        );

        // Simulate reverseSearchActive becoming false
        rerender({ text: 'echo', active: false });

        expect(result.current.suggestions).toEqual([]);
        expect(result.current.activeSuggestionIndex).toBe(-1);
        expect(result.current.visibleStartIndex).toBe(0);
        expect(result.current.showSuggestions).toBe(false);
      });

      describe('Navigation', () => {
        it('should handle navigateUp with no suggestions', async () => {
          const mockShellHistory = ['echo hello'];

          const { result } = await renderHookWithProviders(() =>
            useReverseSearchCompletion(
              useTextBufferForTest('grep'),
              mockShellHistory,
              true,
            ),
          );

          act(() => {
            result.current.navigateUp();
          });

          expect(result.current.activeSuggestionIndex).toBe(-1);
        });

        it('should handle navigateDown with no suggestions', async () => {
          const mockShellHistory = ['echo hello'];
          const { result } = await renderHookWithProviders(() =>
            useReverseSearchCompletion(
              useTextBufferForTest('grep'),
              mockShellHistory,
              true,
            ),
          );

          act(() => {
            result.current.navigateDown();
          });

          expect(result.current.activeSuggestionIndex).toBe(-1);
        });

        it('should navigate up through suggestions with wrap-around', async () => {
          const mockShellHistory = [
            'ls -l',
            'ls -la',
            'cd /some/path',
            'git status',
            'echo "Hello, World!"',
            'echo Hi',
          ];

          const { result } = await renderHookWithProviders(() =>
            useReverseSearchCompletion(
              useTextBufferForTest('echo'),
              mockShellHistory,
              true,
            ),
          );

          expect(result.current.suggestions.length).toBe(2);
          expect(result.current.activeSuggestionIndex).toBe(0);

          act(() => {
            result.current.navigateUp();
          });

          expect(result.current.activeSuggestionIndex).toBe(1);
        });

        it('should navigate down through suggestions with wrap-around', async () => {
          const mockShellHistory = [
            'ls -l',
            'ls -la',
            'cd /some/path',
            'git status',
            'echo "Hello, World!"',
            'echo Hi',
          ];
          const { result } = await renderHookWithProviders(() =>
            useReverseSearchCompletion(
              useTextBufferForTest('ls'),
              mockShellHistory,
              true,
            ),
          );

          expect(result.current.suggestions.length).toBe(2);
          expect(result.current.activeSuggestionIndex).toBe(0);

          act(() => {
            result.current.navigateDown();
          });

          expect(result.current.activeSuggestionIndex).toBe(1);
        });

        it('should handle navigation with multiple suggestions', async () => {
          const mockShellHistory = [
            'ls -l',
            'ls -la',
            'cd /some/path/l',
            'git status',
            'echo "Hello, World!"',
            'echo "Hi all"',
          ];

          const { result } = await renderHookWithProviders(() =>
            useReverseSearchCompletion(
              useTextBufferForTest('l'),
              mockShellHistory,
              true,
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

        it('should handle navigation with large suggestion lists and scrolling', async () => {
          const largeMockCommands = Array.from(
            { length: 15 },
            (_, i) => `echo ${i}`,
          );

          const { result } = await renderHookWithProviders(() =>
            useReverseSearchCompletion(
              useTextBufferForTest('echo'),
              largeMockCommands,
              true,
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
  });

  describe('Filtering', () => {
    it.each([
      ['echo İ abc', 'abc', 'abc'],
      ['echo İ abc', 'i\u0307', 'İ'],
      ['echo i\u0307 abc', 'İ', 'i\u0307'],
    ])(
      'highlights the original match in %j for %j',
      async (label, query, expected) => {
        const history = [label];

        function ReverseSearchHistory() {
          const completion = useReverseSearchCompletion(
            useTextBufferForTest(query),
            history,
            true,
          );

          return (
            <SuggestionsDisplay
              suggestions={completion.suggestions}
              activeIndex={completion.activeSuggestionIndex}
              isLoading={completion.isLoadingSuggestions}
              width={80}
              scrollOffset={completion.visibleStartIndex}
              userInput={query}
              mode="reverse"
            />
          );
        }

        const rendered = await renderWithProviders(<ReverseSearchHistory />);
        await rendered.waitUntilReady();
        await expect(rendered).toMatchSvgSnapshot();
        expect(rendered.lastFrame()).toContain(history[0]);

        const highlighted: string[] = [];
        const buffer = rendered.terminal.buffer.active;
        for (let row = 0; row < buffer.length; row++) {
          const line = buffer.getLine(row);
          if (!line) continue;
          for (let column = 0; column < line.length; column++) {
            const cell = line.getCell(column);
            if (cell?.isInverse()) highlighted.push(cell.getChars());
          }
        }
        expect(highlighted.join('')).toBe(expected);
        rendered.unmount();
      },
    );

    it.each([
      ['echo İ abc', 'ABC', 7, 3],
      ['İİ abc', 'abc', 3, 3],
      ['echo İX', 'i\u0307x', 5, 2],
      ['echo İ abc', '\u0307', 5, 1],
      ['😀 İ ABC', 'abc', 5, 3],
      ['ΟΣ ABC', 'ος', 0, 2],
      ['ΟΣΑ ABC', 'οσα', 0, 3],
      ['echo a.b [x]', 'a.b', 5, 3],
    ])(
      'preserves the matching span in %j for %j',
      async (label, query, matchedIndex, matchedLength) => {
        const history = [label];
        const { result, unmount } = await renderHookWithProviders(() =>
          useReverseSearchCompletion(
            useTextBufferForTest(query),
            history,
            true,
          ),
        );

        expect(result.current.suggestions).toEqual([
          { label, value: label, matchedIndex, matchedLength },
        ]);
        unmount();
      },
    );

    it('preserves case-insensitive matching while narrowing cached results', async () => {
      const history = ['echo İ ABC', 'echo İ ABD', 'echo AB', 'nothing'];
      const { result, unmount } = await renderHookWithProviders(() => {
        const buffer = useTextBufferForTest('a');
        const completion = useReverseSearchCompletion(buffer, history, true);
        return { buffer, completion };
      });

      expect(result.current.completion.suggestions.map((s) => s.value)).toEqual(
        history.slice(0, 3),
      );
      await act(async () => {
        result.current.buffer.setText('ABC');
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      expect(result.current.completion.suggestions).toEqual([
        {
          label: history[0],
          value: history[0],
          matchedIndex: 7,
          matchedLength: 3,
        },
      ]);
      unmount();
    });

    it('filters history by buffer.text and sets showSuggestions', async () => {
      const history = ['foo', 'barfoo', 'baz'];
      const { result } = await renderHookWithProviders(() =>
        useReverseSearchCompletion(useTextBufferForTest('foo'), history, true),
      );

      // should only return the two entries containing "foo"
      expect(result.current.suggestions.map((s) => s.value)).toEqual([
        'foo',
        'barfoo',
      ]);
      expect(result.current.showSuggestions).toBe(true);
    });

    it('hides suggestions when there are no matches', async () => {
      const history = ['alpha', 'beta'];
      const { result } = await renderHookWithProviders(() =>
        useReverseSearchCompletion(useTextBufferForTest('γ'), history, true),
      );

      expect(result.current.suggestions).toEqual([]);
      expect(result.current.showSuggestions).toBe(false);
    });
  });
});
