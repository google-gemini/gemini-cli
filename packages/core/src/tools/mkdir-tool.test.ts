/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { MkdirTool } from './mkdir-tool.js';
import { ToolInvocation } from '@google/gemini-cli';
import { promises as fs } from 'fs';
import { vi } from 'vitest';

jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
  },
}));

describe('MkdirTool', () => {
  it('should create a directory', async () => {
    const tool = new MkdirTool();
    const invocation: ToolInvocation = {
      toolName: 'mkdir',
      files: ['/test'],
    };
    const stream = {
      write: jest.fn(),
    };

    await tool.run(invocation, stream);

    expect(fs.mkdir).toHaveBeenCalledWith('/test', { recursive: true });
  });

  it('should return an error if no directory is provided', async () => {
    const tool = new MkdirTool();
    const invocation: ToolInvocation = {
      toolName: 'mkdir',
      files: [],
    };
    const stream = {
      write: jest.fn(),
    };

    const result = await tool.run(invocation, stream);

    expect(result).toEqual({
      type: 'error',
      message: 'No directory was provided to the mkdir tool.',
    });
  });

  it('should return an error if the directory cannot be created', async () => {
    const tool = new MkdirTool();
    const invocation: ToolInvocation = {
      toolName: 'mkdir',
      files: ['/test'],
    };
    const stream = {
      write: jest.fn(),
    };

    (fs.mkdir as jest.Mock).mockRejectedValue(new Error('Permission denied'));

    const result = await tool.run(invocation, stream);

    expect(result).toEqual({
      type: 'error',
      message: 'Error creating directory /test: Permission denied',
    });
  });
});
