/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RmdirTool } from './rmdir-tool.js';
import { promises as fs } from 'fs';

vi.mock('fs', async (importOriginal) => {
  const actualFs = await importOriginal<typeof import('fs')>();
  return {
    ...actualFs,
    promises: {
      ...actualFs.promises,
      rmdir: vi.fn(),
    },
  };
});

const mockFsRmdir = fs.rmdir as ReturnType<typeof vi.fn>;

describe('RmdirTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should remove a directory', async () => {
    const tool = new RmdirTool();
    const params = {
      directory: '/test',
    };
    mockFsRmdir.mockResolvedValue(undefined); // Simulate successful rmdir

    await tool.execute(params, new AbortController().signal);

    expect(mockFsRmdir).toHaveBeenCalledWith('/test');
  });

  it('should return an error if no directory is provided', async () => {
    const tool = new RmdirTool();
    const params = {
      directory: '',
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
      'The "directory" parameter is required',
    );
    expect(result.returnDisplay).toContain('## Parameter Error');
  });

  it('should return an error if the directory cannot be removed', async () => {
    const tool = new RmdirTool();
    const params = {
      directory: '/test',
    };

    mockFsRmdir.mockRejectedValue(new Error('Permission denied'));

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
      'Error removing directory /test: Permission denied',
    );
    expect(result.returnDisplay).toContain('## Directory Removal Error');
  });
});
