/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { theme } from './semantic-colors.js';

export const Colors = {
  get type() {
    return theme.type;
  },
  get Foreground() {
    return theme.text.primary;
  },
  get Background() {
    return theme.background.primary;
  },
  get LightBlue() {
    return theme.text.link;
  },
  get AccentBlue() {
    return theme.text.link;
  },
  get AccentPurple() {
    return theme.text.accent;
  },
  get AccentCyan() {
    return theme.text.accent;
  },
  get AccentGreen() {
    return theme.status.success;
  },
  get AccentYellow() {
    return theme.status.warning;
  },
  get AccentRed() {
    return theme.status.error;
  },
  get DiffAdded() {
    return theme.background.diff.added;
  },
  get DiffRemoved() {
    return theme.background.diff.removed;
  },
  get Comment() {
    return theme.ui.comment;
  },
  get Gray() {
    return theme.text.secondary;
  },
  get GradientColors() {
    return theme.ui.gradient;
  },
};
