/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LsTool } from './ls-tool.js';
import { promises as fs } from 'fs';
// No need to import vi from 'vitest' again if already imported above

vi.mock('fs', async (importOriginal) => {
  const actualFs = await importOriginal<typeof import('fs')>();
  return {
    ...actualFs,
    promises: {
      ...actualFs.promises,
      readdir: vi.fn(),
    },
  };
});

const mockFsReaddir = fs.readdir as ReturnType<typeof vi.fn>;

describe('LsTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should list the contents of a directory', async () => {
    const tool = new LsTool();
    const params = {
      directory: '/test',
    };

    mockFsReaddir.mockResolvedValue(['file1.txt', 'file2.txt'] as any);

    const result = await tool.execute(params, new AbortController().signal);

    expect(mockFsReaddir).toHaveBeenCalledWith('/test');
    // Assuming llmContent is PartListUnion and a simple text part is expected
    expect(result.llmContent).toEqual([{ text: 'file1.txt\nfile2.txt' }]);
    expect(result.returnDisplay).toContain(
      'Successfully listed 2 item(s) in **/test**.',
    );
  });

  it('should return an error if no directory is provided', async () => {
    const tool = new LsTool();
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

  it('should return an error if the directory cannot be read', async () => {
    const tool = new LsTool();
    const params = {
      directory: '/test',
    };

    mockFsReaddir.mockRejectedValue(new Error('Directory not found'));

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
      'Error reading directory /test: Directory not found',
    );
    expect(result.returnDisplay).toContain('## Directory Read Error');
  });
});
