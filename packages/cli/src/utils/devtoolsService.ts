/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger } from '@google/gemini-cli-core';
import type { Config } from '@google/gemini-cli-core';
import WebSocket from 'ws';
import {
  initActivityLogger,
  addNetworkTransport,
  ActivityLogger,
} from './activityLogger.js';

interface IDevTools {
  start(): Promise<string>;
  stop(): Promise<void>;
  getPort(): number;
}

const DEFAULT_DEVTOOLS_PORT = 25417;
const DEFAULT_DEVTOOLS_HOST = '127.0.0.1';
const MAX_PROMOTION_ATTEMPTS = 3;
let promotionAttempts = 0;
let serverStartPromise: Promise<string> | null = null;
let connectedUrl: string | null = null;

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
      ws.close();
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
  const mod = await import('@google/gemini-cli-devtools');
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
 * Initializes the activity logger.
 * Interception starts immediately in buffering mode.
 * If an existing DevTools server is found, attaches transport eagerly.
 */
export async function setupInitialActivityLogger(config: Config) {
  const target = process.env['GEMINI_CLI_ACTIVITY_LOG_TARGET'];

  if (target) {
    if (!config.storage) return;
    initActivityLogger(config, { mode: 'file', filePath: target });
  } else {
    // Start in buffering mode (no transport attached yet)
    initActivityLogger(config, { mode: 'buffer' });

    // Eagerly probe for an existing DevTools server
    try {
      const existing = await probeDevTools(
        DEFAULT_DEVTOOLS_HOST,
        DEFAULT_DEVTOOLS_PORT,
      );
      if (existing) {
        const onReconnectFailed = () => handlePromotion(config);
        addNetworkTransport(
          config,
          DEFAULT_DEVTOOLS_HOST,
          DEFAULT_DEVTOOLS_PORT,
          onReconnectFailed,
        );
        ActivityLogger.getInstance().enableNetworkLogging();
        connectedUrl = `http://localhost:${DEFAULT_DEVTOOLS_PORT}`;
        debugLogger.log(`DevTools (existing) at startup: ${connectedUrl}`);
      }
    } catch {
      // Probe failed silently — stay in buffer mode
    }
  }
}

/**
 * Starts the DevTools server and opens the UI in the browser.
 * Returns the URL to the DevTools UI.
 * Deduplicates concurrent calls — returns the same promise if already in flight.
 */
export function startDevToolsServer(config: Config): Promise<string> {
  if (connectedUrl) return Promise.resolve(connectedUrl);
  if (serverStartPromise) return serverStartPromise;
  serverStartPromise = startDevToolsServerImpl(config).catch((err) => {
    serverStartPromise = null;
    throw err;
  });
  return serverStartPromise;
}

async function startDevToolsServerImpl(config: Config): Promise<string> {
  const onReconnectFailed = () => handlePromotion(config);

  // Probe for an existing DevTools server
  const existing = await probeDevTools(
    DEFAULT_DEVTOOLS_HOST,
    DEFAULT_DEVTOOLS_PORT,
  );

  let host = DEFAULT_DEVTOOLS_HOST;
  let port = DEFAULT_DEVTOOLS_PORT;

  if (existing) {
    debugLogger.log(
      `DevTools (existing) at: http://${DEFAULT_DEVTOOLS_HOST}:${DEFAULT_DEVTOOLS_PORT}`,
    );
  } else {
    // No existing server — start (or join if we lose the race)
    try {
      const result = await startOrJoinDevTools(
        DEFAULT_DEVTOOLS_HOST,
        DEFAULT_DEVTOOLS_PORT,
      );
      host = result.host;
      port = result.port;
    } catch (err) {
      debugLogger.debug('Failed to start DevTools:', err);
      throw err;
    }
  }

  // Promote the activity logger to use the network transport
  addNetworkTransport(config, host, port, onReconnectFailed);
  const capture = ActivityLogger.getInstance();
  capture.enableNetworkLogging();

  const url = `http://localhost:${port}`;
  connectedUrl = url;
  return url;
}

/**
 * Handles the F12 key toggle for the DevTools panel.
 * Starts the DevTools server, attempts to open the browser.
 * If the panel is already open, it closes it.
 * If the panel is closed:
 * - Attempts to open the browser.
 * - If browser opening is successful, the panel remains closed.
 * - If browser opening fails or is not possible, the panel is opened.
 */
export async function toggleDevToolsPanel(
  config: Config,
  isOpen: boolean,
  toggle: () => void,
  setOpen: () => void,
): Promise<void> {
  if (isOpen) {
    toggle();
    return;
  }

  try {
    const { openBrowserSecurely, shouldLaunchBrowser } = await import(
      '@google/gemini-cli-core'
    );
    const url = await startDevToolsServer(config);
    if (shouldLaunchBrowser()) {
      try {
        await openBrowserSecurely(url);
        // Browser opened successfully, don't open drawer.
        return;
      } catch (e) {
        debugLogger.warn('Failed to open browser securely:', e);
      }
    }
    // If we can't launch browser or it failed, open drawer.
    setOpen();
  } catch (e) {
    setOpen();
    debugLogger.error('Failed to start DevTools server:', e);
  }
}

/** Reset module-level state — test only. */
export function resetForTesting() {
  promotionAttempts = 0;
  serverStartPromise = null;
  connectedUrl = null;
}
