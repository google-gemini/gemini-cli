/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import { getDaemonSocketPath, checkDaemonStatus } from './daemonClient.js';

vi.mock('../config/config.js');
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    debugLogger: {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    },
    writeToStdout: vi.fn(),
    writeToStderr: vi.fn(),
  };
});

describe('Daemon Mode', () => {
  const testHome = '/tmp/gemini-test-home';
  const socketPath = `${testHome}/.gemini/daemon.sock`;
  let mockServer: net.Server;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as unknown as (
      code?: number,
    ) => never);

    // Mock os.homedir to avoid polluting real user dirs
    vi.spyOn(os, 'homedir').mockReturnValue(testHome);
    if (!fs.existsSync(`${testHome}/.gemini`)) {
      fs.mkdirSync(`${testHome}/.gemini`, { recursive: true });
    }
  });

  afterEach(() => {
    if (mockServer) {
      mockServer.close();
    }
    if (fs.existsSync(socketPath)) {
      fs.unlinkSync(socketPath);
    }
  });

  describe('daemonClient', () => {
    it('should throw an error on Windows', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });
      expect(() => getDaemonSocketPath()).toThrow(
        'Daemon mode is currently not supported on Windows.',
      );
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should return false if daemon is not running', async () => {
      const isRunning = await checkDaemonStatus();
      expect(isRunning).toBe(false);
    });

    it('should return true if daemon is running', async () => {
      mockServer = net.createServer().listen(socketPath);
      await new Promise((resolve) => setTimeout(resolve, 100)); // wait for listen

      const isRunning = await checkDaemonStatus();
      expect(isRunning).toBe(true);
    });

    // We can add more comprehensive e2e test if necessary.
  });
});
