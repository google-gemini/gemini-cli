/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger } from '@google/gemini-cli-core';
import {
  getBinaryPath,
  isBinaryInstalled,
  isServerRunning,
} from '../commands/gemma/platform.js';
import { DEFAULT_PORT } from '../commands/gemma/constants.js';

// Use a local interface that includes the new fields, since the core
// package's compiled types may not include them until rebuilt.
interface GemmaSettings {
  enabled?: boolean;
  autoStartServer?: boolean;
  binaryPath?: string;
  classifier?: { host?: string; model?: string };
}

/**
 * Manages the LiteRT-LM server lifecycle for auto-start during CLI startup.
 *
 * When the Gemma model router is enabled and `autoStartServer` is true,
 * this manager ensures the server is running before the CLI enters
 * interactive mode. The server is spawned as a detached daemon that
 * persists across CLI sessions — it is NOT stopped when the CLI exits.
 */
export class LiteRtServerManager {
  /**
   * Ensures the LiteRT-LM server is running if the settings call for it.
   * This is fire-and-forget: failures are logged but never block startup.
   */
  static async ensureRunning(
    gemmaSettings: GemmaSettings | undefined,
  ): Promise<void> {
    if (!gemmaSettings?.enabled) return;
    if (gemmaSettings.autoStartServer === false) return;
    if (!isBinaryInstalled()) {
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
      // Dynamic import to avoid circular dependencies and to keep the start
      // logic in one place.
      const { startServer } = await import('../commands/gemma/start.js');
      const binaryPath = gemmaSettings.binaryPath || getBinaryPath() || '';
      if (!binaryPath) {
        debugLogger.warn('[LiteRtServerManager] Could not resolve binary path');
        return;
      }
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
