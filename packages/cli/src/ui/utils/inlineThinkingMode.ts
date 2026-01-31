/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LoadedSettings } from '../../config/settings.js';

export type InlineThinkingMode = 'off' | 'summary' | 'full';

export function getInlineThinkingMode(
  settings: LoadedSettings,
): InlineThinkingMode {
  const ui = settings.merged.ui;

  if (ui?.showInlineThinkingFull) {
    return 'full';
  }

  if (ui?.showInlineThinkingSummary) {
    return 'summary';
  }

  if (ui?.showInlineThinking) {
    return 'full';
  }

  return 'off';
}
