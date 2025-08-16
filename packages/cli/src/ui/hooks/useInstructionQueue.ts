/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useRef, useMemo } from 'react';
import { QueuedInstruction, InstructionQueue } from '../types.js';

export interface UseInstructionQueueReturn {
  queue: InstructionQueue;
  addInstruction: (content: string) => string;
  getNextInstruction: () => QueuedInstruction | null;
  markInstructionProcessing: (instruction: QueuedInstruction) => void;
  markInstructionComplete: () => void;
  clearQueue: () => void;
  hasQueuedInstructions: boolean;
}

export const useInstructionQueue = (): UseInstructionQueueReturn => {
  const [queue, setQueue] = useState<InstructionQueue>({
    pending: [],
    processing: null,
  });
  const idCounterRef = useRef(0);

  const addInstruction = useCallback((content: string): string => {
    const id = `instruction-${++idCounterRef.current}`;
    const instruction: QueuedInstruction = {
      id,
      content: content.trim(),
      timestamp: Date.now(),
    };

    setQueue((prev) => ({
      ...prev,
      pending: [...prev.pending, instruction],
    }));

    return id;
  }, []);

  const getNextInstruction = useCallback((): QueuedInstruction | null => {
    return queue.pending[0] || null;
  }, [queue.pending]);

  const markInstructionProcessing = useCallback(
    (instruction: QueuedInstruction) => {
      setQueue((prev) => ({
        pending: prev.pending.filter((item) => item.id !== instruction.id),
        processing: instruction,
      }));
    },
    [],
  );

  const markInstructionComplete = useCallback(() => {
    setQueue((prev) => ({
      ...prev,
      processing: null,
    }));
  }, []);

  const clearQueue = useCallback(() => {
    setQueue({
      pending: [],
      processing: null,
    });
  }, []);

  const hasQueuedInstructions = useMemo(
    () => queue.pending.length > 0 || queue.processing !== null,
    [queue.pending.length, queue.processing],
  );

  return {
    queue,
    addInstruction,
    getNextInstruction,
    markInstructionProcessing,
    markInstructionComplete,
    clearQueue,
    hasQueuedInstructions,
  };
};
