/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { renderHookWithProviders } from '../../test-utils/render.js';
import { useReverseSearchCompletion } from './useReverseSearchCompletion.js';
import { useTextBuffer } from '../components/shared/text-buffer.js';

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
    it('does not cause state updates or timeouts when reverseSearchActive is false', async () => {
      const history = ['alpha', 'beta'];

      const { result, rerender } = await renderHookWithProviders(
        ({ active }) => {
          const textBuffer = useTextBufferForTest('');
          return {
            search: useReverseSearchCompletion(textBuffer, history, active),
            buffer: textBuffer,
          };
        },
        { initialProps: { active: false } },
      );

      // Typing while inactive should NOT update debounced search state.
      // We change text to 'a', advance time past the debounce period (100ms),
      // and ensure suggestions remain empty because the debounced value never changed.
      act(() => {
        result.current.buffer.setText('a');
      });

      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(result.current.search.suggestions).toEqual([]);

      // Activating reverse search and setting text to 'alpha' forces useDebouncedValue
      // to receive 'alpha', scheduling the timeout.
      act(() => {
        result.current.buffer.setText('alpha');
      });
      rerender({ active: true });

      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(result.current.search.suggestions.map((s) => s.value)).toEqual([
        'alpha',
      ]);
    });
  });
});
