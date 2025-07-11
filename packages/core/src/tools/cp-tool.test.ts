/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CpTool } from './cp-tool.js';

import { promises as fs } from 'fs';
import { vi } from 'vitest';

vi.mock('fs', () => ({
  promises: {
    copyFile: vi.fn(),
  },
}));

describe('CpTool', () => {
  it('should copy a file', async () => {
    const tool = new CpTool();
    const params = {
      source: '/test.txt',
      destination: '/test2.txt',
    };

    await tool.execute(params, new AbortController().signal);

    expect(fs.copyFile).toHaveBeenCalledWith('/test.txt', '/test2.txt');
  });

  it('should return an error if destination is not provided', async () => {
    const tool = new CpTool();
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

  it('should return an error if the file cannot be copied', async () => {
    const tool = new CpTool();
    const params = {
      source: '/test.txt',
      destination: '/test2.txt',
    };

    (fs.copyFile as any).mockRejectedValue(
      new Error('Permission denied') as any,
    );

    const result = await tool.execute(params, new AbortController().signal);

    expect(result.llmContent).toContain(
      'Error copying file from /test.txt to /test2.txt: Permission denied',
    );
    expect(result.returnDisplay).toContain('## Copy File Error');
  });
});
