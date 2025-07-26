/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ThemeManager } from './themes/theme-manager.js';
import { ColorsTheme } from './themes/theme.js';

export const Colors: ColorsTheme = {
  get type() {
    return ThemeManager.getInstance().getActiveTheme().colors.type;
  },
  get Foreground() {
    return ThemeManager.getInstance().getActiveTheme().colors.Foreground;
  },
  get Background() {
    return ThemeManager.getInstance().getActiveTheme().colors.Background;
  },
  get LightBlue() {
    return ThemeManager.getInstance().getActiveTheme().colors.LightBlue;
  },
  get AccentBlue() {
    return ThemeManager.getInstance().getActiveTheme().colors.AccentBlue;
  },
  get AccentPurple() {
    return ThemeManager.getInstance().getActiveTheme().colors.AccentPurple;
  },
  get AccentCyan() {
    return ThemeManager.getInstance().getActiveTheme().colors.AccentCyan;
  },
  get AccentGreen() {
    return ThemeManager.getInstance().getActiveTheme().colors.AccentGreen;
  },
  get AccentYellow() {
    return ThemeManager.getInstance().getActiveTheme().colors.AccentYellow;
  },
  get AccentRed() {
    return ThemeManager.getInstance().getActiveTheme().colors.AccentRed;
  },
  get Comment() {
    return ThemeManager.getInstance().getActiveTheme().colors.Comment;
  },
  get Gray() {
    return ThemeManager.getInstance().getActiveTheme().colors.Gray;
  },
  get GradientColors() {
    return ThemeManager.getInstance().getActiveTheme().colors.GradientColors;
  },
};
