/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { debugLogger } from '@google/gemini-cli-core';

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

    debugLogger.debug(`[useInactivityTimer] Starting timer for ${delayMs}ms. Trigger:`, trigger);
    setIsInactive(false);
    const timer = setTimeout(() => {
      debugLogger.debug(`[useInactivityTimer] Timer fired after ${delayMs}ms.`);
      setIsInactive(true);
    }, delayMs);

    return () => {
      debugLogger.debug(`[useInactivityTimer] Clearing timer.`);
      clearTimeout(timer);
    };
  }, [isActive, trigger, delayMs]);

  return isInactive;
};
