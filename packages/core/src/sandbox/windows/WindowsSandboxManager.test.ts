/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WindowsSandboxManager } from './WindowsSandboxManager.js';
import * as sandboxManager from '../../services/sandboxManager.js';
import type { SandboxRequest } from '../../services/sandboxManager.js';
import { spawnAsync } from '../../utils/shell-utils.js';

vi.mock('../../utils/shell-utils.js', () => ({
  spawnAsync: vi.fn(),
}));

describe('WindowsSandboxManager', () => {
  let manager: WindowsSandboxManager;
  let testCwd: string;

  beforeEach(() => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');
    vi.spyOn(sandboxManager, 'tryRealpath').mockImplementation(async (p) =>
      p.toString(),
    );
    testCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-cli-test-'));
    manager = new WindowsSandboxManager({ workspace: testCwd });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(testCwd, { recursive: true, force: true });
  });

  describe('prepareCommand', () => {
    it('should correctly format the base command and args', async () => {
      const req: SandboxRequest = {
        command: 'whoami',
        args: ['/groups'],
        cwd: testCwd,
        env: { TEST_VAR: 'test_value' },
        policy: {
          networkAccess: false,
        },
      };

      const result = await manager.prepareCommand(req);

      expect(result.program).toContain('GeminiSandbox.exe');
      expect(result.args).toEqual(['0', testCwd, 'whoami', '/groups']);
    });

    it('should correctly pass through the cwd to the resulting command', async () => {
      const req: SandboxRequest = {
        command: 'whoami',
        args: [],
        cwd: '/different/cwd',
        env: {},
      };

      const result = await manager.prepareCommand(req);

      expect(result.cwd).toBe('/different/cwd');
    });

    it('should apply environment sanitization via the default mechanisms', async () => {
      const req: SandboxRequest = {
        command: 'test',
        args: [],
        cwd: testCwd,
        env: {
          API_KEY: 'secret',
          PATH: '/usr/bin',
        },
        policy: {
          sanitizationConfig: {
            allowedEnvironmentVariables: ['PATH'],
            blockedEnvironmentVariables: ['API_KEY'],
            enableEnvironmentVariableRedaction: true,
          },
        },
      };

      const result = await manager.prepareCommand(req);
      expect(result.env['PATH']).toBe('/usr/bin');
      expect(result.env['API_KEY']).toBeUndefined();
    });

    it('should allow network when networkAccess is true', async () => {
      const req: SandboxRequest = {
        command: 'whoami',
        args: [],
        cwd: testCwd,
        env: {},
        policy: {
          networkAccess: true,
        },
      };

      const result = await manager.prepareCommand(req);
      expect(result.args[0]).toBe('1');
    });

    describe('governance files', () => {
      it('should ensure governance files exist', async () => {
        const req: SandboxRequest = {
          command: 'test',
          args: [],
          cwd: testCwd,
          env: {},
        };

        await manager.prepareCommand(req);

        expect(fs.existsSync(path.join(testCwd, '.gitignore'))).toBe(true);
        expect(fs.existsSync(path.join(testCwd, '.geminiignore'))).toBe(true);
        expect(fs.existsSync(path.join(testCwd, '.git'))).toBe(true);
        expect(fs.lstatSync(path.join(testCwd, '.git')).isDirectory()).toBe(
          true,
        );
      });
    });

    describe('allowedPaths', () => {
      it('should parameterize allowed paths and normalize them', async () => {
        const allowedPath = path.join(os.tmpdir(), 'gemini-cli-test-allowed');
        if (!fs.existsSync(allowedPath)) {
          fs.mkdirSync(allowedPath);
        }
        try {
          const req: SandboxRequest = {
            command: 'test',
            args: [],
            cwd: testCwd,
            env: {},
            policy: {
              allowedPaths: [allowedPath],
            },
          };

          await manager.prepareCommand(req);

          expect(spawnAsync).toHaveBeenCalledWith('icacls', [
            path.resolve(testCwd),
            '/setintegritylevel',
            'Low',
          ]);

          expect(spawnAsync).toHaveBeenCalledWith('icacls', [
            path.resolve(allowedPath),
            '/setintegritylevel',
            'Low',
          ]);
        } finally {
          fs.rmSync(allowedPath, { recursive: true, force: true });
        }
      });
    });

    describe('forbiddenPaths', () => {
      it('should parameterize forbidden paths and explicitly deny them', async () => {
        const forbiddenPath = path.join(
          os.tmpdir(),
          'gemini-cli-test-forbidden',
        );
        if (!fs.existsSync(forbiddenPath)) {
          fs.mkdirSync(forbiddenPath);
        }
        try {
          const req: SandboxRequest = {
            command: 'test',
            args: [],
            cwd: testCwd,
            env: {},
            policy: {
              forbiddenPaths: [forbiddenPath],
            },
          };

          await manager.prepareCommand(req);

          expect(spawnAsync).toHaveBeenCalledWith('icacls', [
            path.resolve(forbiddenPath),
            '/deny',
            '*S-1-16-4096:(OI)(CI)(F)',
          ]);
        } finally {
          fs.rmSync(forbiddenPath, { recursive: true, force: true });
        }
      });

      it('explicitly denies non-existent forbidden paths to prevent creation', async () => {
        const missingPath = path.join(
          os.tmpdir(),
          'gemini-cli-test-missing',
          'does-not-exist.txt',
        );

        // Ensure it definitely doesn't exist
        if (fs.existsSync(missingPath)) {
          fs.rmSync(missingPath, { recursive: true, force: true });
        }

        const req: SandboxRequest = {
          command: 'test',
          args: [],
          cwd: testCwd,
          env: {},
          policy: {
            forbiddenPaths: [missingPath],
          },
        };

        await manager.prepareCommand(req);

        // Should NOT have called icacls to deny the missing path
        expect(spawnAsync).not.toHaveBeenCalledWith('icacls', [
          path.resolve(missingPath),
          '/deny',
          '*S-1-16-4096:(OI)(CI)(F)',
        ]);
      });

      it('should override allowed paths if a path is also in forbidden paths', async () => {
        const conflictPath = path.join(os.tmpdir(), 'gemini-cli-test-conflict');
        if (!fs.existsSync(conflictPath)) {
          fs.mkdirSync(conflictPath);
        }
        try {
          const req: SandboxRequest = {
            command: 'test',
            args: [],
            cwd: testCwd,
            env: {},
            policy: {
              allowedPaths: [conflictPath],
              forbiddenPaths: [conflictPath],
            },
          };

          await manager.prepareCommand(req);

          const spawnMock = vi.mocked(spawnAsync);
          const allowCallIndex = spawnMock.mock.calls.findIndex(
            (call) =>
              call[1] &&
              call[1].includes('/setintegritylevel') &&
              call[0] === 'icacls' &&
              call[1][0] === path.resolve(conflictPath),
          );
          const denyCallIndex = spawnMock.mock.calls.findIndex(
            (call) =>
              call[1] &&
              call[1].includes('/deny') &&
              call[0] === 'icacls' &&
              call[1][0] === path.resolve(conflictPath),
          );

          // Both should have been called
          expect(allowCallIndex).toBeGreaterThan(-1);
          expect(denyCallIndex).toBeGreaterThan(-1);

          // Verify order: explicitly denying must happen after the explicit allow
          expect(allowCallIndex).toBeLessThan(denyCallIndex);
        } finally {
          fs.rmSync(conflictPath, { recursive: true, force: true });
        }
      });
    });
  });
});
