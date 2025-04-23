/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { VS2015 } from './vs2015.js';
import { Theme } from './theme.js';

class ThemeManager {
  private static readonly DEFAULT_THEME: Theme = VS2015;
  private readonly availableThemes: Theme[];
  private activeTheme: Theme;

  constructor() {
    this.availableThemes = [VS2015];
    this.activeTheme = ThemeManager.DEFAULT_THEME;
  }

  /**
   * Returns the currently active theme object.
   */
  getActiveTheme(): Theme {
    return this.activeTheme;
  }
}

// Export an instance of the ThemeManager
export const themeManager = new ThemeManager();
