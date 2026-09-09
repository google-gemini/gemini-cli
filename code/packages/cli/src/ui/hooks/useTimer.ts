/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';

/**
 * Custom hook to manage a timer that increments every second.
 * @param isActive Whether the timer should be running.
 * @param resetKey A key that, when changed, will reset the timer to 0 and restart the interval.
 * @returns The elapsed time in seconds.
 */
export const useTimer = (isActive: boolean, resetKey: unknown) => {
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const prevResetKeyRef = useRef(resetKey);
  const prevIsActiveRef = useRef(isActive);

  useEffect(() => {
    let shouldResetTime = false;

    if (prevResetKeyRef.current !== resetKey) {
      shouldResetTime = true;
      prevResetKeyRef.current = resetKey;
    }

    if (prevIsActiveRef.current === false && isActive) {
      // Transitioned from inactive to active
      shouldResetTime = true;
    }

    if (shouldResetTime) {
      setElapsedTime(0);
    }
    prevIsActiveRef.current = isActive;

    // Manage interval
    if (isActive) {
      // Clear previous interval unconditionally before starting a new one
      // This handles resetKey changes while active, ensuring a fresh interval start.
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      timerRef.current = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isActive, resetKey]);

  return elapsedTime;
};
