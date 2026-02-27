/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SessionEndReason, flushTelemetry } from '@google/gemini-cli-core';
import type { SlashCommand } from './types.js';
import { CommandKind } from './types.js';
import { relaunchAppInChildProcess } from '../../utils/relaunch.js';

export const restartCommand: SlashCommand = {
  name: 'restart',
  description: 'Restart the CLI and resume the current session',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context) => {
    const config = context.services.config;

    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Unable to restart: config not available',
      };
    }

    const sessionId = config.getSessionId();
    context.ui.setDebugMessage('Restarting CLI with current session...');

    // Fire SessionEnd hook before restarting
    await config.getHookSystem()?.fireSessionEndEvent(SessionEndReason.Restart);

    // Give the event loop a chance to process any pending telemetry operations.
    // This ensures logger.emit() calls have fully propagated to the BatchLogRecordProcessor.
    // This is critical for tests and environments with I/O latency.
    await new Promise<void>((resolve) => setImmediate(resolve));

    // Flush telemetry to ensure hooks are written to disk immediately
    await flushTelemetry(config);

    // Restart the process with the current session ID preserved
    await relaunchAppInChildProcess([], ['--resume', sessionId]);
    return undefined;
  },
};
