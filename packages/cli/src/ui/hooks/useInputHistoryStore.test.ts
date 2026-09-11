/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, StrictMode } from 'react';
import { renderHook } from '../../test-utils/render.js';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useInputHistoryStore } from './useInputHistoryStore.js';
import { debugLogger } from '@google/gemini-cli-core';

describe('useInputHistoryStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with empty input history', async () => {
    const { result } = await renderHook(() => useInputHistoryStore());

    expect(result.current.inputHistory).toEqual([]);
  });

  it('should add input to history', async () => {
    const { result } = await renderHook(() => useInputHistoryStore());

    act(() => {
      result.current.addInput('test message 1');
    });

    expect(result.current.inputHistory).toEqual(['test message 1']);

    act(() => {
      result.current.addInput('test message 2');
    });

    expect(result.current.inputHistory).toEqual([
      'test message 1',
      'test message 2',
    ]);
  });

  it('should not add empty or whitespace-only inputs', async () => {
    const { result } = await renderHook(() => useInputHistoryStore());

    act(() => {
      result.current.addInput('');
    });

    expect(result.current.inputHistory).toEqual([]);

    act(() => {
      result.current.addInput('   ');
    });

    expect(result.current.inputHistory).toEqual([]);
  });

  it('should deduplicate consecutive identical messages', async () => {
    const { result } = await renderHook(() => useInputHistoryStore());

    act(() => {
      result.current.addInput('test message');
    });

    act(() => {
      result.current.addInput('test message'); // Same as previous
    });

    expect(result.current.inputHistory).toEqual(['test message']);

    act(() => {
      result.current.addInput('different message');
    });

    act(() => {
      result.current.addInput('test message'); // Same as first, but not consecutive
    });

    expect(result.current.inputHistory).toEqual([
      'test message',
      'different message',
      'test message',
    ]);
  });

  it('should initialize from logger successfully', async () => {
    const mockLogger = {
      getPreviousUserMessages: vi
        .fn()
        .mockResolvedValue(['newest', 'middle', 'oldest']),
    };

    const { result } = await renderHook(() => useInputHistoryStore());

    await act(async () => {
      await result.current.initializeFromLogger(mockLogger);
    });

    // Should reverse the order to oldest first
    expect(result.current.inputHistory).toEqual(['oldest', 'middle', 'newest']);
    expect(mockLogger.getPreviousUserMessages).toHaveBeenCalledTimes(1);
  });

  it('should handle logger initialization failure gracefully', async () => {
    const mockLogger = {
      getPreviousUserMessages: vi
        .fn()
        .mockRejectedValue(new Error('Logger error')),
    };

    const consoleSpy = vi
      .spyOn(debugLogger, 'warn')
      .mockImplementation(() => {});

    const { result } = await renderHook(() => useInputHistoryStore());

    await act(async () => {
      await result.current.initializeFromLogger(mockLogger);
    });

    expect(result.current.inputHistory).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to initialize input history from logger:',
      expect.any(Error),
    );

    consoleSpy.mockRestore();
  });

  it('should initialize only once', async () => {
    const mockLogger = {
      getPreviousUserMessages: vi
        .fn()
        .mockResolvedValue(['message1', 'message2']),
    };

    const { result } = await renderHook(() => useInputHistoryStore());

    // Call initializeFromLogger twice
    await act(async () => {
      await result.current.initializeFromLogger(mockLogger);
    });

    await act(async () => {
      await result.current.initializeFromLogger(mockLogger);
    });

    // Should be called only once
    expect(mockLogger.getPreviousUserMessages).toHaveBeenCalledTimes(1);
    expect(result.current.inputHistory).toEqual(['message2', 'message1']);
  });

  it('should handle null logger gracefully', async () => {
    const { result } = await renderHook(() => useInputHistoryStore());

    await act(async () => {
      await result.current.initializeFromLogger(null);
    });

    expect(result.current.inputHistory).toEqual([]);
  });

  it('should trim input before adding to history', async () => {
    const { result } = await renderHook(() => useInputHistoryStore());

    act(() => {
      result.current.addInput('  test message  ');
    });

    expect(result.current.inputHistory).toEqual(['test message']);
  });

  describe('deduplication logic from previous implementation', () => {
    it('should deduplicate consecutive messages from past sessions during initialization', async () => {
      const mockLogger = {
        getPreviousUserMessages: vi
          .fn()
          .mockResolvedValue([
            'message1',
            'message1',
            'message2',
            'message2',
            'message3',
          ]), // newest first with duplicates
      };

      const { result } = await renderHook(() => useInputHistoryStore());

      await act(async () => {
        await result.current.initializeFromLogger(mockLogger);
      });

      // Should deduplicate consecutive messages and reverse to oldest first
      expect(result.current.inputHistory).toEqual([
        'message3',
        'message2',
        'message1',
      ]);
    });

    it('should deduplicate across session boundaries', async () => {
      const mockLogger = {
        getPreviousUserMessages: vi.fn().mockResolvedValue(['old2', 'old1']), // newest first
      };

      const { result } = await renderHook(() => useInputHistoryStore());

      // Initialize with past session
      await act(async () => {
        await result.current.initializeFromLogger(mockLogger);
      });

      // Add current session inputs
      act(() => {
        result.current.addInput('old2'); // Same as last past session message
      });

      // Should deduplicate across session boundary
      expect(result.current.inputHistory).toEqual(['old1', 'old2']);

      act(() => {
        result.current.addInput('new1');
      });

      expect(result.current.inputHistory).toEqual(['old1', 'old2', 'new1']);
    });

    it('should preserve non-consecutive duplicates', async () => {
      const mockLogger = {
        getPreviousUserMessages: vi
          .fn()
          .mockResolvedValue(['message2', 'message1', 'message2']), // newest first with non-consecutive duplicate
      };

      const { result } = await renderHook(() => useInputHistoryStore());

      await act(async () => {
        await result.current.initializeFromLogger(mockLogger);
      });

      // Non-consecutive duplicates should be preserved
      expect(result.current.inputHistory).toEqual([
        'message2',
        'message1',
        'message2',
      ]);
    });

    it('should handle complex deduplication with current session', async () => {
      const { result } = await renderHook(() => useInputHistoryStore());

      // Add multiple messages with duplicates
      act(() => {
        result.current.addInput('hello');
      });
      act(() => {
        result.current.addInput('hello'); // consecutive duplicate
      });
      act(() => {
        result.current.addInput('world');
      });
      act(() => {
        result.current.addInput('world'); // consecutive duplicate
      });
      act(() => {
        result.current.addInput('hello'); // non-consecutive duplicate
      });

      // Should have deduplicated consecutive ones
      expect(result.current.inputHistory).toEqual(['hello', 'world', 'hello']);
    });

    it('should maintain oldest-first order in final output', async () => {
      const mockLogger = {
        getPreviousUserMessages: vi
          .fn()
          .mockResolvedValue(['newest', 'middle', 'oldest']), // newest first
      };

      const { result } = await renderHook(() => useInputHistoryStore());

      await act(async () => {
        await result.current.initializeFromLogger(mockLogger);
      });

      // Add current session messages
      act(() => {
        result.current.addInput('current1');
      });
      act(() => {
        result.current.addInput('current2');
      });

      // Should maintain oldest-first order
      expect(result.current.inputHistory).toEqual([
        'oldest',
        'middle',
        'newest',
        'current1',
        'current2',
      ]);
    });
  });

  describe('state updates stay outside updater functions', () => {
    // React may call an updater more than once for a single update (StrictMode
    // double-invoke, replays under batching). addInput used to nest a
    // setPastSessionMessages call inside the current-session updater and run
    // recalculateHistory - itself a setState - from there. The resulting
    // history happened to be idempotent, so the tests below pin both the
    // history and the render count, which is what the nesting actually cost.

    it('does not schedule extra renders per submit under StrictMode', async () => {
      const renders: string[][] = [];
      const { result } = await renderHook(
        () => {
          const store = useInputHistoryStore();
          renders.push(store.inputHistory);
          return store;
        },
        { wrapper: StrictMode as never },
      );

      const before = renders.length;
      act(() => {
        result.current.addInput('only once');
      });
      const rendersForOneSubmit = renders.length - before;

      expect(result.current.inputHistory).toEqual(['only once']);
      // The nested-updater version queued a redundant past-messages update on
      // top of the history update, costing an extra render pass per submit.
      expect(rendersForOneSubmit).toBeLessThanOrEqual(2);
    });

    it('does not grow the render cost as submits accumulate', async () => {
      // addInput only writes the history state now. Should a redundant
      // per-submit state write reappear, the extra dispatch shows up here.
      const renders: string[][] = [];
      const { result } = await renderHook(
        () => {
          const store = useInputHistoryStore();
          renders.push(store.inputHistory);
          return store;
        },
        { wrapper: StrictMode as never },
      );

      const first = renders.length;
      act(() => {
        result.current.addInput('one');
      });
      const costOfFirst = renders.length - first;

      const second = renders.length;
      act(() => {
        result.current.addInput('two');
      });
      const costOfSecond = renders.length - second;

      expect(result.current.inputHistory).toEqual(['one', 'two']);
      expect(costOfSecond).toBeLessThanOrEqual(costOfFirst);
    });

    it('keeps every submit when several are batched into one update', async () => {
      const { result } = await renderHook(() => useInputHistoryStore(), {
        wrapper: StrictMode as never,
      });

      // Same act() means all three updates are queued together, which is what
      // makes an updater-nested update fire once per queued outer update.
      act(() => {
        result.current.addInput('a');
        result.current.addInput('b');
        result.current.addInput('c');
      });

      expect(result.current.inputHistory).toEqual(['a', 'b', 'c']);
    });

    it('keeps past messages visible after batched submits', async () => {
      const mockLogger = {
        getPreviousUserMessages: vi.fn().mockResolvedValue(['past2', 'past1']),
      };

      const { result } = await renderHook(() => useInputHistoryStore(), {
        wrapper: StrictMode as never,
      });

      await act(async () => {
        await result.current.initializeFromLogger(mockLogger);
      });

      act(() => {
        result.current.addInput('new1');
        result.current.addInput('new2');
      });

      expect(result.current.inputHistory).toEqual([
        'past1',
        'past2',
        'new1',
        'new2',
      ]);
    });

    it('still deduplicates consecutive duplicates across batched submits', async () => {
      const { result } = await renderHook(() => useInputHistoryStore(), {
        wrapper: StrictMode as never,
      });

      act(() => {
        result.current.addInput('same');
        result.current.addInput('same');
        result.current.addInput('other');
      });

      expect(result.current.inputHistory).toEqual(['same', 'other']);
    });
  });
});
