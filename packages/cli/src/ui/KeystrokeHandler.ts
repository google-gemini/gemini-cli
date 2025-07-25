/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface KeystrokeHandler {
  input: string | string[];
  ctrl?: boolean;
  shift?: boolean;
  handler: () => void;
  condition?: (context: { enteringConstrainHeightMode: boolean }) => boolean;
}
