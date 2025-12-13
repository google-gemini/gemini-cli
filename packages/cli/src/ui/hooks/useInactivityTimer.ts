/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';

/**
 * Returns true after a specified delay of inactivity.
 * Inactivity is defined as 'trigger' not changing for 'delayMs' milliseconds.
 *
 * @param isActive Whether the timer should be running.
 * @param trigger Any value that, when changed, resets the inactivity timer.
 * @param delayMs The delay in milliseconds before considering the state inactive.
 */
export const useInactivityTimer = (
  isActive: boolean,
  trigger: unknown,
  delayMs: number = 5000,
): boolean => {
  const [isInactive, setIsInactive] = useState(false);

  useEffect(() => {
    if (!isActive) {
      setIsInactive(false);
      return;
    }

    setIsInactive(false);
    const timer = setTimeout(() => {
      setIsInactive(true);
    }, delayMs);

    return () => clearTimeout(timer);
  }, [isActive, trigger, delayMs]);

  return isInactive;
};
