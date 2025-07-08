/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { LsTool } from './ls-tool.js';
import { promises as fs } from 'fs';
import { jest } from '@jest/globals';

jest.mock('fs', () => ({
  promises: {
    readdir: jest.fn(),
  },
}));

describe('LsTool', () => {
  it('should list the contents of a directory', async () => {
    const tool = new LsTool();
    const params = {
      directory: '/test',
    };

    (fs.readdir as jest.Mock).mockResolvedValue(['file1.txt', 'file2.txt']);

    const result = await tool.execute(params, new AbortController().signal);

    expect(fs.readdir).toHaveBeenCalledWith('/test');
    expect(result.llmContent).toEqual('file1.txt\nfile2.txt');
    expect(result.returnDisplay).toContain('Successfully listed 2 item(s) in /test.');
  });


  it('should return an error if no directory is provided', async () => {
    const tool = new LsTool();
    const params = {
      directory: '',
    };

    const result = await tool.execute(params, new AbortController().signal);

    expect(result.llmContent).toContain('The "directory" parameter is required');
    expect(result.returnDisplay).toContain('## Parameter Error');
  });

  it('should return an error if the directory cannot be read', async () => {
    const tool = new LsTool();
    const params = {
      directory: '/test',
    };

    (fs.readdir as jest.Mock).mockRejectedValue(
      new Error('Directory not found'),
    );

    const result = await tool.execute(params, new AbortController().signal);

    expect(result.llmContent).toContain('Error reading directory /test: Directory not found');
    expect(result.returnDisplay).toContain('## Directory Read Error');
  });
});
