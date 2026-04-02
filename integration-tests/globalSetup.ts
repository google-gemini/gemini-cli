/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Unset NO_COLOR environment variable to ensure consistent theme behavior between local and CI test runs
if (process.env['NO_COLOR'] !== undefined) {
  delete process.env['NO_COLOR'];
}

import { mkdir, readdir, rm, readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canUseRipgrep } from '../packages/core/src/tools/ripGrep.js';
import { disableMouseTracking } from '@google/gemini-cli-core';
import { createServer, type Server } from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const integrationTestsDir = join(rootDir, '.integration-tests');
let runDir = ''; // Make runDir accessible in teardown
let fixtureServer: Server | undefined;

const FIXTURE_PORT = 18923;
const FIXTURE_DIR = join(__dirname, 'test-fixtures');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

async function startFixtureServer(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const urlPath = req.url?.split('?')[0] || '/';
      const relativePath = urlPath === '/' ? 'index.html' : urlPath;
      const filePath = join(FIXTURE_DIR, relativePath);

      if (!filePath.startsWith(FIXTURE_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/html' });
        res.end('<h1>403 Forbidden</h1>');
        return;
      }

      try {
        const content = await readFile(filePath);
        const ext = extname(filePath);
        res.writeHead(200, {
          'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        });
        res.end(content);
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 Not Found</h1>');
      }
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(
          `Port ${FIXTURE_PORT} in use, trying ${FIXTURE_PORT + 1}...`,
        );
        server.listen(FIXTURE_PORT + 1, '127.0.0.1');
      } else {
        reject(err);
      }
    });

    server.on('listening', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : FIXTURE_PORT;
      fixtureServer = server;
      console.log(`Test fixture server listening on http://127.0.0.1:${port}`);
      resolve(port);
    });

    server.listen(FIXTURE_PORT, '127.0.0.1');
  });
}

export async function setup() {
  runDir = join(integrationTestsDir, `${Date.now()}`);
  await mkdir(runDir, { recursive: true });

  // Set the home directory to the test run directory to avoid conflicts
  // with the user's local config.
  process.env['HOME'] = runDir;
  if (process.platform === 'win32') {
    process.env['USERPROFILE'] = runDir;
  }
  // We also need to set the config dir explicitly, since the code might
  // construct the path before the HOME env var is set.
  process.env['GEMINI_CONFIG_DIR'] = join(runDir, '.gemini');

  // Download ripgrep to avoid race conditions in parallel tests
  const available = await canUseRipgrep();
  if (!available) {
    throw new Error('Failed to download ripgrep binary');
  }

  // Start the test fixture server
  const port = await startFixtureServer();
  process.env['TEST_FIXTURE_PORT'] = String(port);

  // Clean up old test runs, but keep the latest few for debugging
  try {
    const testRuns = await readdir(integrationTestsDir);
    if (testRuns.length > 5) {
      const oldRuns = testRuns.sort().slice(0, testRuns.length - 5);
      await Promise.all(
        oldRuns.map((oldRun) =>
          rm(join(integrationTestsDir, oldRun), {
            recursive: true,
            force: true,
          }),
        ),
      );
    }
  } catch (e) {
    console.error('Error cleaning up old test runs:', e);
  }

  process.env['INTEGRATION_TEST_FILE_DIR'] = runDir;
  process.env['GEMINI_CLI_INTEGRATION_TEST'] = 'true';
  // Force file storage to avoid keychain prompts/hangs in CI, especially on macOS
  process.env['GEMINI_FORCE_FILE_STORAGE'] = 'true';
  process.env['TELEMETRY_LOG_FILE'] = join(runDir, 'telemetry.log');

  if (process.env['KEEP_OUTPUT']) {
    console.log(`Keeping output for test run in: ${runDir}`);
  }
  process.env['VERBOSE'] = process.env['VERBOSE'] ?? 'false';

  console.log(`\nIntegration test output directory: ${runDir}`);
}

export async function teardown() {
  // Stop the fixture server
  if (fixtureServer) {
    await new Promise<void>((resolve) => {
      fixtureServer!.close(() => resolve());
    });
    fixtureServer = undefined;
  }

  // Disable mouse tracking
  if (process.stdout.isTTY) {
    disableMouseTracking();
  }

  // Cleanup the test run directory unless KEEP_OUTPUT is set
  if (process.env['KEEP_OUTPUT'] !== 'true' && runDir) {
    try {
      await rm(runDir, { recursive: true, force: true });
    } catch (e) {
      console.warn('Failed to clean up test run directory:', e);
    }
  }
}
