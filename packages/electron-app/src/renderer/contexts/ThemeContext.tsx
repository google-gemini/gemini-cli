/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react';

// Define a default theme structure.
// This will be replaced by the actual theme from the main process.
const defaultTheme = {
  background: '#282a36',
  foreground: '#f8f8f2',
  cursor: '#f8f8f2',
  selectionBackground: '#44475a',
  black: '#000000',
  red: '#ff5555',
  green: '#50fa7b',
  yellow: '#f1fa8c',
  blue: '#bd93f9',
  magenta: '#ff79c6',
  cyan: '#8be9fd',
  white: '#bfbfbf',
  brightBlack: '#4d4d4d',
  brightRed: '#ff6e67',
  brightGreen: '#5af78e',
  brightYellow: '#f4f99d',
  brightBlue: '#caa9fa',
  brightMagenta: '#ff92d0',
  brightCyan: '#9aedfe',
  brightWhite: '#e6e6e6',
};

export type Theme = typeof defaultTheme;

export const ThemeContext = React.createContext<Theme>(defaultTheme);

export const useTheme = () => React.useContext(ThemeContext);
