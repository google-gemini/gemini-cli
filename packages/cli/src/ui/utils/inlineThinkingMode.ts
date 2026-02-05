/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LoadedSettings } from '../../config/settings.js';

export type InlineThinkingMode = 'off' | 'summary' | 'full';

export function getInlineThinkingMode(
  settings: LoadedSettings,
): InlineThinkingMode {
  return settings.merged.ui?.inlineThinkingMode ?? 'off';
}
