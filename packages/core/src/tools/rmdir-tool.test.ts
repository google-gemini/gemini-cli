/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { RmdirTool } from './rmdir-tool.js';
import { ToolInvocation } from '@google/gemini-cli';
import { promises as fs } from 'fs';
import { vi } from 'vitest';

jest.mock('fs', () => ({
  promises: {
    rmdir: jest.fn(),
  },
}));

describe('RmdirTool', () => {
  it('should remove a directory', async () => {
    const tool = new RmdirTool();
    const invocation: ToolInvocation = {
      toolName: 'rmdir',
      files: ['/test'],
    };
    const stream = {
      write: jest.fn(),
    };

    await tool.run(invocation, stream);

    expect(fs.rmdir).toHaveBeenCalledWith('/test');
  });

  it('should return an error if no directory is provided', async () => {
    const tool = new RmdirTool();
    const invocation: ToolInvocation = {
      toolName: 'rmdir',
      files: [],
    };
    const stream = {
      write: jest.fn(),
    };

    const result = await tool.run(invocation, stream);

    expect(result).toEqual({
      type: 'error',
      message: 'No directory was provided to the rmdir tool.',
    });
  });

  it('should return an error if the directory cannot be removed', async () => {
    const tool = new RmdirTool();
    const invocation: ToolInvocation = {
      toolName: 'rmdir',
      files: ['/test'],
    };
    const stream = {
      write: jest.fn(),
    };

    (fs.rmdir as jest.Mock).mockRejectedValue(new Error('Permission denied'));

    const result = await tool.run(invocation, stream);

    expect(result).toEqual({
      type: 'error',
      message: 'Error removing directory /test: Permission denied',
    });
  });
});
