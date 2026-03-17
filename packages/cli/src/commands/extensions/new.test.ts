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
vi.mock('../utils.js', () => ({
  exitCli: vi.fn(),
}));

const mockedFs = vi.mocked(fsPromises);

describe('extensions new command', () => {
  const topLevelTemplateEntries = [
    { name: 'custom-commands', isDirectory: () => true },
    { name: 'exclude-tools', isDirectory: () => true },
    { name: 'hooks', isDirectory: () => true },
    { name: 'mcp-server', isDirectory: () => true },
    { name: 'morph', isDirectory: () => true },
    { name: 'policies', isDirectory: () => true },
    { name: 'skills', isDirectory: () => true },
    { name: 'themes-example', isDirectory: () => true },
  ];

  const morphTemplateEntries = [
    { name: '.gitignore', isDirectory: () => false },
    { name: 'GEMINI.md', isDirectory: () => false },
    { name: 'README.md', isDirectory: () => false },
    { name: 'gemini-extension.json', isDirectory: () => false },
    { name: 'morph-server.js', isDirectory: () => false },
    { name: 'package.json', isDirectory: () => false },
  ];

  beforeEach(() => {
    vi.resetAllMocks();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedFs.readdir.mockResolvedValue(topLevelTemplateEntries as any);
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

  it('should create directory and copy morph template files when path does not exist', async () => {
    mockedFs.access.mockRejectedValue(new Error('ENOENT'));
    mockedFs.mkdir.mockResolvedValue(undefined);
    mockedFs.cp.mockResolvedValue(undefined);
    mockedFs.readdir
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValueOnce(topLevelTemplateEntries as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValueOnce(morphTemplateEntries as any);

    const parser = yargs([]).command(newCommand).fail(false);

    await parser.parseAsync('new /some/path morph');

    expect(mockedFs.readdir).toHaveBeenCalledTimes(2);
    expect(mockedFs.readdir).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(path.normalize('extensions/examples')),
      { withFileTypes: true },
    );
    expect(mockedFs.readdir).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(path.normalize('extensions/examples/morph')),
      { withFileTypes: true },
    );

    expect(mockedFs.mkdir).toHaveBeenCalledWith('/some/path', {
      recursive: true,
    });
    expect(mockedFs.cp).toHaveBeenCalledTimes(morphTemplateEntries.length);
    for (const fileName of [
      '.gitignore',
      'GEMINI.md',
      'README.md',
      'gemini-extension.json',
      'morph-server.js',
      'package.json',
    ]) {
      expect(mockedFs.cp).toHaveBeenCalledWith(
        expect.stringContaining(path.normalize(`morph/${fileName}`)),
        path.normalize(`/some/path/${fileName}`),
        { recursive: true },
      );
    }
  });

  it('should throw an error if the path already exists', async () => {
    mockedFs.access.mockResolvedValue(undefined);
    const parser = yargs([]).command(newCommand).fail(false);

    await expect(parser.parseAsync('new /some/path morph')).rejects.toThrow(
      'Path already exists: /some/path',
    );

    expect(mockedFs.mkdir).not.toHaveBeenCalled();
    expect(mockedFs.cp).not.toHaveBeenCalled();
  });
});
