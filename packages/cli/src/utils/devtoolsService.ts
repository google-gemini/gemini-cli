/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger } from '@google/gemini-cli-core';
import type { Config } from '@google/gemini-cli-core';
import WebSocket from 'ws';
import { initActivityLogger, addNetworkTransport } from './activityLogger.js';

interface IDevTools {
  start(): Promise<string>;
  stop(): Promise<void>;
  getPort(): number;
}

const DEVTOOLS_PKG = 'gemini-cli-devtools';
const DEFAULT_DEVTOOLS_PORT = 25417;
const DEFAULT_DEVTOOLS_HOST = '127.0.0.1';
const MAX_PROMOTION_ATTEMPTS = 3;
let promotionAttempts = 0;

/**
 * Probe whether a DevTools server is already listening on the given host:port.
 * Returns true if a WebSocket handshake succeeds within a short timeout.
 */
function probeDevTools(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://${host}:${port}/ws`);
    const timer = setTimeout(() => {
      ws.close();
      resolve(false);
    }, 500);

    ws.on('open', () => {
      clearTimeout(timer);
      ws.close();
      resolve(true);
    });

    ws.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

/**
 * Start a DevTools server, then check if we won the default port.
 * If another instance grabbed it first (race), stop ours and connect as client.
 * Returns { host, port } of the DevTools to connect to.
 */
async function startOrJoinDevTools(
  defaultHost: string,
  defaultPort: number,
): Promise<{ host: string; port: number }> {
  const mod = await import(DEVTOOLS_PKG);
  const devtools: IDevTools = mod.DevTools.getInstance();
  const url = await devtools.start();
  const actualPort = devtools.getPort();

  if (actualPort === defaultPort) {
    // We won the port — we are the server
    debugLogger.log(`DevTools available at: ${url}`);
    return { host: defaultHost, port: actualPort };
  }

  // Lost the race — someone else has the default port.
  // Verify the winner is actually alive, then stop ours and connect to theirs.
  const winnerAlive = await probeDevTools(defaultHost, defaultPort);
  if (winnerAlive) {
    await devtools.stop();
    debugLogger.log(
      `DevTools (existing) at: http://${defaultHost}:${defaultPort}`,
    );
    return { host: defaultHost, port: defaultPort };
  }

  // Winner isn't responding (maybe also racing and failed) — keep ours
  debugLogger.log(`DevTools available at: ${url}`);
  return { host: defaultHost, port: actualPort };
}

/**
 * Handle promotion: when reconnect fails, start or join a DevTools server
 * and add a new network transport for the logger.
 */
async function handlePromotion(config: Config) {
  promotionAttempts++;
  if (promotionAttempts > MAX_PROMOTION_ATTEMPTS) {
    debugLogger.debug(
      `Giving up on DevTools promotion after ${MAX_PROMOTION_ATTEMPTS} attempts`,
    );
    return;
  }

  try {
    const result = await startOrJoinDevTools(
      DEFAULT_DEVTOOLS_HOST,
      DEFAULT_DEVTOOLS_PORT,
    );
    addNetworkTransport(config, result.host, result.port, () =>
      handlePromotion(config),
    );
  } catch (err) {
    debugLogger.debug('Failed to promote to DevTools server:', err);
  }
}

/**
 * Registers the activity logger.
 * Captures network and console logs via DevTools WebSocket or to a file.
 *
 * Environment variable GEMINI_CLI_ACTIVITY_LOG_TARGET controls the output:
 * - file path (e.g., "/tmp/logs.jsonl") → file mode
 * - not set → auto-start DevTools (reuses existing instance if already running)
 *
 * @param config The CLI configuration
 */
export async function registerActivityLogger(config: Config) {
  const target = process.env['GEMINI_CLI_ACTIVITY_LOG_TARGET'];

  if (!target) {
    // No explicit target: try connecting to existing DevTools, then start new one
    const onReconnectFailed = () => handlePromotion(config);

    // Probe for an existing DevTools server
    const existing = await probeDevTools(
      DEFAULT_DEVTOOLS_HOST,
      DEFAULT_DEVTOOLS_PORT,
    );
    if (existing) {
      debugLogger.log(
        `DevTools (existing) at: http://${DEFAULT_DEVTOOLS_HOST}:${DEFAULT_DEVTOOLS_PORT}`,
      );
      initActivityLogger(config, {
        mode: 'network',
        host: DEFAULT_DEVTOOLS_HOST,
        port: DEFAULT_DEVTOOLS_PORT,
        onReconnectFailed,
      });
      return;
    }

    // No existing server — start (or join if we lose the race)
    try {
      const result = await startOrJoinDevTools(
        DEFAULT_DEVTOOLS_HOST,
        DEFAULT_DEVTOOLS_PORT,
      );
      initActivityLogger(config, {
        mode: 'network',
        host: result.host,
        port: result.port,
        onReconnectFailed,
      });
      return;
    } catch (err) {
      debugLogger.debug(
        'Failed to start DevTools, falling back to file logging:',
        err,
      );
    }
  }

  // File mode fallback
  if (!config.storage) {
    return;
  }

  initActivityLogger(config, { mode: 'file', filePath: target });
}

/** Reset module-level state — test only. */
export function resetForTesting() {
  promotionAttempts = 0;
}
