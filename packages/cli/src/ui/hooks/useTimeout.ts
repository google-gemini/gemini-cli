/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';

/**
 * A custom hook for handling timeouts in React components with proper lifecycle management.
 *
 * This hook encapsulates setTimeout and clearTimeout logic using useRef to store the callback.
 * It ensures safe cleanup during component unmount and prevents race conditions that can occur
 * with the standard setTimeout/clearTimeout pattern in useEffect.
 *
 * @param callback - The function to execute after the delay
 * @param delay - The delay in milliseconds, or null to disable the timeout
 *
 * @example
 * useTimeout(() => {
 *   setShowFocusHint(true);
 * }, 5000);
 */
export function useTimeout(callback: () => void, delay: number | null): void {
  const savedCallback = useRef(callback);

  // Update the saved callback if it changes
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  // Set up the timeout
  useEffect(() => {
    if (delay === null) {
      return;
    }

    const id = setTimeout(() => savedCallback.current(), delay);

    return () => clearTimeout(id);
  }, [delay]);
}
