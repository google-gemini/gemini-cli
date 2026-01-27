/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';

/**
 * A hook that returns true for a limited duration whenever a trigger value changes.
 *
 * @param triggerValue Value that triggers tip visibility when changed.
 * @param duration Duration in milliseconds for tip visibility.
 */
export function useTransientTip(
  triggerValue: unknown,
  duration = 5000,
): boolean {
  const [state, setState] = useState({
    value: triggerValue,
    show: triggerValue !== undefined && triggerValue !== null,
  });

  // Synchronously update state during render to avoid flickering in the TUI.
  if (triggerValue !== state.value) {
    setState({
      value: triggerValue,
      show: triggerValue !== undefined && triggerValue !== null,
    });
  }

  useEffect(() => {
    if (triggerValue === undefined || triggerValue === null) {
      return;
    }

    const timer = setTimeout(() => {
      setState((s) => ({ ...s, show: false }));
    }, duration);

    return () => clearTimeout(timer);
  }, [triggerValue, duration]);

  // Return the intended value for the current render pass.
  if (triggerValue !== state.value) {
    return triggerValue !== undefined && triggerValue !== null;
  }

  return state.show;
}
