/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { IDEServer } from './ide-server.js';
import type { DiffManager } from './diff-manager.js';

const { vscodeMock: baseVscodeMock } = await vi.hoisted(
  () => import('./utils/vscode-mock.js'),
);

const vscodeMock = vi.hoisted(() => ({
  ...baseVscodeMock,
  workspace: {
    ...baseVscodeMock.workspace,
    workspaceFolders: [
      {
        uri: {
          fsPath: '/test/workspace',
        },
      },
    ],
    isTrusted: true,
  },
}));

vi.mock('vscode', () => vscodeMock);

vi.mock('./open-files-manager', () => {
  const OpenFilesManager = vi.fn();
  OpenFilesManager.prototype.onDidChange = vi.fn(() => ({ dispose: vi.fn() }));
  OpenFilesManager.prototype.dispose = vi.fn();
  OpenFilesManager.prototype.state = {
    workspaceState: { openFiles: [], isTrusted: true },
  };
  return { OpenFilesManager };
});

describe.skipIf(process.platform === 'win32')(
  'IDEServer port file persistence',
  () => {
    let tempRoot: string;
    let ideServer: IDEServer;
    let mockContext: vscode.ExtensionContext;
    let mockLog: (message: string) => void;
    let originalUmask: number;

    beforeEach(async () => {
      originalUmask = process.umask(0o022);
      tempRoot = await fs.mkdtemp(
        path.join(os.tmpdir(), 'gemini-ide-port-test-'),
      );
      vi.stubEnv('TMPDIR', tempRoot);
      vi.stubEnv('TMP', tempRoot);
      vi.stubEnv('TEMP', tempRoot);

      mockLog = vi.fn();
      const mockDiffManager = {
        onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
      } as unknown as DiffManager;
      ideServer = new IDEServer(mockLog, mockDiffManager);
      mockContext = {
        subscriptions: [],
        environmentVariableCollection: {
          replace: vi.fn(),
          clear: vi.fn(),
        },
      } as unknown as vscode.ExtensionContext;
    });

    afterEach(async () => {
      process.umask(originalUmask);
      await ideServer.stop();
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
      await fs.rm(tempRoot, { recursive: true, force: true });
    });

    const getExpectedPortDir = () =>
      path.join(tempRoot, `gemini-ide-${process.getuid!()}`);

    const getPortFromContext = () => {
      const port = vi
        .mocked(mockContext.environmentVariableCollection.replace)
        .mock.calls.find(([k]) => k === 'GEMINI_CLI_IDE_SERVER_PORT')?.[1];
      expect(port).toBeDefined();
      return port!;
    };

    it('creates per-user 0700 directory and maintains 0600 file modes across start and syncEnvVars', async () => {
      process.umask(0o000);
      const portDir = getExpectedPortDir();
      await fs.mkdir(portDir, { mode: 0o700 });

      const unexpectedModes: Array<{ file: string; mode: string }> = [];
      const watcher = fsSync.watch(portDir, (_eventType, filename) => {
        if (!filename) return;
        try {
          const st = fsSync.lstatSync(path.join(portDir, filename));
          if ((st.mode & 0o077) !== 0) {
            unexpectedModes.push({
              file: filename,
              mode: (st.mode & 0o777).toString(8),
            });
          }
        } catch {
          // Transient temporary file already renamed.
        }
      });

      try {
        await ideServer.start(mockContext);
        await ideServer.syncEnvVars();
      } finally {
        watcher.close();
      }

      expect(unexpectedModes).toEqual([]);

      const dirStat = await fs.lstat(portDir);
      expect(dirStat.isSymbolicLink()).toBe(false);
      expect(dirStat.isDirectory()).toBe(true);
      expect(dirStat.uid).toBe(process.getuid!());
      expect(dirStat.mode & 0o777).toBe(0o700);

      await expect(
        fs.lstat(path.join(tempRoot, 'gemini')),
      ).rejects.toMatchObject({
        code: 'ENOENT',
      });

      const port = getPortFromContext();
      const portFile = path.join(
        portDir,
        `gemini-ide-server-${process.ppid}-${port}.json`,
      );
      const fileStat = await fs.lstat(portFile);
      expect(fileStat.isSymbolicLink()).toBe(false);
      expect(fileStat.isFile()).toBe(true);
      expect(fileStat.mode & 0o777).toBe(0o600);

      const parsed = JSON.parse(await fs.readFile(portFile, 'utf8')) as {
        port: number;
        authToken: string;
      };
      expect(parsed.port).toBe(Number(port));
      expect(parsed.authToken).toBeTruthy();

      const remainingTmpFiles = (await fs.readdir(portDir)).filter((f) =>
        f.endsWith('.tmp'),
      );
      expect(remainingTmpFiles).toEqual([]);
    });

    it('skips writing port file when portDir is a symbolic link', async () => {
      const externalDir = path.join(tempRoot, 'linked-dir');
      await fs.mkdir(externalDir, { mode: 0o755 });
      await fs.symlink(externalDir, getExpectedPortDir());

      await ideServer.start(mockContext);

      expect(await fs.readdir(externalDir)).toEqual([]);
      expect(mockLog).toHaveBeenCalledWith(
        expect.stringContaining('Failed to create IDE port file'),
      );
    });

    it('updates existing user-owned portDir mode to 0700 and replaces symbolic link at portFile via rename', async () => {
      const portDir = getExpectedPortDir();
      await fs.mkdir(portDir, { mode: 0o755 });
      await fs.chmod(portDir, 0o755);
      expect((await fs.lstat(portDir)).mode & 0o777).toBe(0o755);

      await ideServer.start(mockContext);
      expect((await fs.lstat(portDir)).mode & 0o777).toBe(0o700);

      const port = getPortFromContext();
      const portFile = path.join(
        portDir,
        `gemini-ide-server-${process.ppid}-${port}.json`,
      );

      const existingFile = path.join(tempRoot, 'existing.txt');
      await fs.writeFile(existingFile, 'ORIGINAL_CONTENT', { mode: 0o600 });
      await fs.unlink(portFile);
      await fs.symlink(existingFile, portFile);

      await ideServer.syncEnvVars();

      expect(await fs.readFile(existingFile, 'utf8')).toBe('ORIGINAL_CONTENT');
      const portFileStat = await fs.lstat(portFile);
      expect(portFileStat.isSymbolicLink()).toBe(false);
      expect(portFileStat.isFile()).toBe(true);
      expect(portFileStat.mode & 0o777).toBe(0o600);
    });
  },
);
