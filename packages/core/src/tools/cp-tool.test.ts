/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CpTool } from './cp-tool.js';
import { promises as fs } from 'fs';

vi.mock('fs', async (importOriginal) => {
  const actualFs = await importOriginal<typeof import('fs')>();
  return {
    ...actualFs,
    promises: {
      ...actualFs.promises,
      copyFile: vi.fn(),
    },
  };
});

const mockFsCopyFile = fs.copyFile as ReturnType<typeof vi.fn>;

describe('CpTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should copy a file', async () => {
    const tool = new CpTool();
    const params = {
      source: '/test.txt',
      destination: '/test2.txt',
    };
    mockFsCopyFile.mockResolvedValue(undefined); // Simulate successful copy

    await tool.execute(params, new AbortController().signal);

    expect(mockFsCopyFile).toHaveBeenCalledWith('/test.txt', '/test2.txt');
  });

  it('should return an error if destination is not provided', async () => {
    const tool = new CpTool();
    const params = {
      source: '/test.txt',
      destination: '', // Empty destination
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

    mockFsCopyFile.mockRejectedValue(new Error('Permission denied'));

    const result = await tool.execute(params, new AbortController().signal);

    // Helper
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
      'Error copying file from /test.txt to /test2.txt: Permission denied',
    );
    expect(result.returnDisplay).toContain('## Copy File Error');
  });
});
