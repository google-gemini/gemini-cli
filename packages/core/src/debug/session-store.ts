/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { DapSessionManager } from './dap-session-manager.js';

let manager: DapSessionManager | null = null;
let hasCleanupHandlers = false;

function ensureCleanupHandlers(): void {
  if (hasCleanupHandlers) {
    return;
  }

  const cleanup = () => {
    void manager?.disconnectSession(true);
  };

  process.once('beforeExit', cleanup);
  process.once('SIGINT', cleanup);
  process.once('SIGTERM', cleanup);
  hasCleanupHandlers = true;
}

export function getDebugSessionManager(): DapSessionManager {
  if (!manager) {
    manager = new DapSessionManager();
    ensureCleanupHandlers();
  }
  return manager;
}

export function resetDebugSessionManagerForTest(): void {
  manager = null;
}
