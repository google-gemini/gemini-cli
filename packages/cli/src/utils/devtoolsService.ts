/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger, type Config } from '@google/gemini-cli-core';
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
let serverStartPromise: Promise<string> | null = null;
let connectedUrl: string | null = null;
let wsAlive = false;

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
 * Initializes the activity logger for file logging only.
 * Interactive mode does nothing at startup — F12 triggers connection lazily.
 */
export async function setupInitialActivityLogger(config: Config) {
  const target = process.env['GEMINI_CLI_ACTIVITY_LOG_TARGET'];

  if (target) {
    if (!config.storage) return;
    initActivityLogger(config, { mode: 'file', filePath: target });
  }
  // Interactive mode: do nothing at startup. F12 will trigger connection.
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

  // Enable interception if not already active, then attach network transport
  initActivityLogger(config);
  addNetworkTransport(config, host, port);

  // Track transport connection state
  const capture = ActivityLogger.getInstance();
  capture.on('transport-connected', () => {
    wsAlive = true;
  });
  capture.on('transport-disconnected', () => {
    wsAlive = false;
  });

  const url = `http://localhost:${port}`;
  connectedUrl = url;
  return url;
}

/**
 * Handles the F12 key toggle for the DevTools panel.
 * Starts the DevTools server, attempts to open the browser.
 * If the panel is already open, it closes it.
 * If the panel is closed:
 * - Checks if a previous connection died and resets state so we re-probe.
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

  // If we had a connection but the WS died, reset so we re-probe
  if (connectedUrl && !wsAlive) {
    connectedUrl = null;
    serverStartPromise = null;
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
  serverStartPromise = null;
  connectedUrl = null;
  wsAlive = false;
}
