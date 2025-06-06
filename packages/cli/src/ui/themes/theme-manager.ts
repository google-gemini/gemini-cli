/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AyuDark } from './ayu.js';
import { AyuLight } from './ayu-light.js';
import { AtomOneDark } from './atom-one-dark.js';
import { Dracula } from './dracula.js';
import { GitHubDark } from './github-dark.js';
import { GitHubLight } from './github-light.js';
import { GoogleCode } from './googlecode.js';
import { DefaultLight } from './default-light.js';
import { DefaultDark } from './default.js';
import { XCode } from './xcode.js';
import { Theme, ThemeType } from './theme.js';
import { ANSI } from './ansi.js';
import { ANSILight } from './ansi-light.js';
import { NoColorTheme } from './no-color.js';
import process from 'node:process';

export interface ThemeDisplay {
  name: string;
  type: ThemeType;
}

export const DEFAULT_THEME: Theme = DefaultDark;

class ThemeManager {
  private readonly availableThemes: Theme[];
  private activeTheme: Theme;

  constructor() {
    this.availableThemes = [
      AyuDark,
      AyuLight,
      AtomOneDark,
      Dracula,
      DefaultLight,
      DefaultDark,
      GitHubDark,
      GitHubLight,
      GoogleCode,
      XCode,
      ANSI,
      ANSILight,
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
          default:
            return 3;
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
    if (process.env.NO_COLOR) {
      return NoColorTheme;
    }
    return this.activeTheme;
  }
}

// Export an instance of the ThemeManager
export const themeManager = new ThemeManager();
