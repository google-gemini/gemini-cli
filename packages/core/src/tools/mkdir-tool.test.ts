/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MkdirTool } from './mkdir-tool.js';
import { promises as fs } from 'fs';

vi.mock('fs', async (importOriginal) => {
  const actualFs = await importOriginal<typeof import('fs')>();
  return {
    ...actualFs,
    promises: {
      ...actualFs.promises,
      mkdir: vi.fn(),
    },
  };
});

const mockFsMkdir = fs.mkdir as ReturnType<typeof vi.fn>;

describe('MkdirTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a directory', async () => {
    const tool = new MkdirTool();
    const params = {
      directory: '/test',
    };
    mockFsMkdir.mockResolvedValue(undefined); // Simulate successful mkdir

    await tool.execute(params, new AbortController().signal);

    expect(mockFsMkdir).toHaveBeenCalledWith('/test', { recursive: true });
  });

  it('should return an error if no directory is provided', async () => {
    const tool = new MkdirTool();
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

  it('should return an error if the directory cannot be created', async () => {
    const tool = new MkdirTool();
    const params = {
      directory: '/test',
    };

    mockFsMkdir.mockRejectedValue(new Error('Permission denied'));

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
      'Error creating directory /test: Permission denied',
    );
    expect(result.returnDisplay).toContain('## Directory Creation Error');
  });
});
