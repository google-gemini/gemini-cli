/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RmTool } from './rm-tool.js';
import { promises as fs } from 'fs';

vi.mock('fs', async (importOriginal) => {
  const actualFs = await importOriginal<typeof import('fs')>();
  return {
    ...actualFs,
    promises: {
      ...actualFs.promises,
      unlink: vi.fn(),
    },
  };
});

const mockFsUnlink = fs.unlink as ReturnType<typeof vi.fn>;

describe('RmTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should remove a file', async () => {
    const tool = new RmTool();
    const params = {
      file: '/test.txt',
    };
    mockFsUnlink.mockResolvedValue(undefined); // Simulate successful unlink

    await tool.execute(params, new AbortController().signal);

    expect(mockFsUnlink).toHaveBeenCalledWith('/test.txt');
  });

  it('should return an error if no file is provided', async () => {
    const tool = new RmTool();
    const params = {
      file: '',
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

    expect(getTextFromParts(result.llmContent)).toContain('The "file" parameter is required');
    expect(result.returnDisplay).toContain('## Parameter Error');
  });

  it('should return an error if the file cannot be removed', async () => {
    const tool = new RmTool();
    const params = {
      file: '/test.txt',
    };

    mockFsUnlink.mockRejectedValue(new Error('Permission denied'));

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
      'Error removing file /test.txt: Permission denied',
    );
    expect(result.returnDisplay).toContain('## File Removal Error');
  });
});
