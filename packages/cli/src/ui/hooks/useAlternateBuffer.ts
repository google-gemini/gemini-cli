/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useSettings } from '../contexts/SettingsContext.js';
import type { LoadedSettings } from '../../config/settings.js';
import { isCloudShell } from '@google/gemini-cli-core';

/**
 * Determines if the alternate buffer should be used.
 *
 * Web-based terminals (Cloud Shell) suffer from visible flickering because
 * without the alternate buffer, Ink clears and redraws the entire screen on
 * every frame. The alternate buffer enables incremental rendering which only
 * redraws changed lines, eliminating the flicker.
 *
 * See: https://github.com/google-gemini/gemini-cli/issues/18079
 */
export const isAlternateBufferEnabled = (settings: LoadedSettings): boolean => {
  // Honor explicit user/workspace/system setting if present.
  const explicit =
    settings.workspace?.settings.ui?.useAlternateBuffer ??
    settings.user?.settings.ui?.useAlternateBuffer ??
    settings.system?.settings.ui?.useAlternateBuffer;

  if (typeof explicit === 'boolean') {
    return explicit;
  }

  // Auto-enable alternate buffer for Cloud Shell to prevent flickering.
  // Cloud Shell is a web-based terminal that redraws slowly, making
  // full-screen repaints visually jarring.
  if (isCloudShell()) {
    return true;
  }

  return settings.merged.ui.useAlternateBuffer === true;
};

export const useAlternateBuffer = (): boolean => {
  const settings = useSettings();
  return isAlternateBufferEnabled(settings);
};
