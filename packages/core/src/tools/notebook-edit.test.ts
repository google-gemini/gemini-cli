/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  vi,
} from 'vitest';
import { NotebookEditTool } from './notebook-edit.js';
import { Config } from '../config/config.js';
import { ToolErrorType } from './tool-error.js';
import fs from 'node:fs';

// Mock fs module
vi.mock('node:fs');
const mockFs = vi.mocked(fs);

// Mock telemetry
vi.mock('../telemetry/loggers.js', () => ({
  logFileOperation: vi.fn(),
}));

// Mock config
const mockConfig = {
  getSessionId: () => 'test-session',
  getUsageStatisticsEnabled: () => false,
} as unknown as Config;

describe('NotebookEditTool', () => {
  let tool: NotebookEditTool;
  const testNotebookPath = '/test/path/notebook.ipynb';

  const validNotebook = {
    cells: [
      {
        id: 'cell1',
        cell_type: 'code',
        source: ['print("Hello, World!")\\n'],
        metadata: {},
        execution_count: null,
        outputs: [],
      },
    ],
    metadata: {
      kernelspec: {
        display_name: 'Python 3',
        language: 'python',
        name: 'python3',
      },
    },
    nbformat: 4,
    nbformat_minor: 4,
  };

  beforeEach(() => {
    tool = new NotebookEditTool(mockConfig);
    vi.clearAllMocks();
  });

  describe('add_cell operation', () => {
    beforeEach(() => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(validNotebook));
      mockFs.writeFileSync.mockImplementation(() => {});
    });

    it('should add a code cell', async () => {
      const params = {
        file_path: testNotebookPath,
        operation: 'add_cell' as const,
        cell_content: 'print("New cell")',
        cell_type: 'code' as const,
      };

      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);

      expect(result.error).toBeUndefined();
      expect(result.llmContent).toContain('Successfully performed add_cell');
    });
  });

  describe('error handling', () => {
    it('should return error for non-existent file', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const params = {
        file_path: testNotebookPath,
        operation: 'add_cell' as const,
        cell_content: 'print("test")',
      };

      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);

      expect(result.error).toBeDefined();
      expect(result.error?.type).toBe(ToolErrorType.FILE_NOT_FOUND);
    });

    it('should return error for invalid JSON', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('invalid json content');

      const params = {
        file_path: testNotebookPath,
        operation: 'add_cell' as const,
        cell_content: 'print("test")',
      };

      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);

      expect(result.error).toBeDefined();
      expect(result.error?.type).toBe(ToolErrorType.INVALID_FILE_FORMAT);
      expect(result.llmContent).toContain('Invalid JSON');
    });
  });
});
