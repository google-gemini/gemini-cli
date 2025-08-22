/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, afterEach } from 'vitest';
import mock from 'mock-fs';
import path from 'path';
import { WorkspaceContext } from './workspaceContext.js';
import { readPathFromWorkspace } from './pathReader.js';

describe('readPathFromWorkspace', () => {
  const CWD = path.resolve('/test/cwd');
  const OTHER_DIR = path.resolve('/test/other');
  const OUTSIDE_DIR = path.resolve('/test/outside');

  afterEach(() => {
    mock.restore();
  });

  it('should read a file from the CWD', async () => {
    mock({
      [CWD]: {
        'file.txt': 'hello from cwd',
      },
      [OTHER_DIR]: {},
    });
    const workspace = new WorkspaceContext(CWD, [OTHER_DIR]);
    const result = await readPathFromWorkspace('file.txt', workspace);
    expect(result).toBe('hello from cwd');
  });

  it('should read a file from a secondary workspace directory', async () => {
    mock({
      [CWD]: {},
      [OTHER_DIR]: {
        'file.txt': 'hello from other dir',
      },
    });
    const workspace = new WorkspaceContext(CWD, [OTHER_DIR]);
    const result = await readPathFromWorkspace('file.txt', workspace);
    expect(result).toBe('hello from other dir');
  });

  it('should prioritize CWD when file exists in both CWD and secondary dir', async () => {
    mock({
      [CWD]: {
        'file.txt': 'hello from cwd',
      },
      [OTHER_DIR]: {
        'file.txt': 'hello from other dir',
      },
    });
    const workspace = new WorkspaceContext(CWD, [OTHER_DIR]);
    const result = await readPathFromWorkspace('file.txt', workspace);
    expect(result).toBe('hello from cwd');
  });

  it('should read a file from an absolute path if within workspace', async () => {
    const absPath = path.join(CWD, 'abs.txt');
    mock({
      [CWD]: {
        'abs.txt': 'absolute content',
      },
    });
    const workspace = new WorkspaceContext(CWD, []);
    const result = await readPathFromWorkspace(absPath, workspace);
    expect(result).toBe('absolute content');
  });

  it('should list a directory from the CWD', async () => {
    mock({
      [CWD]: {
        subdir: {
          'file1.txt': '',
          'file2.txt': '',
        },
      },
    });
    const workspace = new WorkspaceContext(CWD, []);
    const result = await readPathFromWorkspace('subdir', workspace);
    // mock-fs doesn't guarantee order, so we check for inclusion
    expect(result).toContain('Directory listing for subdir:');
    expect(result).toContain('- file1.txt');
    expect(result).toContain('- file2.txt');
  });

  it('should list a directory from a secondary workspace directory', async () => {
    mock({
      [CWD]: {},
      [OTHER_DIR]: {
        'other-subdir': {
          'file3.txt': '',
        },
      },
    });
    const workspace = new WorkspaceContext(CWD, [OTHER_DIR]);
    const result = await readPathFromWorkspace('other-subdir', workspace);
    expect(result).toContain('Directory listing for other-subdir:');
    expect(result).toContain('- file3.txt');
  });

  it('should throw an error for an absolute path outside the workspace', async () => {
    const absPath = path.join(OUTSIDE_DIR, 'secret.txt');
    mock({
      [CWD]: {},
      [OUTSIDE_DIR]: {
        'secret.txt': 'secrets',
      },
    });
    const workspace = new WorkspaceContext(CWD, []);
    await expect(readPathFromWorkspace(absPath, workspace)).rejects.toThrow(
      `Absolute path is outside of the allowed workspace: ${absPath}`,
    );
  });

  it('should throw an error if a relative path is not found anywhere', async () => {
    mock({
      [CWD]: {},
      [OTHER_DIR]: {},
    });
    const workspace = new WorkspaceContext(CWD, [OTHER_DIR]);
    await expect(
      readPathFromWorkspace('not-found.txt', workspace),
    ).rejects.toThrow('Path not found in workspace: not-found.txt');
  });

  it('should throw an error if fs permissions prevent reading', async () => {
    // Create a file with no read permissions for the user.
    // 0o222 is write-only for user, group, and others.
    mock({
      [CWD]: {
        'unreadable.txt': mock.file({
          content: 'you cannot read me',
          mode: 0o222,
        }),
      },
    });
    const workspace = new WorkspaceContext(CWD, []);
    await expect(
      readPathFromWorkspace('unreadable.txt', workspace),
    ).rejects.toThrow(/EACCES, permission denied/);
  });
});
