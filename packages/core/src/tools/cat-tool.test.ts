/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CatTool } from './cat-tool.js';
import { ToolInvocation } from '@google/gemini-cli';
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
    const invocation: ToolInvocation = {
      toolName: 'cat',
      files: ['/test.txt'],
    };
    const stream = {
      write: jest.fn(),
    };

    (fs.readFile as jest.Mock).mockResolvedValue('Hello, world!');

    const result = await tool.run(invocation, stream);

    expect(fs.readFile).toHaveBeenCalledWith('/test.txt', 'utf-8');
    expect(result).toEqual({
      type: 'text',
      content: 'Hello, world!',
    });
  });

  it('should read the contents of multiple files', async () => {
    const tool = new CatTool();
    const invocation: ToolInvocation = {
      toolName: 'cat',
      files: ['/test1.txt', '/test2.txt'],
    };
    const stream = {
      write: jest.fn(),
    };

    (fs.readFile as jest.Mock)
      .mockResolvedValueOnce('Hello, world!')
      .mockResolvedValueOnce('Goodbye, world!');

    const result = await tool.run(invocation, stream);

    expect(fs.readFile).toHaveBeenCalledWith('/test1.txt', 'utf-8');
    expect(fs.readFile).toHaveBeenCalledWith('/test2.txt', 'utf-8');
    expect(result).toEqual({
      type: 'text',
      content: 'Hello, world!\nGoodbye, world!',
    });
  });

  it('should return an error if no files are provided', async () => {
    const tool = new CatTool();
    const invocation: ToolInvocation = {
      toolName: 'cat',
      files: [],
    };
    const stream = {
      write: jest.fn(),
    };

    const result = await tool.run(invocation, stream);

    expect(result).toEqual({
      type: 'error',
      message: 'No files were provided to the cat tool.',
    });
  });

  it('should return an error if a file cannot be read', async () => {
    const tool = new CatTool();
    const invocation: ToolInvocation = {
      toolName: 'cat',
      files: ['/test.txt'],
    };
    const stream = {
      write: jest.fn(),
    };

    (fs.readFile as jest.Mock).mockRejectedValue(new Error('File not found'));

    const result = await tool.run(invocation, stream);

    expect(result).toEqual({
      type: 'text',
      content: {
        type: 'error',
        message: 'Error reading file /test.txt: File not found',
      },
    });
  });
});

