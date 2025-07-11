/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRef, useCallback, useEffect, useState } from 'react';
import { StreamingState } from './types.js';
import { CLEAR_QUEUE_SIGNAL } from './constants.js';

function useConcurrentInputLogic(
  submitQuery: (input: string) => void,
  streamingState: StreamingState = StreamingState.Idle,
  initError: boolean = false,
) {
  const isSubmittingRef = useRef(false);
  const [queuedInput, setQueuedInput] = useState<string | null>(null);

  const handleFinalSubmit = useCallback(
    (submittedValue: string) => {
      const trimmedValue = submittedValue.trim();

      if (trimmedValue === CLEAR_QUEUE_SIGNAL) {
        setQueuedInput(null);
        return;
      }

      if (trimmedValue.length > 0) {
        if (
          streamingState === StreamingState.Idle &&
          !isSubmittingRef.current
        ) {
          isSubmittingRef.current = true;
          submitQuery(trimmedValue);
        } else {
          setQueuedInput(trimmedValue);
        }
      }
    },
    [submitQuery, streamingState],
  );

  useEffect(() => {
    if (streamingState === StreamingState.Idle && queuedInput && !initError) {
      isSubmittingRef.current = true;
      const inputToSubmit = queuedInput;
      setQueuedInput(null);
      submitQuery(inputToSubmit);
    }
  }, [streamingState, queuedInput, initError, submitQuery]);

  useEffect(() => {
    if (streamingState === StreamingState.Idle) {
      isSubmittingRef.current = false;
    }
  }, [streamingState]);

  return {
    handleFinalSubmit,
    queuedInput,
    isSubmittingRef,
  };
}

