/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export const createMockConfig = () => ({
  getTargetDir: () => process.cwd(),
  getCheckpointingEnabled: () => false,
});

export const mockDebugLogger = {
  warn: () => {},
  error: () => {},
  info: () => {},
  log: () => {},
};
