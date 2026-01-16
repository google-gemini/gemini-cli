/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface DeferredCommand {
  run: () => Promise<void>;
  type?: 'mcp' | 'extensions' | 'skills' | 'other';
}
