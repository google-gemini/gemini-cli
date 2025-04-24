/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AtomOneDark } from './atom-one-dark.js';
import { Dracula } from './dracula.js';
import { GitHub } from './github.js';
import { GoogleCode } from './googlecode.js';
import { VS } from './vs.js';
import { VS2015 } from './vs2015.js';
import { XCode } from './xcode.js';
import { Theme } from './theme.js';
import { ANSI } from './ansi.js';

export interface ThemeDisplay {
  name: string;
  active: boolean;
}

class ThemeManager {
  private static readonly DEFAULT_THEME: Theme = VS2015;
  private readonly availableThemes: Theme[];
  private activeTheme: Theme;

  constructor() {
    this.availableThemes = [
      AtomOneDark,
      Dracula,
      VS, // Light mode.
      VS2015,
      GitHub,
      GoogleCode,
      XCode,
      ANSI,
    ];
    this.activeTheme = ThemeManager.DEFAULT_THEME;
  }

  /**
   * Returns a list of available theme names.
   */
  getAvailableThemes(): ThemeDisplay[] {
    return this.availableThemes.map((theme) => ({
      name: theme.name,
      active: theme === this.activeTheme,
    }));
  }

  /**
   * Sets the active theme.
   * @param themeName The name of the theme to activate.
   */
  setActiveTheme(themeName: string): void {
    const foundTheme = this.availableThemes.find(
      (theme) => theme.name === themeName,
    );

    if (foundTheme) {
      this.activeTheme = foundTheme;
    } else {
      throw new Error(`Theme "${themeName}" not found.`);
    }
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
