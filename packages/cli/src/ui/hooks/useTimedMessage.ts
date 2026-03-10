/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * A hook to manage a state value that automatically resets to null after a specified duration.
 * Provides a function to manually set the value and reset the timer.
 * Can be paused to prevent the timer from expiring.
 */
export function useTimedMessage<T>(
  defaultDurationMs: number,
  isPaused: boolean = false,
) {
  const [message, setMessage] = useState<T | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentDurationRef = useRef<number>(defaultDurationMs);

  const startTimer = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (!isPaused && message !== null) {
      timeoutRef.current = setTimeout(() => {
        setMessage(null);
      }, currentDurationRef.current);
    }
  }, [isPaused, message]);

  const showMessage = useCallback(
    (msg: T | null, durationMs?: number) => {
      setMessage(msg);
      currentDurationRef.current = durationMs ?? defaultDurationMs;
    },
    [defaultDurationMs],
  );

  useEffect(() => {
    startTimer();
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [startTimer]);

  return [message, showMessage] as const;
}
