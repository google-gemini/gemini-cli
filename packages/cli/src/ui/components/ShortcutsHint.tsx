/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useSettingsStore } from '../contexts/SettingsContext.js';

export const ShortcutsHint: React.FC = () => {
  const { cleanUiDetailsVisible, shortcutsHelpVisible } = useUIState();
  const { settings } = useSettingsStore();

  // ✅ NEW FEATURE (Issue #18535)
  // Hide "? for shortcuts" when disabled in config
  const showHint = settings.merged.ui?.showShortcutsHint ?? true;

  if (!showHint) return null;

  if (!cleanUiDetailsVisible) {
    return <Text color={theme.text.secondary}> press tab twice for more </Text>;
  }

  const highlightColor = shortcutsHelpVisible
    ? theme.text.accent
    : theme.text.secondary;

  return <Text color={highlightColor}> ? for shortcuts </Text>;
};
