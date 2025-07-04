/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { MvTool } from './mv-tool.js';
import { ToolInvocation } from '@google/gemini-cli';
import { promises as fs } from 'fs';
import { jest } from '@jest/globals';

jest.mock('fs', () => ({
  promises: {
    rename: jest.fn(),
  },
}));

describe('MvTool', () => {
  it('should move a file', async () => {
    const tool = new MvTool();
    const invocation: ToolInvocation = {
      toolName: 'mv',
      files: ['/test.txt', '/test2.txt'],
    };
    const stream = {
      write: jest.fn(),
    };

    await tool.run(invocation, stream);

    expect(fs.rename).toHaveBeenCalledWith('/test.txt', '/test2.txt');
  });

  it('should return an error if not enough files are provided', async () => {
    const tool = new MvTool();
    const invocation: ToolInvocation = {
      toolName: 'mv',
      files: ['/test.txt'],
    };
    const stream = {
      write: jest.fn(),
    };

    const result = await tool.run(invocation, stream);

    expect(result).toEqual({
      type: 'error',
      message: 'Please provide a source and destination to the mv tool.',
    });
  });

  it('should return an error if the file cannot be moved', async () => {
    const tool = new MvTool();
    const invocation: ToolInvocation = {
      toolName: 'mv',
      files: ['/test.txt', '/test2.txt'],
    };
    const stream = {
      write: jest.fn(),
    };

    (fs.rename as jest.Mock).mockRejectedValue(new Error('Permission denied'));

    const result = await tool.run(invocation, stream);

    expect(result).toEqual({
      type: 'error',
      message:
        'Error moving file from /test.txt to /test2.txt: Permission denied',
    });
  });
});
