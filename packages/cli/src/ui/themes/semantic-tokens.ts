/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { lightTheme, darkTheme } from './theme.js';

export interface SemanticColors {
  text: {
    primary: string;
    secondary: string;
    link: string;
    accent: string;
    response: string;
  };
  background: {
    primary: string;
    message: string;
    input: string;
    diff: {
      added: string;
      removed: string;
    };
  };
  border: {
    default: string;
    focused: string;
  };
  ui: {
    comment: string;
    symbol: string;
    dark: string;
    gradient: string[] | undefined;
  };
  status: {
    error: string;
    success: string;
    warning: string;
  };
}

export const lightSemanticColors: SemanticColors = {
  text: {
    primary: lightTheme.Foreground,
    secondary: lightTheme.Gray,
    link: lightTheme.AccentBlue,
    accent: lightTheme.AccentPurple,
    response: lightTheme.Foreground,
  },
  background: {
    primary: lightTheme.Background,
    message: lightTheme.MessageBackground!,
    input: lightTheme.InputBackground!,
    diff: {
      added: lightTheme.DiffAdded,
      removed: lightTheme.DiffRemoved,
    },
  },
  border: {
    default: lightTheme.DarkGray,
    focused: lightTheme.AccentBlue,
  },
  ui: {
    comment: lightTheme.Comment,
    symbol: lightTheme.Gray,
    dark: lightTheme.DarkGray,
    gradient: lightTheme.GradientColors,
  },
  status: {
    error: lightTheme.AccentRed,
    success: lightTheme.AccentGreen,
    warning: lightTheme.AccentYellow,
  },
};

export const darkSemanticColors: SemanticColors = {
  text: {
    primary: darkTheme.Foreground,
    secondary: darkTheme.Gray,
    link: darkTheme.AccentBlue,
    accent: darkTheme.AccentPurple,
    response: darkTheme.Foreground,
  },
  background: {
    primary: darkTheme.Background,
    message: darkTheme.MessageBackground!,
    input: darkTheme.InputBackground!,
    diff: {
      added: darkTheme.DiffAdded,
      removed: darkTheme.DiffRemoved,
    },
  },
  border: {
    default: darkTheme.DarkGray,
    focused: darkTheme.AccentBlue,
  },
  ui: {
    comment: darkTheme.Comment,
    symbol: darkTheme.Gray,
    dark: darkTheme.DarkGray,
    gradient: darkTheme.GradientColors,
  },
  status: {
    error: darkTheme.AccentRed,
    success: darkTheme.AccentGreen,
    warning: darkTheme.AccentYellow,
  },
};
