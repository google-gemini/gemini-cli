/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CatTool } from './cat-tool.js';
import { promises as fs } from 'fs';

vi.mock('fs', async (importOriginal) => {
  const actualFs = await importOriginal<typeof import('fs')>();
  return {
    ...actualFs,
    promises: {
      ...actualFs.promises,
      readFile: vi.fn(),
    },
  };
});

const mockFsReadFile = fs.readFile as ReturnType<typeof vi.fn>;

describe('CatTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should read the contents of a single file', async () => {
    const tool = new CatTool();
    const params = {
      files: ['/test.txt'],
    };

    mockFsReadFile.mockResolvedValue('Hello, world!');

    const result = await tool.execute(params, new AbortController().signal);

    expect(fs.readFile).toHaveBeenCalledWith('/test.txt', 'utf-8');
    expect(result.llmContent).toEqual([{ text: 'Hello, world!' }]); // Assuming llmContent is PartListUnion
    expect(result.returnDisplay).toContain('Successfully read 1 file(s).');
  });

  it('should read the contents of multiple files', async () => {
    const tool = new CatTool();
    const params = {
      files: ['/test1.txt', '/test2.txt'],
    };

    mockFsReadFile
      .mockResolvedValueOnce('Hello, world!')
      .mockResolvedValueOnce('Goodbye, world!');

    const result = await tool.execute(params, new AbortController().signal);

    expect(fs.readFile).toHaveBeenCalledWith('/test1.txt', 'utf-8');
    expect(fs.readFile).toHaveBeenCalledWith('/test2.txt', 'utf-8');
    expect(result.llmContent).toEqual([ // Assuming llmContent is PartListUnion
      { text: 'Hello, world!\nGoodbye, world!' }
    ]);
    expect(result.returnDisplay).toContain('Successfully read 2 file(s).');
  });

  it('should return an error if no files are provided', async () => {
    const tool = new CatTool();
    const params = {
      files: [],
    };

    const result = await tool.execute(params, new AbortController().signal);

    // Helper to extract text from PartListUnion
    const getTextFromParts = (parts: import('@google/genai').PartListUnion | undefined): string => {
      if (!parts) return "";
      let textContent = "";
      const partArray = Array.isArray(parts) ? parts : [parts];
      for (const part of partArray) {
        if (typeof part === 'string') { textContent += part; }
        else if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') { textContent += part.text; }
      }
      return textContent;
    };

    expect(getTextFromParts(result.llmContent)).toContain(
      'The "files" parameter is required',
    );
    expect(result.returnDisplay).toContain('## Parameter Error');
  });

  it('should return an error if a file cannot be read', async () => {
    const tool = new CatTool();
    const params = {
      files: ['/test.txt'],
    };

    mockFsReadFile.mockRejectedValue(new Error('File not found'));

    const result = await tool.execute(params, new AbortController().signal);

    // Helper (can be defined once per file or imported)
    const getTextFromParts = (parts: import('@google/genai').PartListUnion | undefined): string => {
      if (!parts) return "";
      let textContent = "";
      const partArray = Array.isArray(parts) ? parts : [parts];
      for (const part of partArray) {
        if (typeof part === 'string') { textContent += part; }
        else if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') { textContent += part.text; }
      }
      return textContent;
    };

    expect(getTextFromParts(result.llmContent)).toContain(
      'Error reading file /test.txt: File not found',
    );
    expect(result.returnDisplay).toContain('## File Read Error');
  });
});
