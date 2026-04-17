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

import { loadCliConfig } from '../config/config.js';
import type { CliArgs } from '../config/config.js';
import {
  createTestMergedSettings,
  type LoadedSettings,
} from '../config/settings.js';

vi.mock('../config/config.js', () => ({
  loadCliConfig: vi.fn(),
}));

vi.mock('../utils/cleanup.js', () => ({
  runExitCleanup: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../validateNonInterActiveAuth.js', () => ({
  validateNonInteractiveAuth: vi.fn(),
}));

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  type CoreModule = typeof import('@google/gemini-cli-core');
  const actual = await importOriginal<CoreModule>();
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
  const tokenPath = `${testHome}/.gemini/daemon.token`;
  let mockServer: net.Server;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'exit').mockImplementation(
      (() => {}) as unknown as typeof process.exit,
    );
    if (typeof process.umask === 'function') {
      vi.spyOn(process, 'umask').mockImplementation(() => 0o22);
    }

    // Mock os.homedir to avoid polluting real user dirs
    vi.spyOn(os, 'homedir').mockReturnValue(testHome);
    if (!fs.existsSync(`${testHome}/.gemini`)) {
      fs.mkdirSync(`${testHome}/.gemini`, { recursive: true });
    }

    // Mock loadCliConfig used by daemon startup pre-auth and session init.
    // For our unit tests we only need the base config to initialize/dispose.
    (loadCliConfig as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      initialize: vi.fn().mockResolvedValue(undefined),
      refreshAuth: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn().mockResolvedValue(undefined),
    });
  });

  afterEach(() => {
    if (mockServer) {
      mockServer.close();
    }
    if (fs.existsSync(socketPath)) {
      fs.unlinkSync(socketPath);
    }
    if (fs.existsSync(tokenPath)) {
      fs.unlinkSync(tokenPath);
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
      if (process.platform === 'win32') {
        // checkDaemonStatus uses Unix sockets; unsupported on Windows.
        return;
      }
      const isRunning = await checkDaemonStatus();
      expect(isRunning).toBe(false);
    });

    it('should return true if daemon is running', async () => {
      if (process.platform === 'win32') {
        return;
      }
      mockServer = net.createServer().listen(socketPath);
      await new Promise((resolve) => setTimeout(resolve, 100)); // wait for listen

      const isRunning = await checkDaemonStatus();
      expect(isRunning).toBe(true);
    });

    // We can add more comprehensive e2e test if necessary.
  });

  describe('daemonServer', () => {
    function daemonTestSettings(): LoadedSettings {
      return {
        merged: createTestMergedSettings({
          security: {
            auth: { selectedType: undefined, useExternal: false },
          },
        }),
      } as LoadedSettings;
    }

    const baseArgv = {} as CliArgs;

    it('rejects unauthenticated prompt requests', async () => {
      if (process.platform === 'win32') {
        // Daemon mode is not supported on Windows.
        return;
      }

      const { startDaemon } = await import('./daemonServer.js');
      const settings = daemonTestSettings();

      await startDaemon(settings, baseArgv);
      // Wait for daemon to be reachable.
      await new Promise<void>((resolve, reject) => {
        const deadline = Date.now() + 2000;
        const tick = async () => {
          try {
            const ok = await checkDaemonStatus();
            if (ok) return resolve();
          } catch {
            // ignore
          }
          if (Date.now() > deadline) return reject(new Error('timeout'));
          setTimeout(tick, 50);
        };
        void tick();
      });

      const clientResponse: string = await new Promise((resolve) => {
        let buffer = '';
        const client = net.createConnection(socketPath);
        client.on('connect', () => {
          client.write(
            JSON.stringify({
              action: 'prompt',
              session: 'test',
              cwd: testHome,
              input: 'hello',
              token: 'wrong-token',
            }) + '\n',
          );
        });
        client.on('data', (d: Buffer) => {
          buffer += d.toString('utf8');
        });
        client.on('end', () => resolve(buffer));
      });

      const messages = clientResponse
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => JSON.parse(l));

      expect(
        messages.some(
          (m) =>
            m.type === 'error' && m.content === 'Unauthorized daemon request.',
        ),
      ).toBe(true);
      expect(messages.some((m) => m.type === 'end')).toBe(true);

      const token = fs.readFileSync(tokenPath, 'utf8').trim();
      // Graceful shutdown (process.exit is mocked in beforeEach).
      await new Promise((resolve) => {
        const stopClient = net.createConnection(socketPath);
        stopClient.on('connect', () => {
          stopClient.write(JSON.stringify({ action: 'stop', token }) + '\n');
        });
        stopClient.on('data', () => {});
        stopClient.on('end', () => resolve(undefined));
      });
    });

    it('rejects prompt cwd outside $HOME', async () => {
      if (process.platform === 'win32') {
        // Daemon mode is not supported on Windows.
        return;
      }

      const { startDaemon } = await import('./daemonServer.js');
      const settings = daemonTestSettings();

      await startDaemon(settings, baseArgv);
      await new Promise<void>((resolve, reject) => {
        const deadline = Date.now() + 2000;
        const tick = async () => {
          try {
            const ok = await checkDaemonStatus();
            if (ok) return resolve();
          } catch {
            // ignore
          }
          if (Date.now() > deadline) return reject(new Error('timeout'));
          setTimeout(tick, 50);
        };
        void tick();
      });

      const token = fs.readFileSync(tokenPath, 'utf8').trim();

      const clientResponse: string = await new Promise((resolve) => {
        let buffer = '';
        const client = net.createConnection(socketPath);
        client.on('connect', () => {
          client.write(
            JSON.stringify({
              action: 'prompt',
              session: 'test',
              cwd: '/', // outside mocked $HOME
              input: 'hello',
              token,
            }) + '\n',
          );
        });
        client.on('data', (d: Buffer) => {
          buffer += d.toString('utf8');
        });
        client.on('end', () => resolve(buffer));
      });

      const messages = clientResponse
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => JSON.parse(l));

      const errorMessage = messages.find((m) => m.type === 'error')?.content;
      expect(errorMessage).toContain(
        'Security restriction - session cwd must be within the user home directory.',
      );
      expect(messages.some((m) => m.type === 'end')).toBe(true);

      // Graceful shutdown (process.exit is mocked in beforeEach).
      await new Promise((resolve) => {
        const stopClient = net.createConnection(socketPath);
        stopClient.on('connect', () => {
          stopClient.write(JSON.stringify({ action: 'stop', token }) + '\n');
        });
        stopClient.on('data', () => {});
        stopClient.on('end', () => resolve(undefined));
      });
    });
  });
});
