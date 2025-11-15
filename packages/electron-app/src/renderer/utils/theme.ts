/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IncomingTheme, CliTheme } from '../types/global';

export function isCliTheme(theme: IncomingTheme): theme is CliTheme {
  return (
    'colors' in theme &&
    theme.colors !== undefined &&
    typeof theme.colors === 'object'
  );
}
