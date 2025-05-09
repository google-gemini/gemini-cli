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
import { Theme, ThemeType } from './theme.js';
import { ANSI } from './ansi.js';

export interface ThemeDisplay {
  name: string;
  type: ThemeType;
}

export const DEFAULT_THEME: Theme = VS2015;

class ThemeManager {
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
    this.activeTheme = DEFAULT_THEME;
  }

  /**
   * Returns a list of available theme names.
   */
  getAvailableThemes(): ThemeDisplay[] {
    const sortedThemes = [...this.availableThemes].sort((a, b) => {
      const typeOrder = (type: ThemeType): number => {
        switch (type) {
          case 'dark':
            return 1;
          case 'light':
            return 2;
          case 'ansi':
            return 3;
          default:
            return 4;
        }
      };

      const typeComparison = typeOrder(a.type) - typeOrder(b.type);
      if (typeComparison !== 0) {
        return typeComparison;
      }
      return a.name.localeCompare(b.name);
    });

    return sortedThemes.map((theme) => ({
      name: theme.name,
      type: theme.type,
    }));
  }

  /**
   * Sets the active theme.
   * @param themeName The name of the theme to activate.
   * @returns True if the theme was successfully set, false otherwise.
   */
  setActiveTheme(themeName: string | undefined): boolean {
    const foundTheme = this.findThemeByName(themeName);

    if (foundTheme) {
      this.activeTheme = foundTheme;
      return true;
    } else {
      // If themeName is undefined, it means we want to set the default theme.
      // If findThemeByName returns undefined (e.g. default theme is also not found for some reason)
      // then this will return false.
      if (themeName === undefined) {
        this.activeTheme = DEFAULT_THEME;
        return true;
      }
      return false;
    }
  }

  findThemeByName(themeName: string | undefined): Theme | undefined {
    if (!themeName) {
      return DEFAULT_THEME;
    }
    return this.availableThemes.find((theme) => theme.name === themeName);
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
