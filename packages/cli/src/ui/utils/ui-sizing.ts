/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export const calculateMainAreaWidth = (
  terminalWidth: number,
  isAlternateBuffer: boolean,
): number => {
  if (isAlternateBuffer) {
    return terminalWidth - 1;
  }
  return terminalWidth;
};
