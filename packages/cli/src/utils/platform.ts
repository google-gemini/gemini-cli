/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export const canOpenBrowser = () => {
  if (process.platform === 'linux' && !process.env.DISPLAY) {
    return false;
  }
  return true;
};
