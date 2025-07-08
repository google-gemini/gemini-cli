/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { RmTool } from './rm-tool.js';
import { promises as fs } from 'fs';
import { vi } from 'vitest';

jest.mock('fs', () => ({
  promises: {
    unlink: jest.fn(),
  },
}));

describe('RmTool', () => {
  it('should remove a file', async () => {
    const tool = new RmTool();
    const params = {
      file: '/test.txt',
    };

    await tool.execute(params, new AbortController().signal);

    expect(fs.unlink).toHaveBeenCalledWith('/test.txt');
  });

  it('should return an error if no file is provided', async () => {
    const tool = new RmTool();
    const params = {
      file: '',
    };

    const result = await tool.execute(params, new AbortController().signal);

    expect(result.llmContent).toContain('The "file" parameter is required');
    expect(result.returnDisplay).toContain('## Parameter Error');
  });

  it('should return an error if the file cannot be removed', async () => {
    const tool = new RmTool();
    const params = {
      file: '/test.txt',
    };

    (fs.unlink as jest.Mock).mockRejectedValue(new Error('Permission denied'));

    const result = await tool.execute(params, new AbortController().signal);

    expect(result.llmContent).toContain('Error removing file /test.txt: Permission denied');
    expect(result.returnDisplay).toContain('## File Removal Error');
  });
});
