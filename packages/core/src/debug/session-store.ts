/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { DapSessionManager } from './dap-session-manager.js';

let manager: DapSessionManager | null = null;

export function getDebugSessionManager(): DapSessionManager {
  if (!manager) {
    manager = new DapSessionManager();
  }
  return manager;
}

export function resetDebugSessionManagerForTest(): void {
  manager = null;
}
