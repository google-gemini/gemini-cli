/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import {
  createPreWriteBackup,
  listBackupVersions,
  fnv1a64hex,
} from './file-backup.js';
import { debugLogger } from '../utils/debugLogger.js';

vi.mock('node:fs/promises');
vi.mock('node:fs', () => ({
  constants: { COPYFILE_EXCL: 1 },
}));
vi.mock('../utils/debugLogger.js', () => ({
  debugLogger: { warn: vi.fn() },
}));

const FILE_PATH = '/workspace/foo.ts';
const SESSION_ID = 'test-session';
const TEMP_DIR = '/tmp/project';
const HASH = fnv1a64hex(FILE_PATH);
const BACKUP_DIR = path.join(TEMP_DIR, 'backups', SESSION_ID);

const makeError = (code: string, message = code): NodeJS.ErrnoException =>
  Object.assign(new Error(message), { code });

const makeDirent = (name: string, isFile: boolean): unknown => ({
  isFile: () => isFile,
  name,
});

describe('createPreWriteBackup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(
      fsPromises.readFile as (
        path: string,
        encoding: string,
      ) => Promise<string>,
    ).mockResolvedValue('file content');
    vi.mocked(fsPromises.mkdir).mockResolvedValue(
      undefined as unknown as string,
    );
    vi.mocked(fsPromises.readdir).mockResolvedValue(
      [] as unknown as ReturnType<typeof fsPromises.readdir> extends Promise<
        infer T
      >
        ? T
        : never,
    );
    vi.mocked(fsPromises.copyFile).mockResolvedValue(undefined);
  });

  it('loops through 8 EEXIST collisions and claims the 9th slot', async () => {
    const eexist = makeError('EEXIST');
    vi.mocked(fsPromises.copyFile)
      .mockRejectedValueOnce(eexist)
      .mockRejectedValueOnce(eexist)
      .mockRejectedValueOnce(eexist)
      .mockRejectedValueOnce(eexist)
      .mockRejectedValueOnce(eexist)
      .mockRejectedValueOnce(eexist)
      .mockRejectedValueOnce(eexist)
      .mockRejectedValueOnce(eexist)
      .mockResolvedValueOnce(undefined);

    vi.mocked(fsPromises.readdir)
      .mockResolvedValueOnce(
        [] as unknown as ReturnType<typeof fsPromises.readdir> extends Promise<
          infer T
        >
          ? T
          : never,
      )
      .mockResolvedValueOnce([
        makeDirent(`${HASH}_9`, true),
      ] as unknown as ReturnType<typeof fsPromises.readdir> extends Promise<
        infer T
      >
        ? T
        : never);

    const result = await createPreWriteBackup(FILE_PATH, SESSION_ID, TEMP_DIR);

    expect(result).toEqual({
      ok: true,
      version: 9,
      backupPath: path.join(BACKUP_DIR, `${HASH}_9`),
    });
    expect(vi.mocked(fsPromises.copyFile)).toHaveBeenCalledTimes(9);
  });

  it('returns { ok: false, newFile: false } and logs a warning on EACCES', async () => {
    // If existingVersions is empty, readFile is skipped and copyFile is used directly.
    vi.mocked(fsPromises.copyFile).mockRejectedValueOnce(
      makeError('EACCES', 'Permission denied'),
    );

    const result = await createPreWriteBackup(FILE_PATH, SESSION_ID, TEMP_DIR);

    expect(result).toEqual({ ok: false, newFile: false });
    expect(vi.mocked(debugLogger.warn)).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('Failed to create backup'), expect.anything());
  });

  it('returns { ok: false, newFile: true } on ENOENT without logging', async () => {
    // If existingVersions is empty, readFile is skipped and copyFile is used directly.
    vi.mocked(fsPromises.copyFile).mockRejectedValueOnce(
      makeError('ENOENT', 'No such file'),
    );

    const result = await createPreWriteBackup(FILE_PATH, SESSION_ID, TEMP_DIR);

    expect(result).toEqual({ ok: false, newFile: true });
    expect(vi.mocked(debugLogger.warn)).not.toHaveBeenCalled();
  });

  it('logs EPERM errors during GC but still returns a successful backup result', async () => {
    const existingDirents = Array.from({ length: 22 }, (_, i) =>
      makeDirent(`${HASH}_${i + 1}`, true),
    );
    // listBackupVersions is called twice: once at the start and once for GC.
    // The second call (GC) should see the newly created version 23.
    const allDirents = Array.from({ length: 23 }, (_, i) =>
      makeDirent(`${HASH}_${i + 1}`, true),
    );

    vi.mocked(fsPromises.readdir)
      .mockResolvedValueOnce(
        existingDirents as unknown as ReturnType<
          typeof fsPromises.readdir
        > extends Promise<infer T>
          ? T
          : never,
      )
      .mockResolvedValueOnce(
        allDirents as unknown as ReturnType<
          typeof fsPromises.readdir
        > extends Promise<infer T>
          ? T
          : never,
      );

    vi.mocked(
      fsPromises.readFile as (
        path: string,
        encoding: string,
      ) => Promise<string>,
    )
      // Since existingVersions.length > 0, readFile is called for diskContent (if not provided)
      .mockResolvedValueOnce('new content') // disk read
      // and for the deduplication check
      .mockResolvedValueOnce('old content'); // last backup dedup check

    vi.mocked(fsPromises.copyFile).mockResolvedValueOnce(undefined);

    const eperm = makeError('EPERM', 'Operation not permitted');
    vi.mocked(fsPromises.unlink)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(eperm)
      .mockResolvedValueOnce(undefined);

    const result = await createPreWriteBackup(FILE_PATH, SESSION_ID, TEMP_DIR);

    expect(result).toEqual({
      ok: true,
      version: 23,
      backupPath: path.join(BACKUP_DIR, `${HASH}_23`),
    });
    expect(vi.mocked(fsPromises.unlink)).toHaveBeenCalledTimes(3);
    expect(vi.mocked(debugLogger.warn)).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('version 2'),
      eperm,
    );
  });

  it('skips disk read if diskContent is provided and existingVersions.length > 0', async () => {
    const existingDirents = [makeDirent(`${HASH}_1`, true)];
    vi.mocked(fsPromises.readdir).mockResolvedValue(
      existingDirents as unknown as ReturnType<
        typeof fsPromises.readdir
      > extends Promise<infer T>
        ? T
        : never,
    );

    vi.mocked(
      fsPromises.readFile as (
        path: string,
        encoding: string,
      ) => Promise<string>,
    ).mockResolvedValue('old content');

    const result = await createPreWriteBackup(
      FILE_PATH,
      SESSION_ID,
      TEMP_DIR,
      'new content',
    );

    expect(result.ok).toBe(true);
    // Should NOT have called readFile for diskContent
    expect(vi.mocked(fsPromises.readFile)).toHaveBeenCalledTimes(1); // Only for latest backup
    expect(vi.mocked(fsPromises.readFile)).not.toHaveBeenCalledWith(
      FILE_PATH,
      'utf8',
    );
  });

  it('performs deduplication if diskContent matches latest backup', async () => {
    const existingDirents = [makeDirent(`${HASH}_1`, true)];
    vi.mocked(fsPromises.readdir).mockResolvedValue(
      existingDirents as unknown as ReturnType<
        typeof fsPromises.readdir
      > extends Promise<infer T>
        ? T
        : never,
    );

    vi.mocked(
      fsPromises.readFile as (
        path: string,
        encoding: string,
      ) => Promise<string>,
    ).mockResolvedValue('same content');

    const result = await createPreWriteBackup(
      FILE_PATH,
      SESSION_ID,
      TEMP_DIR,
      'same content',
    );

    expect(result).toEqual({
      ok: true,
      version: 1,
      backupPath: path.join(BACKUP_DIR, `${HASH}_1`),
    });
    expect(vi.mocked(fsPromises.copyFile)).not.toHaveBeenCalled();
  });
});

