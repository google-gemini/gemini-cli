/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useContext } from 'react';

export type TerminalBackground = 'light' | 'dark' | 'unknown';

export interface ThemeContextValue {
  terminalBackground: TerminalBackground;
}

export const ThemeContext = React.createContext<ThemeContextValue | undefined>(
  undefined,
);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
