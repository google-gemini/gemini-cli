/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { createContext, useContext } from 'react';
import type { KeyMatchers } from '../key/keyMatchers.js';
import { defaultKeyMatchers } from '../key/keyMatchers.js';

export const KeyMatchersContext =
  createContext<KeyMatchers>(defaultKeyMatchers);

export const KeyMatchersProvider = ({
  children,
  value,
}: {
  children: React.ReactNode;
  value: KeyMatchers;
}): React.JSX.Element => (
  <KeyMatchersContext.Provider value={value}>
    {children}
  </KeyMatchersContext.Provider>
);

/**
 * Hook to retrieve the currently active key matchers.
 * Defaults to defaultKeyMatchers if no provider is present, allowing tests to run without explicit wrappers.
 */
export function useKeyMatchers(): KeyMatchers {
  return useContext(KeyMatchersContext);
}