describe('listBackupVersions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filters out non-files, corrupted suffixes, and wrong hashes', async () => {
    const otherHash = fnv1a64hex('/workspace/other.ts');
    vi.mocked(fsPromises.readdir).mockResolvedValueOnce([
      makeDirent(`${HASH}_1`, true),
      makeDirent(`${HASH}_2`, false),
      makeDirent(`${HASH}_Gulasch`, true),
      makeDirent(`${otherHash}_3`, true),
    ] as unknown as ReturnType<typeof fsPromises.readdir> extends Promise<
      infer T
    >
      ? T
      : never);

    const result = await listBackupVersions(FILE_PATH, SESSION_ID, TEMP_DIR);

    expect(result).toEqual([1]);
  });

  it('returns an empty array when the backup directory does not exist', async () => {
    vi.mocked(fsPromises.readdir).mockRejectedValueOnce(makeError('ENOENT'));

    const result = await listBackupVersions(FILE_PATH, SESSION_ID, TEMP_DIR);

    expect(result).toEqual([]);
    expect(vi.mocked(debugLogger.warn)).not.toHaveBeenCalled();
  });

  it('logs a warning and returns an empty array on unexpected readdir errors', async () => {
    vi.mocked(fsPromises.readdir).mockRejectedValueOnce(makeError('EACCES'));

    const result = await listBackupVersions(FILE_PATH, SESSION_ID, TEMP_DIR);

    expect(result).toEqual([]);
    expect(vi.mocked(debugLogger.warn)).toHaveBeenCalledOnce();
  });
});
