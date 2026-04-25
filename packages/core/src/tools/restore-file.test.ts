/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { RestoreFileTool } from './restore-file.js';
import type { Config } from '../config/config.js';
import { ApprovalMode } from '../policy/types.js';
import { fnv1a64hex } from './file-backup.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';

vi.mock('node:fs/promises');
vi.mock('node:fs', () => ({
  constants: { COPYFILE_EXCL: 1 },
  realpathSync: (p: string) => p,
}));
vi.mock('../utils/debugLogger.js', () => ({
  debugLogger: { warn: vi.fn() },
}));

const SESSION_ID = 'test-session';
const TEMP_DIR = '/tmp/project';
const TARGET_DIR = '/workspace';
const FILE_PATH = 'foo.ts';
const RESOLVED_PATH = path.join(TARGET_DIR, FILE_PATH);
const HASH = fnv1a64hex(RESOLVED_PATH);
const BACKUP_DIR = path.join(TEMP_DIR, 'backups', SESSION_ID);
const BACKUP_VERSION = 3;
const BACKUP_PATH = path.join(BACKUP_DIR, `${HASH}_${BACKUP_VERSION}`);

const makeError = (code: string, message = code): NodeJS.ErrnoException =>
  Object.assign(new Error(message), { code });

const mockConfig = {
  validatePathAccess: vi.fn().mockReturnValue(null),
  getTargetDir: vi.fn().mockReturnValue(TARGET_DIR),
  getSessionId: vi.fn().mockReturnValue(SESSION_ID),
  storage: {
    getProjectTempDir: vi.fn().mockReturnValue(TEMP_DIR),
  },
  getApprovalMode: vi.fn().mockReturnValue(ApprovalMode.DEFAULT),
};

describe('RestoreFileTool.validateToolParamValues — path guard', () => {
  let bus: ReturnType<typeof createMockMessageBus>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.validatePathAccess.mockReturnValue(null);
    mockConfig.getTargetDir.mockReturnValue(TARGET_DIR);
    bus = createMockMessageBus();
  });

  it('rejects whitespace-only file_path without touching the filesystem', () => {
    const tool = new RestoreFileTool(mockConfig as unknown as Config, bus);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const error = (tool as any).validateToolParamValues({
      file_path: '   ',
      version: 1,
    });

    expect(error).toBe('file_path is required');
    expect(vi.mocked(fsPromises.access)).not.toHaveBeenCalled();
    expect(vi.mocked(fsPromises.readFile)).not.toHaveBeenCalled();
  });

  it('rejects paths outside the workspace without touching the filesystem', () => {
    mockConfig.validatePathAccess.mockReturnValue(
      'Path is outside the workspace',
    );

    const tool = new RestoreFileTool(mockConfig as unknown as Config, bus);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const error = (tool as any).validateToolParamValues({
      file_path: '../../etc/passwd',
      version: 1,
    });

    expect(error).toContain('outside the workspace');
    expect(vi.mocked(fsPromises.access)).not.toHaveBeenCalled();
    expect(vi.mocked(fsPromises.readFile)).not.toHaveBeenCalled();
  });
});

describe('RestoreFileTool.execute — nuclear restore', () => {
  let bus: ReturnType<typeof createMockMessageBus>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.validatePathAccess.mockReturnValue(null);
    mockConfig.getTargetDir.mockReturnValue(TARGET_DIR);
    mockConfig.getSessionId.mockReturnValue(SESSION_ID);
    mockConfig.storage.getProjectTempDir.mockReturnValue(TEMP_DIR);
    bus = createMockMessageBus();
  });

  it('recreates the parent directory and restores when target file and its directory are gone', async () => {
    vi.mocked(fsPromises.access).mockResolvedValueOnce(undefined);
    vi.mocked(
      fsPromises.readFile as (
        path: string,
        encoding: string,
      ) => Promise<string>,
    ).mockRejectedValueOnce(makeError('ENOENT', 'No such file or directory'));
    vi.mocked(fsPromises.mkdir).mockResolvedValueOnce(
      undefined as unknown as string,
    );
    vi.mocked(fsPromises.copyFile).mockResolvedValueOnce(undefined);

    const tool = new RestoreFileTool(mockConfig as unknown as Config, bus);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invocation = (tool as any).createInvocation(
      { file_path: FILE_PATH, version: BACKUP_VERSION },
      bus,
    );
    const result = await invocation.execute({
      abortSignal: new AbortController().signal,
    });

    expect(result.error).toBeUndefined();
    expect(result.llmContent).toContain('Successfully restored');

    expect(vi.mocked(fsPromises.mkdir)).toHaveBeenCalledWith(
      path.dirname(RESOLVED_PATH),
      { recursive: true },
    );
    expect(vi.mocked(fsPromises.copyFile)).toHaveBeenCalledWith(
      BACKUP_PATH,
      RESOLVED_PATH,
    );

    const mkdirOrder = vi.mocked(fsPromises.mkdir).mock.invocationCallOrder[0];
    const copyFileOrder = vi.mocked(fsPromises.copyFile).mock
      .invocationCallOrder[0];
    expect(mkdirOrder).toBeLessThan(copyFileOrder);
  });

  it('returns FILE_WRITE_FAILURE when access returns EACCES instead of silently proceeding', async () => {
    vi.mocked(fsPromises.access).mockRejectedValueOnce(
      makeError('EACCES', 'Permission denied'),
    );

    const tool = new RestoreFileTool(mockConfig as unknown as Config, bus);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invocation = (tool as any).createInvocation(
      { file_path: FILE_PATH, version: BACKUP_VERSION },
      bus,
    );
    const result = await invocation.execute({
      abortSignal: new AbortController().signal,
    });

    expect(result.error).toBeDefined();
    expect(result.llmContent).toContain('EACCES');
    expect(vi.mocked(fsPromises.copyFile)).not.toHaveBeenCalled();
  });

  it('aborts with an error when mkdir for the parent directory fails', async () => {
    vi.mocked(fsPromises.access).mockResolvedValueOnce(undefined);
    vi.mocked(
      fsPromises.readFile as (
        path: string,
        encoding: string,
      ) => Promise<string>,
    ).mockRejectedValueOnce(makeError('ENOENT'));
    vi.mocked(fsPromises.mkdir).mockRejectedValueOnce(
      makeError('EACCES', 'Permission denied'),
    );

    const tool = new RestoreFileTool(mockConfig as unknown as Config, bus);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invocation = (tool as any).createInvocation(
      { file_path: FILE_PATH, version: BACKUP_VERSION },
      bus,
    );
    const result = await invocation.execute({
      abortSignal: new AbortController().signal,
    });

    expect(result.error).toBeDefined();
    expect(result.llmContent).toContain('Cannot create parent directory');
    expect(vi.mocked(fsPromises.copyFile)).not.toHaveBeenCalled();
  });
});
