/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CpTool } from './cp-tool.js';
import { ToolInvocation } from '@google/gemini-cli';
import { promises as fs } from 'fs';
import { jest } from '@jest/globals';

jest.mock('fs', () => ({
  promises: {
    copyFile: jest.fn(),
  },
}));

describe('CpTool', () => {
  it('should copy a file', async () => {
    const tool = new CpTool();
    const invocation: ToolInvocation = {
      toolName: 'cp',
      files: ['/test.txt', '/test2.txt'],
    };
    const stream = {
      write: jest.fn(),
    };

    await tool.run(invocation, stream);

    expect(fs.copyFile).toHaveBeenCalledWith('/test.txt', '/test2.txt');
  });

  it('should return an error if not enough files are provided', async () => {
    const tool = new CpTool();
    const invocation: ToolInvocation = {
      toolName: 'cp',
      files: ['/test.txt'],
    };
    const stream = {
      write: jest.fn(),
    };

    const result = await tool.run(invocation, stream);

    expect(result).toEqual({
      type: 'error',
      message: 'Please provide a source and destination to the cp tool.',
    });
  });

  it('should return an error if the file cannot be copied', async () => {
    const tool = new CpTool();
    const invocation: ToolInvocation = {
      toolName: 'cp',
      files: ['/test.txt', '/test2.txt'],
    };
    const stream = {
      write: jest.fn(),
    };

    (fs.copyFile as jest.Mock).mockRejectedValue(
      new Error('Permission denied'),
    );

    const result = await tool.run(invocation, stream);

    expect(result).toEqual({
      type: 'error',
      message:
        'Error copying file from /test.txt to /test2.txt: Permission denied',
    });
  });
});
