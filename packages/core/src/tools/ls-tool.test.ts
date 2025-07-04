/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { LsTool } from './ls-tool.js';
import { ToolInvocation } from '@google/gemini-cli';
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
    const invocation: ToolInvocation = {
      toolName: 'ls',
      files: ['/test'],
    };
    const stream = {
      write: jest.fn(),
    };

    (fs.readdir as jest.Mock).mockResolvedValue(['file1.txt', 'file2.txt']);

    const result = await tool.run(invocation, stream);

    expect(fs.readdir).toHaveBeenCalledWith('/test');
    expect(result).toEqual({
      type: 'text',
      content: 'file1.txt\nfile2.txt',
    });
  });

  it('should return an error if no directory is provided', async () => {
    const tool = new LsTool();
    const invocation: ToolInvocation = {
      toolName: 'ls',
      files: [],
    };
    const stream = {
      write: jest.fn(),
    };

    const result = await tool.run(invocation, stream);

    expect(result).toEqual({
      type: 'error',
      message: 'No directory was provided to the ls tool.',
    });
  });

  it('should return an error if the directory cannot be read', async () => {
    const tool = new LsTool();
    const invocation: ToolInvocation = {
      toolName: 'ls',
      files: ['/test'],
    };
    const stream = {
      write: jest.fn(),
    };

    (fs.readdir as jest.Mock).mockRejectedValue(
      new Error('Directory not found'),
    );

    const result = await tool.run(invocation, stream);

    expect(result).toEqual({
      type: 'error',
      message: 'Error reading directory /test: Directory not found',
    });
  });
});
