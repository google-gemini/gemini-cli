/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { setStringWidthFunction } from 'ink';
import { getTerminalStringWidth } from './terminalStringWidth.js';

let inkStringWidthConfigured = false;

export function configureInkStringWidth(): void {
  if (inkStringWidthConfigured) {
    return;
  }

  setStringWidthFunction(getTerminalStringWidth);
  inkStringWidthConfigured = true;
}
