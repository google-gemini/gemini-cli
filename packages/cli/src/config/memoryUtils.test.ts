/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  // afterEach, // Removed as it's not used
  type Mocked,
  type Mock,
} from 'vitest';
import * as path from 'path';
import { homedir } from 'os';
import * as fs from 'fs/promises';
import { getGlobalMemoryFilePath, addMemoryEntry } from './memoryUtils.js';
import { SETTINGS_DIRECTORY_NAME } from './settings.js';
import {
  MemoryTool,
  GEMINI_MD_FILENAME,
  // MEMORY_SECTION_HEADER, // Removed as it's not used
  // getErrorMessage, // Removed as it's not used
} from '@gemini-code/server';

// Mock the entire fs/promises module
vi.mock('fs/promises');
// Mock MemoryTool static method
vi.mock('@gemini-code/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gemini-code/server')>();
  return {
    ...actual,
    MemoryTool: {
      ...actual.MemoryTool,
      performAddMemoryEntry: vi.fn(),
    },
  };
});

describe('memoryUtils', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.resetAllMocks();
  });

  describe('getGlobalMemoryFilePath', () => {
    it('should return the correct global memory file path', () => {
      const expectedPath = path.join(
        homedir(),
        SETTINGS_DIRECTORY_NAME,
        GEMINI_MD_FILENAME,
      );
      expect(getGlobalMemoryFilePath()).toBe(expectedPath);
    });
  });

  describe('addMemoryEntry', () => {
    const mockFs = fs as Mocked<typeof fs>; // Type cast for mocked fs
    const mockPerformAddMemoryEntry = MemoryTool.performAddMemoryEntry as Mock;

    it('should call MemoryTool.performAddMemoryEntry with correct parameters', async () => {
      const testText = 'Remember this important fact.';
      const expectedFilePath = getGlobalMemoryFilePath();

      await addMemoryEntry(testText);

      expect(mockPerformAddMemoryEntry).toHaveBeenCalledOnce();
      expect(mockPerformAddMemoryEntry).toHaveBeenCalledWith(
        testText,
        expectedFilePath,
        {
          readFile: mockFs.readFile,
          writeFile: mockFs.writeFile,
          mkdir: mockFs.mkdir,
        },
      );
    });

    it('should propagate errors from MemoryTool.performAddMemoryEntry', async () => {
      const testText = 'This will fail.';
      const expectedError = new Error('Failed to add memory entry');
      mockPerformAddMemoryEntry.mockRejectedValueOnce(expectedError);

      await expect(addMemoryEntry(testText)).rejects.toThrow(expectedError);
    });
  });

  // More tests will be added here
});
