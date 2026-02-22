/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger, tmpdir } from '@google/gemini-cli-core';
import type { Config } from '@google/gemini-cli-core';
import WebSocket from 'ws';
import { writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import {
  initActivityLogger,
  addNetworkTransport,
  ActivityLogger,
} from './activityLogger.js';

interface IDevTools {
  start(): Promise<string>;
  stop(): Promise<void>;
  getPort(): number;
  getToken(): string;
}

const DEFAULT_DEVTOOLS_PORT = 25417;
const DEFAULT_DEVTOOLS_HOST = '127.0.0.1';
const MAX_PROMOTION_ATTEMPTS = 3;
let promotionAttempts = 0;
let serverStartPromise: Promise<string> | null = null;
let connectedUrl: string | null = null;

/**
 * Returns the file path where the auth token for a DevTools server on the given
 * port is persisted. Other CLI instances read this file to authenticate.
 */
function getTokenFilePath(port: number): string {
  return join(tmpdir(), `gemini-cli-devtools-${port}.token`);
}

/**
 * Writes the token to disk with restricted permissions so other local CLI
 * instances can read it and authenticate with the DevTools server.
 */
function writeTokenFile(port: number, token: string): void {
  try {
    writeFileSync(getTokenFilePath(port), token, { mode: 0o600 });
  } catch {
    debugLogger.debug('Failed to write DevTools token file');
  }
}

/**
 * Reads the token file for a DevTools server running on the given port.
 * Returns the token string, or null if the file does not exist.
 */
function readTokenFile(port: number): string | null {
  try {
    return readFileSync(getTokenFilePath(port), 'utf-8').trim();
  } catch {
    return null;
  }
}

/**
 * Removes the token file. Called during cleanup / server stop.
 */
function removeTokenFile(port: number): void {
  try {
    unlinkSync(getTokenFilePath(port));
  } catch {
    // Ignore — file may already be gone
  }
}

/**
 * Probe whether a DevTools server is already listening on the given host:port.
 * Returns true if a WebSocket handshake succeeds within a short timeout.
 * When token is provided, the probe authenticates; without it, only legacy
 * (pre-auth) servers will accept the connection.
 */
function probeDevTools(
  host: string,
  port: number,
  token?: string | null,
): Promise<boolean> {
  return new Promise((resolve) => {
    const query = token ? `?token=${encodeURIComponent(token)}` : '';
    const ws = new WebSocket(`ws://${host}:${port}/ws${query}`);
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
): Promise<{ host: string; port: number; token: string | null }> {
  const mod = await import('@google/gemini-cli-devtools');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- dynamic import; DevTools structurally matches IDevTools at runtime
  const devtools = mod.DevTools.getInstance() as unknown as IDevTools;
  const url = await devtools.start();
  const actualPort = devtools.getPort();
  const token = devtools.getToken();

  if (actualPort === defaultPort) {
    // We won the port — we are the server.
    // Persist the token so other CLI instances can authenticate.
    writeTokenFile(actualPort, token);
    debugLogger.log(`DevTools available at: ${url}`);
    return { host: defaultHost, port: actualPort, token };
  }

  // Lost the race — someone else has the default port.
  // Read their token from the shared token file.
  const existingToken = readTokenFile(defaultPort);
  const winnerAlive = await probeDevTools(
    defaultHost,
    defaultPort,
    existingToken,
  );
  if (winnerAlive) {
    await devtools.stop();
    debugLogger.log(
      `DevTools (existing) at: http://${defaultHost}:${defaultPort}`,
    );
    return { host: defaultHost, port: defaultPort, token: existingToken };
  }

  // Winner isn’t responding — keep ours.
  writeTokenFile(actualPort, token);
  debugLogger.log(`DevTools available at: ${url}`);
  return { host: defaultHost, port: actualPort, token };
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
    addNetworkTransport(config, result.host, result.port, result.token, () =>
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

    // Eagerly probe for an existing DevTools server.
    // Read the token file so we can authenticate if the server requires it.
    try {
      const existingToken = readTokenFile(DEFAULT_DEVTOOLS_PORT);
      const existing = await probeDevTools(
        DEFAULT_DEVTOOLS_HOST,
        DEFAULT_DEVTOOLS_PORT,
        existingToken,
      );
      if (existing) {
        const onReconnectFailed = () => handlePromotion(config);
        addNetworkTransport(
          config,
          DEFAULT_DEVTOOLS_HOST,
          DEFAULT_DEVTOOLS_PORT,
          existingToken,
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

  // Probe for an existing DevTools server (read token file to authenticate)
  const existingToken = readTokenFile(DEFAULT_DEVTOOLS_PORT);
  const existing = await probeDevTools(
    DEFAULT_DEVTOOLS_HOST,
    DEFAULT_DEVTOOLS_PORT,
    existingToken,
  );

  let host = DEFAULT_DEVTOOLS_HOST;
  let port = DEFAULT_DEVTOOLS_PORT;
  let token: string | null = existingToken;

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
      token = result.token;
    } catch (err) {
      debugLogger.debug('Failed to start DevTools:', err);
      throw err;
    }
  }

  // Promote the activity logger to use the network transport.
  // Default is ALLOW: always attempt connection, even without a token.
  // The server may accept (pre-auth) or reject (auth-enabled without shared token).
  addNetworkTransport(config, host, port, token, onReconnectFailed);
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
  removeTokenFile(DEFAULT_DEVTOOLS_PORT);
}
