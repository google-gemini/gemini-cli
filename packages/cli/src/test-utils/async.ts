/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { act } from 'react';

// The waitFor from vitest doesn't properly wrap in act(), so we have to
// implement our own like the one in @testing-library/react
// or @testing-library/react-native
// The version of waitFor from vitest is still fine to use if you aren't waiting
// for React state updates.
export async function waitFor(
  assertion: () => void,
  { timeout = 1000, interval = 50 } = {},
): Promise<void> {
  const startTime = Date.now();

  while (true) {
    try {
      assertion();
      return;
    } catch (error) {
      if (Date.now() - startTime > timeout) {
        throw error;
      }

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, interval));
      });
    }
  }
}
