/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';
import type { KeyMatchers } from '../keyMatchers.js';
import { defaultKeyMatchers } from '../keyMatchers.js';

/**
 * Hook to retrieve the currently active key matchers.
 * This prepares the codebase for dynamic or custom key bindings in the future.
 */
export function useKeyMatchers(): KeyMatchers {
  return useMemo(() => defaultKeyMatchers, []);
}