describe('Concurrent Input Logic', () => {
  let mockSubmitQuery: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSubmitQuery = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleFinalSubmit', () => {
    it('should submit immediately when AI is idle and not already submitting', () => {
      const { result } = renderHook(() =>
        useConcurrentInputLogic(mockSubmitQuery, StreamingState.Idle),
      );

      act(() => {
        result.current.handleFinalSubmit('test input');
      });

      expect(mockSubmitQuery).toHaveBeenCalledWith('test input');
      expect(result.current.queuedInput).toBeNull();
      expect(result.current.isSubmittingRef.current).toBe(true);
    });

    it('should queue input when AI is busy', () => {
      const { result } = renderHook(() =>
        useConcurrentInputLogic(mockSubmitQuery, StreamingState.Responding),
      );

      act(() => {
        result.current.handleFinalSubmit('queued input');
      });

      expect(mockSubmitQuery).not.toHaveBeenCalled();
      expect(result.current.queuedInput).toBe('queued input');
    });

    it('should clear queued input when CLEAR_QUEUE_SIGNAL is received', () => {
      const { result } = renderHook(() =>
        useConcurrentInputLogic(mockSubmitQuery, StreamingState.Responding),
      );

      act(() => {
        result.current.handleFinalSubmit('queued input');
      });

      expect(result.current.queuedInput).toBe('queued input');

      act(() => {
        result.current.handleFinalSubmit(CLEAR_QUEUE_SIGNAL);
      });

      expect(result.current.queuedInput).toBeNull();
      expect(mockSubmitQuery).not.toHaveBeenCalled();
    });

    it('should not submit empty or whitespace-only input', () => {
      const { result } = renderHook(() =>
        useConcurrentInputLogic(mockSubmitQuery, StreamingState.Idle),
      );

      act(() => {
        result.current.handleFinalSubmit('   ');
      });

      expect(mockSubmitQuery).not.toHaveBeenCalled();
      expect(result.current.queuedInput).toBeNull();
    });

    it('should prevent race condition - queue input if already submitting', () => {
      const { result } = renderHook(() =>
        useConcurrentInputLogic(mockSubmitQuery, StreamingState.Idle),
      );

      act(() => {
        result.current.handleFinalSubmit('first input');
      });

      expect(result.current.isSubmittingRef.current).toBe(true);

      act(() => {
        result.current.handleFinalSubmit('second input');
      });

      expect(mockSubmitQuery).toHaveBeenCalledTimes(2);
      expect(mockSubmitQuery).toHaveBeenNthCalledWith(1, 'first input');
      expect(mockSubmitQuery).toHaveBeenNthCalledWith(2, 'second input');
    });
  });

  describe('queued input processing', () => {
    it('should process queued input when AI becomes idle', () => {
      const { result, rerender } = renderHook(
        ({ streamingState }) =>
          useConcurrentInputLogic(mockSubmitQuery, streamingState),
        {
          initialProps: { streamingState: StreamingState.Responding },
        },
      );

      act(() => {
        result.current.handleFinalSubmit('queued input');
      });

      expect(result.current.queuedInput).toBe('queued input');
      expect(mockSubmitQuery).not.toHaveBeenCalled();

      rerender({ streamingState: StreamingState.Idle });

      expect(mockSubmitQuery).toHaveBeenCalledWith('queued input');
      expect(result.current.queuedInput).toBeNull();
      expect(result.current.isSubmittingRef.current).toBe(false);
    });

    it('should not process queued input if there is none', () => {
      const { rerender } = renderHook(
        ({ streamingState }) =>
          useConcurrentInputLogic(mockSubmitQuery, streamingState),
        {
          initialProps: { streamingState: StreamingState.Responding },
        },
      );

      rerender({ streamingState: StreamingState.Idle });

      expect(mockSubmitQuery).not.toHaveBeenCalled();
    });
  });

  describe('submission lock', () => {
    it('should reset lock when AI becomes idle', () => {
      const { result, rerender } = renderHook(
        ({ streamingState }) =>
          useConcurrentInputLogic(mockSubmitQuery, streamingState),
        {
          initialProps: { streamingState: StreamingState.Responding },
        },
      );

      act(() => {
        result.current.isSubmittingRef.current = true;
      });

      expect(result.current.isSubmittingRef.current).toBe(true);

      rerender({ streamingState: StreamingState.Idle });

      expect(result.current.isSubmittingRef.current).toBe(false);
    });

    it('should handle multiple state transitions correctly', () => {
      const { result, rerender } = renderHook(
        ({ streamingState }) =>
          useConcurrentInputLogic(mockSubmitQuery, streamingState),
        {
          initialProps: { streamingState: StreamingState.Idle },
        },
      );

      act(() => {
        result.current.handleFinalSubmit('first input');
      });

      expect(mockSubmitQuery).toHaveBeenCalledWith('first input');
      expect(result.current.isSubmittingRef.current).toBe(true);

      rerender({ streamingState: StreamingState.Responding });

      act(() => {
        result.current.handleFinalSubmit('second input');
      });

      expect(result.current.queuedInput).toBe('second input');

      rerender({ streamingState: StreamingState.Idle });

      expect(mockSubmitQuery).toHaveBeenCalledWith('second input');
      expect(result.current.queuedInput).toBeNull();
      expect(mockSubmitQuery).toHaveBeenCalledTimes(2);
    });
  });

  describe('edge cases', () => {
    it('should handle rapid successive input submissions by overwriting queued input', () => {
      const { result } = renderHook(() =>
        useConcurrentInputLogic(mockSubmitQuery, StreamingState.Responding),
      );

      act(() => {
        result.current.handleFinalSubmit('input 1');
        result.current.handleFinalSubmit('input 2');
        result.current.handleFinalSubmit('input 3');
      });

      expect(result.current.queuedInput).toBe('input 3');
      expect(mockSubmitQuery).not.toHaveBeenCalled();
    });

    it('should trim whitespace from input before processing', () => {
      const { result } = renderHook(() =>
        useConcurrentInputLogic(mockSubmitQuery, StreamingState.Idle),
      );

      act(() => {
        result.current.handleFinalSubmit('  trimmed input  ');
      });

      expect(mockSubmitQuery).toHaveBeenCalledWith('trimmed input');
    });

    it('should handle null/undefined submitQuery gracefully', () => {
      expect(() => {
        renderHook(() =>
          useConcurrentInputLogic(null as any, StreamingState.Idle),
        );
      }).not.toThrow();
    });

    it('should handle invalid streaming states gracefully', () => {
      const { result } = renderHook(() =>
        useConcurrentInputLogic(mockSubmitQuery, 'invalid-state' as any),
      );

      act(() => {
        result.current.handleFinalSubmit('test input');
      });

      expect(result.current.queuedInput).toBe('test input');
      expect(mockSubmitQuery).not.toHaveBeenCalled();
    });

    it('should maintain queue state consistency across multiple state changes', () => {
      const { result, rerender } = renderHook(
        ({ streamingState }) =>
          useConcurrentInputLogic(mockSubmitQuery, streamingState),
        {
          initialProps: { streamingState: StreamingState.Responding },
        },
      );

      act(() => {
        result.current.handleFinalSubmit('queued input');
      });

      rerender({ streamingState: StreamingState.WaitingForConfirmation });
      
      expect(result.current.queuedInput).toBe('queued input');

      rerender({ streamingState: StreamingState.Idle });

      expect(mockSubmitQuery).toHaveBeenCalledWith('queued input');
      expect(result.current.queuedInput).toBeNull();
    });
  });
});