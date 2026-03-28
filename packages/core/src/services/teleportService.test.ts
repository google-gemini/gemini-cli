/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { TeleportService } from './teleportService.js';
import { type Config } from '../config/config.js';
import { spawnSync, type SpawnSyncOptions } from 'node:child_process';

const actualSpawnSync = (
  await vi.importActual<typeof import('node:child_process')>(
    'node:child_process',
  )
).spawnSync;

vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:child_process')>();
  return {
    ...original,
    spawnSync: vi
      .fn()
      .mockImplementation(
        (cmd: string, args: string[], options: SpawnSyncOptions) => {
          return original.spawnSync(cmd, args, options);
        },
      ),
  };
});

describe('TeleportService', () => {
  let tempDir: string;
  let config: Config;
  let teleportService: TeleportService;
  const sessionId = 'test-session-id-12345678';

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-teleport-test-'));

    fs.mkdirSync(path.join(tempDir, 'chats'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'logs'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, sessionId), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'tool-outputs', `session-${sessionId}`), {
      recursive: true,
    });

    const chatFileName = `session-2026-03-14-test-ses.json`;
    fs.writeFileSync(
      path.join(tempDir, 'chats', chatFileName),
      JSON.stringify({ sessionId, messages: [] }),
    );

    fs.writeFileSync(
      path.join(tempDir, 'logs', `session-${sessionId}.jsonl`),
      'log content',
    );

    config = {
      storage: {
        getProjectTempDir: () => tempDir,
      },
      getSessionId: () => sessionId,
    } as unknown as Config;

    teleportService = new TeleportService(config);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-explicit-any
    vi.mocked(spawnSync).mockImplementation(actualSpawnSync as any);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('should export a session successfully', async () => {
    const outputPath = path.join(tempDir, 'export.tar.gz');
    const result = await teleportService.exportSession(sessionId, outputPath);

    expect(result.sessionId).toBe(sessionId);
    expect(fs.existsSync(outputPath)).toBe(true);
    expect(result.filesIncluded.some((f) => f.includes('chats'))).toBe(true);
    expect(result.filesIncluded.some((f) => f.includes('logs'))).toBe(true);
  });

  it('should import a session successfully', async () => {
    const exportPath = path.join(tempDir, 'export.tar.gz');
    await teleportService.exportSession(sessionId, exportPath);

    const importTempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-import-test-'),
    );
    const importConfig = {
      storage: {
        getProjectTempDir: () => importTempDir,
      },
    } as unknown as Config;
    const importService = new TeleportService(importConfig);

    const result = await importService.importSession(exportPath);

    expect(result.sessionId).toBe(sessionId);
    expect(fs.existsSync(path.join(importTempDir, 'chats'))).toBe(true);

    const chatFiles = fs.readdirSync(path.join(importTempDir, 'chats'));
    expect(chatFiles.length).toBe(1);
    const importedChatContent = JSON.parse(
      fs.readFileSync(path.join(importTempDir, 'chats', chatFiles[0]), 'utf8'),
    );
    expect(importedChatContent.sessionId).toBe(sessionId);

    fs.rmSync(importTempDir, { recursive: true, force: true });
  });

  it('should export and import an encrypted session', async () => {
    const secret = 'super-secret';
    const exportPath = path.join(tempDir, 'encrypted.tar.gz');
    await teleportService.exportSession(sessionId, exportPath, secret);

    expect(fs.existsSync(exportPath)).toBe(true);
    const content = fs.readFileSync(exportPath);
    expect(content.subarray(0, 2).toString('hex')).not.toBe('1f8b'); // Gzip header

    const importTempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-encrypted-import-test-'),
    );
    const importConfig = {
      storage: {
        getProjectTempDir: () => importTempDir,
      },
    } as unknown as Config;
    const importService = new TeleportService(importConfig);

    const result = await importService.importSession(exportPath, secret);
    expect(result.sessionId).toBe(sessionId);
    expect(fs.existsSync(path.join(importTempDir, 'chats'))).toBe(true);

    fs.rmSync(importTempDir, { recursive: true, force: true });
  });

  it('should throw error on incorrect secret', async () => {
    const secret = 'super-secret';
    const exportPath = path.join(tempDir, 'encrypted-fail.tar.gz');
    await teleportService.exportSession(sessionId, exportPath, secret);

    const importTempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-encrypted-fail-test-'),
    );
    const importConfig = {
      storage: {
        getProjectTempDir: () => importTempDir,
      },
    } as unknown as Config;
    const importService = new TeleportService(importConfig);

    await expect(
      importService.importSession(exportPath, 'wrong-secret'),
    ).rejects.toThrow('Failed to decrypt');

    fs.rmSync(importTempDir, { recursive: true, force: true });
  });

  it('should throw security error on path traversal in tarball', async () => {
    vi.mocked(spawnSync).mockImplementation((cmd, args) => {
      if (
        cmd === 'tar' &&
        args &&
        Array.isArray(args) &&
        args.includes('-tf')
      ) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return {
          status: 0,
          stdout: Buffer.from('../../etc/passwd\nchats/file.json'),
          stderr: Buffer.from(''),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-explicit-any
      return actualSpawnSync(cmd as any, args as any);
    });

    const exportPath = path.join(tempDir, 'malicious.tar.gz');
    fs.writeFileSync(exportPath, 'dummy');

    await expect(teleportService.importSession(exportPath)).rejects.toThrow(
      'Security violation: Malicious path detected',
    );
  });

  it('should export to blob storage', async () => {
    const outputPath = path.join(tempDir, 'export-blob.tar.gz');
    const blobUri = 'gs://my-bucket/session.tar.gz';

    vi.mocked(spawnSync).mockImplementation((cmd, args, options) => {
      if (cmd === 'gcloud' || cmd === 'gsutil' || cmd === 'aws') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return {
          status: 0,
          stdout: Buffer.from(''),
          stderr: Buffer.from(''),
        } as any;
      }
      return actualSpawnSync(
        cmd,
        args as string[],
        options as SpawnSyncOptions,
      );
    });

    await teleportService.exportSession(
      sessionId,
      outputPath,
      undefined,
      blobUri,
    );

    expect(spawnSync).toHaveBeenCalledWith(
      expect.stringMatching(/gcloud|gsutil|aws/),
      expect.arrayContaining(['cp', outputPath, blobUri]),
    );
  });

  it('should import from blob storage', async () => {
    const blobUri = 'gs://my-bucket/session.tar.gz';

    vi.mocked(spawnSync).mockImplementation((cmd, args, options) => {
      if (cmd === 'gcloud' || cmd === 'gsutil' || cmd === 'aws') {
        if (args && Array.isArray(args)) {
          const dest = args[args.length - 1];
          const chatFileName = path.join(
            tempDir,
            'chats',
            `session-2026-03-14-test-ses.json`,
          );
          if (!fs.existsSync(path.join(tempDir, 'chats'))) {
            fs.mkdirSync(path.join(tempDir, 'chats'), { recursive: true });
          }
          if (!fs.existsSync(chatFileName)) {
            fs.writeFileSync(
              chatFileName,
              JSON.stringify({ sessionId, messages: [] }),
            );
          }
          actualSpawnSync('tar', ['-czf', dest, '-C', tempDir, 'chats']);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return {
          status: 0,
          stdout: Buffer.from(''),
          stderr: Buffer.from(''),
        } as any;
      }
      return actualSpawnSync(
        cmd,
        args as string[],
        options as SpawnSyncOptions,
      );
    });

    const result = await teleportService.importSession(blobUri);
    expect(result.sessionId).toBe(sessionId);
    expect(spawnSync).toHaveBeenCalledWith(
      expect.stringMatching(/gcloud|gsutil|aws/),
      expect.arrayContaining(['cp', blobUri, expect.any(String)]),
    );
  });
});
