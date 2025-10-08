/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { newCommand } from './new.js';
import yargs from 'yargs';
import * as fsPromises from 'node:fs/promises';
import path from 'node:path';

vi.mock('node:fs/promises');

const mockedFs = vi.mocked(fsPromises);

describe('extensions new command', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    const fakeFiles = [
      { name: 'context', isDirectory: () => true },
      { name: 'custom-commands', isDirectory: () => true },
      { name: 'mcp-server', isDirectory: () => true },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedFs.readdir.mockResolvedValue(fakeFiles as any);
  });

  it('should fail if no path is provided', async () => {
    const parser = yargs([]).command(newCommand).fail(false).locale('en');
    await expect(parser.parseAsync('new')).rejects.toThrow(
      'Not enough non-option arguments: got 0, need at least 1',
    );
  });

  it('should create directory when no template is provided', async () => {
    mockedFs.access.mockRejectedValue(new Error('ENOENT'));
    mockedFs.mkdir.mockResolvedValue(undefined);

    const parser = yargs([]).command(newCommand).fail(false);

    await parser.parseAsync('new /some/path');

    expect(mockedFs.mkdir).toHaveBeenCalledWith('/some/path', {
      recursive: true,
    });
    expect(mockedFs.cp).not.toHaveBeenCalled();
  });

  it('should create directory and copy files when path does not exist', async () => {
    mockedFs.access.mockRejectedValue(new Error('ENOENT'));
    mockedFs.mkdir.mockResolvedValue(undefined);
    mockedFs.cp.mockResolvedValue(undefined);

    const parser = yargs([]).command(newCommand).fail(false);

    await parser.parseAsync('new /some/path context');

    expect(mockedFs.mkdir).toHaveBeenCalledWith('/some/path', {
      recursive: true,
    });
    expect(mockedFs.cp).toHaveBeenCalledWith(
      expect.stringContaining(path.normalize('context/context')),
      path.normalize('/some/path/context'),
      { recursive: true },
    );
    expect(mockedFs.cp).toHaveBeenCalledWith(
      expect.stringContaining(path.normalize('context/custom-commands')),
      path.normalize('/some/path/custom-commands'),
      { recursive: true },
    );
    expect(mockedFs.cp).toHaveBeenCalledWith(
      expect.stringContaining(path.normalize('context/mcp-server')),
      path.normalize('/some/path/mcp-server'),
      { recursive: true },
    );
  });

  it('should throw an error if the path already exists', async () => {
    mockedFs.access.mockResolvedValue(undefined);
    const parser = yargs([]).command(newCommand).fail(false);

    await expect(parser.parseAsync('new /some/path context')).rejects.toThrow(
      'Path already exists: /some/path',
    );

    expect(mockedFs.mkdir).not.toHaveBeenCalled();
    expect(mockedFs.cp).not.toHaveBeenCalled();
  });
});
