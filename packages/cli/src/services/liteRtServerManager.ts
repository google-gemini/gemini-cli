/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import { debugLogger } from '@google/gemini-cli-core';
import type { GemmaModelRouterSettings } from '@google/gemini-cli-core';
import { getBinaryPath, isServerRunning } from '../commands/gemma/platform.js';
import { DEFAULT_PORT } from '../commands/gemma/constants.js';

export class LiteRtServerManager {
  static async ensureRunning(
    gemmaSettings: GemmaModelRouterSettings | undefined,
  ): Promise<void> {
    if (!gemmaSettings?.enabled) return;
    if (gemmaSettings.autoStartServer === false) return;
    const binaryPath = getBinaryPath();
    if (!binaryPath || !fs.existsSync(binaryPath)) {
      debugLogger.log(
        '[LiteRtServerManager] Binary not installed, skipping auto-start. Run "gemini gemma setup".',
      );
      return;
    }

    const port =
      parseInt(
        gemmaSettings.classifier?.host?.match(/:(\d+)/)?.[1] ?? '',
        10,
      ) || DEFAULT_PORT;

    const running = await isServerRunning(port);
    if (running) {
      debugLogger.log(
        `[LiteRtServerManager] Server already running on port ${port}`,
      );
      return;
    }

    debugLogger.log(
      `[LiteRtServerManager] Auto-starting LiteRT server on port ${port}...`,
    );

    try {
      const { startServer } = await import('../commands/gemma/start.js');
      const started = await startServer(binaryPath, port);
      if (started) {
        debugLogger.log(`[LiteRtServerManager] Server started on port ${port}`);
      } else {
        debugLogger.warn(
          `[LiteRtServerManager] Server may not have started correctly on port ${port}`,
        );
      }
    } catch (error) {
      debugLogger.warn('[LiteRtServerManager] Auto-start failed:', error);
    }
  }
}
