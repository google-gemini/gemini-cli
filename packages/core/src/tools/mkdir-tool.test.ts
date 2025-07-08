/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { MkdirTool } from './mkdir-tool.js';
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
    const params = {
      directory: '/test',
    };

    await tool.execute(params, new AbortController().signal);

    expect(fs.mkdir).toHaveBeenCalledWith('/test', { recursive: true });
  });

  it('should return an error if no directory is provided', async () => {
    const tool = new MkdirTool();
    const params = {
      directory: '',
    };

    const result = await tool.execute(params, new AbortController().signal);

    expect(result.llmContent).toContain(
      'The "directory" parameter is required',
    );
    expect(result.returnDisplay).toContain('## Parameter Error');
  });

  it('should return an error if the directory cannot be created', async () => {
    const tool = new MkdirTool();
    const params = {
      directory: '/test',
    };

    (fs.mkdir as jest.Mock).mockRejectedValue(new Error('Permission denied'));

    const result = await tool.execute(params, new AbortController().signal);

    expect(result.llmContent).toContain(
      'Error creating directory /test: Permission denied',
    );
    expect(result.returnDisplay).toContain('## Directory Creation Error');
  });
});
