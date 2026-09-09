/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  debugLogger,
  startMemoryService,
  type Config,
} from '@google/gemini-cli-core';

export function startAutoMemoryIfEnabled(config: Config): void {
  if (!config.isAutoMemoryEnabled()) {
    return;
  }

  startMemoryService(config).catch((e) => {
    debugLogger.error('Failed to start memory service:', e);
  });
}
