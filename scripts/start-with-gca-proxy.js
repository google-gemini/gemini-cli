#!/usr/bin/env node
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Launcher script for GCA Proxy + Gemini CLI
 * - Finds a free port
 * - Starts the proxy server
 * - Waits for it to be ready
 * - Starts the CLI with the correct endpoint
 */

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as https from 'node:https';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const MIN_PORT = 3001;
const MAX_PORT = 3100;
const STARTUP_TIMEOUT_MS = 10000;
const POLL_INTERVAL_MS = 200;
const PROXY_CERT_PATH = path.join(REPO_ROOT, 'tools/gca-proxy/proxy-cert.pem');

/**
 * Find an available port in the given range
 */
function findFreePort(start, end) {
  return new Promise((resolve, reject) => {
    const tryPort = (port) => {
      if (port > end) {
        reject(new Error(`No free port found in range ${start}-${end}`));
        return;
      }

      const server = net.createServer();
      server.listen(port, '127.0.0.1', () => {
        server.close(() => resolve(port));
      });
      server.on('error', () => tryPort(port + 1));
    };
    tryPort(start);
  });
}

/**
 * Wait for the HTTPS server to be ready
 */
function waitForServer(port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const check = () => {
      if (Date.now() - startTime > timeoutMs) {
        reject(new Error(`Server did not start within ${timeoutMs}ms`));
        return;
      }

      const req = https.request(
        {
          hostname: 'localhost',
          port,
          path: '/',
          method: 'HEAD',
          rejectUnauthorized: false,
          timeout: 1000,
        },
        (_res) => {
          resolve();
        },
      );

      req.on('error', () => {
        setTimeout(check, POLL_INTERVAL_MS);
      });

      req.on('timeout', () => {
        req.destroy();
        setTimeout(check, POLL_INTERVAL_MS);
      });

      req.end();
    };

    check();
  });
}

async function main() {
  try {
    // Find a free port
    const port = await findFreePort(MIN_PORT, MAX_PORT);
    console.log(`\n🔍 Found free port: ${port}`);

    // Start the proxy server (silent mode - no output to avoid TUI interference)
    console.log('🚀 Starting GCA Proxy server...');
    const proxyProcess = spawn('npx', ['tsx', 'src/server.ts'], {
      cwd: path.join(REPO_ROOT, 'tools/gca-proxy'),
      env: { ...process.env, PORT: String(port) },
      stdio: 'ignore', // Suppress all output to avoid interfering with CLI TUI
    });

    proxyProcess.on('error', (err) => {
      console.error('Failed to start proxy:', err);
      process.exit(1);
    });

    proxyProcess.on('exit', (code) => {
      if (code !== null && code !== 0) {
        console.error(`Proxy exited with code ${code}`);
        process.exit(code);
      }
    });

    // Wait for server to be ready
    console.log('⏳ Waiting for proxy server to be ready...');
    await waitForServer(port, STARTUP_TIMEOUT_MS);
    console.log(`✅ Proxy ready at https://localhost:${port}\n`);

    // Wait for the proxy to write its certificate to disk
    const certWaitStart = Date.now();
    const CERT_TIMEOUT_MS = 5000;
    while (!fs.existsSync(PROXY_CERT_PATH)) {
      if (Date.now() - certWaitStart > CERT_TIMEOUT_MS) {
        throw new Error(
          `Proxy certificate not found at ${PROXY_CERT_PATH} after ${CERT_TIMEOUT_MS}ms. ` +
            'The proxy server may have failed to start correctly.',
        );
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    console.log(`🔒 Using proxy certificate: ${PROXY_CERT_PATH}`);

    // Start the CLI
    console.log('🤖 Starting Gemini CLI...\n');
    const cliProcess = spawn(
      'node',
      [path.join(REPO_ROOT, 'scripts/start.js'), ...process.argv.slice(2)],
      {
        env: {
          ...process.env,
          NODE_ENV: 'development',
          CODE_ASSIST_ENDPOINT: `https://localhost:${port}`,
          NODE_EXTRA_CA_CERTS: PROXY_CERT_PATH,
        },
        stdio: 'inherit',
      },
    );

    // Handle CLI exit
    cliProcess.on('exit', (code) => {
      proxyProcess.kill();
      process.exit(code || 0);
    });

    // Handle signals
    const cleanup = () => {
      proxyProcess.kill();
      cliProcess.kill();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
