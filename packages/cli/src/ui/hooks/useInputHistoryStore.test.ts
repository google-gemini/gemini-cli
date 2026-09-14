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

  /**
   * StrictMode invokes a `setState` updater twice on purpose, to surface
   * updaters that are not pure. The store used to call `setPastSessionMessages`
   * (and through it `recalculateHistory` -> `setInputHistory`) from inside the
   * `setCurrentSessionMessages` updater, so the double invocation ran the
   * recalculation twice against a stale past session and the Up-arrow history
   * came out wrong (#29313).
   */
  describe('under StrictMode', () => {
    const renderStrict = () =>
      renderHook(() => useInputHistoryStore(), { wrapper: StrictMode });

    it('keeps the history of two inputs in order, without repeats', async () => {
      const { result } = await renderStrict();

      act(() => {
        result.current.addInput('first');
      });
      act(() => {
        result.current.addInput('second');
      });

      expect(result.current.inputHistory).toEqual(['first', 'second']);
    });

    it('keeps a non-consecutive repeat that the user really typed twice', async () => {
      const { result } = await renderStrict();

      act(() => {
        result.current.addInput('ls');
      });
      act(() => {
        result.current.addInput('cd ..');
      });
      act(() => {
        result.current.addInput('ls');
      });

      expect(result.current.inputHistory).toEqual(['ls', 'cd ..', 'ls']);
    });

    it('keeps the past session behind the current one', async () => {
      const { result } = await renderStrict();
      const logger = {
        getPreviousUserMessages: vi.fn().mockResolvedValue(['old-2', 'old-1']),
      };

      await act(async () => {
        await result.current.initializeFromLogger(logger);
      });
      act(() => {
        result.current.addInput('new');
      });

      expect(result.current.inputHistory).toEqual(['old-1', 'old-2', 'new']);
    });

    it('reads the logger once, however many times the effect runs', async () => {
      const { result } = await renderStrict();
      const logger = {
        getPreviousUserMessages: vi.fn().mockResolvedValue(['old']),
      };

      await act(async () => {
        await result.current.initializeFromLogger(logger);
        await result.current.initializeFromLogger(logger);
      });

      expect(logger.getPreviousUserMessages).toHaveBeenCalledTimes(1);
    });

    it('reads the logger once even when both calls are still in flight', async () => {
      // StrictMode fires the effect twice before the first `await` resolves,
      // so a guard that is only set after the read is no guard at all.
      const { result } = await renderStrict();
      const logger = {
        getPreviousUserMessages: vi.fn().mockResolvedValue(['old']),
      };

      await act(async () => {
        await Promise.all([
          result.current.initializeFromLogger(logger),
          result.current.initializeFromLogger(logger),
        ]);
      });

      expect(logger.getPreviousUserMessages).toHaveBeenCalledTimes(1);
    });

    it('keeps several inputs typed before the logger answered, in order', async () => {
      // `recalculateHistory` wants the current session newest-first. One input
      // reads the same either way, which is why a single-input cell missed an
      // initialization that passed it oldest-first.
      const { result } = await renderStrict();
      const logger = {
        getPreviousUserMessages: vi.fn().mockResolvedValue(['old']),
      };

      act(() => {
        result.current.addInput('typed-1');
      });
      act(() => {
        result.current.addInput('typed-2');
      });
      await act(async () => {
        await result.current.initializeFromLogger(logger);
      });

      expect(result.current.inputHistory).toEqual([
        'old',
        'typed-1',
        'typed-2',
      ]);
    });

    it('keeps an input typed before the logger answered', async () => {
      // The logger read is async, and the user can type while it is in flight.
      const { result } = await renderStrict();
      const logger = {
        getPreviousUserMessages: vi.fn().mockResolvedValue(['old']),
      };

      act(() => {
        result.current.addInput('typed-first');
      });
      await act(async () => {
        await result.current.initializeFromLogger(logger);
      });

      expect(result.current.inputHistory).toEqual(['old', 'typed-first']);
    });
  });

  it('keeps several inputs typed before the logger answered, in order', async () => {
    const { result } = await renderHook(() => useInputHistoryStore());
    const logger = {
      getPreviousUserMessages: vi.fn().mockResolvedValue(['old']),
    };

    act(() => {
      result.current.addInput('typed-1');
    });
    act(() => {
      result.current.addInput('typed-2');
    });
    await act(async () => {
      await result.current.initializeFromLogger(logger);
    });

    expect(result.current.inputHistory).toEqual(['old', 'typed-1', 'typed-2']);
  });

  it('keeps an input typed before the logger answered, StrictMode or not', async () => {
    // Not a StrictMode problem: the logger read is async in every run, and
    // initialization used to recalculate from an empty current session, so
    // anything typed while it was in flight was dropped from the history.
    const { result } = await renderHook(() => useInputHistoryStore());
    const logger = {
      getPreviousUserMessages: vi.fn().mockResolvedValue(['old']),
    };

    act(() => {
      result.current.addInput('typed-first');
    });
    await act(async () => {
      await result.current.initializeFromLogger(logger);
    });

    expect(result.current.inputHistory).toEqual(['old', 'typed-first']);
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
});
