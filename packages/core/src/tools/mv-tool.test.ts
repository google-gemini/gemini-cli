/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MvTool } from './mv-tool.js';
import { promises as fs } from 'fs';

vi.mock('fs', async (importOriginal) => {
  const actualFs = await importOriginal<typeof import('fs')>();
  return {
    ...actualFs,
    promises: {
      ...actualFs.promises,
      rename: vi.fn(),
    },
  };
});

const mockFsRename = fs.rename as ReturnType<typeof vi.fn>;

describe('MvTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should move a file', async () => {
    const tool = new MvTool();
    const params = {
      source: '/test.txt',
      destination: '/test2.txt',
    };
    mockFsRename.mockResolvedValue(undefined); // Simulate successful rename

    await tool.execute(params, new AbortController().signal);

    expect(mockFsRename).toHaveBeenCalledWith('/test.txt', '/test2.txt');
  });

  it('should return an error if destination is not provided', async () => {
    const tool = new MvTool();
    const params = {
      source: '/test.txt',
      destination: '',
    };

    const result = await tool.execute(params, new AbortController().signal);

    const getTextFromParts = (parts: import('@google/genai').PartListUnion | undefined): string => {
      if (!parts) return ""; let textContent = "";
      const partArray = Array.isArray(parts) ? parts : [parts];
      for (const part of partArray) {
        if (typeof part === 'string') { textContent += part; }
        else if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') { textContent += part.text; }
      } return textContent;
    };

    expect(getTextFromParts(result.llmContent)).toContain(
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

    mockFsRename.mockRejectedValue(new Error('Permission denied'));

    const result = await tool.execute(params, new AbortController().signal);

    const getTextFromParts = (parts: import('@google/genai').PartListUnion | undefined): string => {
      if (!parts) return ""; let textContent = "";
      const partArray = Array.isArray(parts) ? parts : [parts];
      for (const part of partArray) {
        if (typeof part === 'string') { textContent += part; }
        else if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') { textContent += part.text; }
      } return textContent;
    };

    expect(getTextFromParts(result.llmContent)).toContain(
      'Error moving file from /test.txt to /test2.txt: Permission denied',
    );
    expect(result.returnDisplay).toContain('## Move File Error');
  });
});
