/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { RmdirTool } from './rmdir-tool.js';
import { promises as fs } from 'fs';
import { vi, Mock } from 'vitest';

vi.mock('fs', () => ({
  promises: {
    rmdir: vi.fn(),
  },
}));

describe('RmdirTool', () => {
  it('should remove a directory', async () => {
    const tool = new RmdirTool();
    const params = {
      directory: '/test',
    };

    await tool.execute(params, new AbortController().signal);

    expect(fs.rmdir).toHaveBeenCalledWith('/test');
  });

  it('should return an error if no directory is provided', async () => {
    const tool = new RmdirTool();
    const params = {
      directory: '',
    };

    const result = await tool.execute(params, new AbortController().signal);

    expect(result.llmContent).toContain(
      'The "directory" parameter is required',
    );
    expect(result.returnDisplay).toContain('## Parameter Error');
  });

  it('should return an error if the directory cannot be removed', async () => {
    const tool = new RmdirTool();
    const params = {
      directory: '/test',
    };

    (fs.rmdir as Mock).mockRejectedValue(new Error('Permission denied'));

    const result = await tool.execute(params, new AbortController().signal);

    expect(result.llmContent).toContain(
      'Error removing directory /test: Permission denied',
    );
    expect(result.returnDisplay).toContain('## Directory Removal Error');
  });
});
