/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { MvTool } from './mv-tool.js';
import { promises as fs } from 'fs';
import { vi, Mock } from 'vitest';

vi.mock('fs', () => ({
  promises: {
    rename: vi.fn(),
  },
}));

describe('MvTool', () => {
  it('should move a file', async () => {
    const tool = new MvTool();
    const params = {
      source: '/test.txt',
      destination: '/test2.txt',
    };

    await tool.execute(params, new AbortController().signal);

    expect(fs.rename).toHaveBeenCalledWith('/test.txt', '/test2.txt');
  });

  it('should return an error if destination is not provided', async () => {
    const tool = new MvTool();
    const params = {
      source: '/test.txt',
      destination: '',
    };

    const result = await tool.execute(params, new AbortController().signal);

    expect(result.llmContent).toContain(
      'The "destination" parameter is required',
    );
    expect(result.returnDisplay).toContain('## Parameter Error');
  });

  it('should return an error if the file cannot be moved', async () => {
    const tool = new MvTool();
    const params = {
      source: '/test.txt',
      destination: '/test2.txt',
    };

    (fs.rename as Mock).mockRejectedValue(new Error('Permission denied'));

    const result = await tool.execute(params, new AbortController().signal);

    expect(result.llmContent).toContain(
      'Error moving file from /test.txt to /test2.txt: Permission denied',
    );
    expect(result.returnDisplay).toContain('## Move File Error');
  });
});
