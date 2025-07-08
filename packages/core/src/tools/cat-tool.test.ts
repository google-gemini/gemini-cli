/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CatTool } from './cat-tool.js';
import { promises as fs } from 'fs';
import { jest } from '@jest/globals';

jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
  },
}));

describe('CatTool', () => {
  it('should read the contents of a single file', async () => {
    const tool = new CatTool();
    const params = {
      files: ['/test.txt'],
    };

    (fs.readFile as jest.Mock).mockResolvedValue('Hello, world!');

    const result = await tool.execute(params, new AbortController().signal);

    expect(fs.readFile).toHaveBeenCalledWith('/test.txt', 'utf-8');
    expect(result.llmContent as string).toEqual('Hello, world!');
    expect(result.returnDisplay).toContain('Successfully read 1 file(s).');
  });

  it('should read the contents of multiple files', async () => {
    const tool = new CatTool();
    const params = {
      files: ['/test1.txt', '/test2.txt'],
    };

    (fs.readFile as jest.Mock)
      .mockResolvedValueOnce('Hello, world!')
      .mockResolvedValueOnce('Goodbye, world!');

    const result = await tool.execute(params, new AbortController().signal);

    expect(fs.readFile).toHaveBeenCalledWith('/test1.txt', 'utf-8');
    expect(fs.readFile).toHaveBeenCalledWith('/test2.txt', 'utf-8');
    expect(result.llmContent as string).toEqual(
      'Hello, world!\nGoodbye, world!',
    );
    expect(result.returnDisplay).toContain('Successfully read 2 file(s).');
  });

  it('should return an error if no files are provided', async () => {
    const tool = new CatTool();
    const params = {
      files: [],
    };

    const result = await tool.execute(params, new AbortController().signal);

    expect(result.llmContent as string).toContain(
      'The "files" parameter is required',
    );
    expect(result.returnDisplay).toContain('## Parameter Error');
  });

  it('should return an error if a file cannot be read', async () => {
    const tool = new CatTool();
    const params = {
      files: ['/test.txt'],
    };

    (fs.readFile as jest.Mock).mockRejectedValue(new Error('File not found'));

    const result = await tool.execute(params, new AbortController().signal);

    expect(result.llmContent as string).toContain(
      'Error reading file /test.txt: File not found',
    );
    expect(result.returnDisplay).toContain('## File Read Error');
  });
});
