/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotebookEditTool } from './notebook-edit.js';
import { ToolErrorType } from './tool-error.js';
import { promises as fs } from 'node:fs';

// Mock fs
vi.mock('node:fs', () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
  },
}));

// Mock crypto
vi.mock('node:crypto', () => ({
  randomBytes: vi.fn(() => ({ toString: () => 'mockedid' })),
}));

// Mock telemetry
vi.mock('../telemetry/loggers.js', () => ({
  logFileOperation: vi.fn(),
}));

vi.mock('../telemetry/types.js', () => ({
  FileOperationEvent: vi.fn(),
}));

vi.mock('../telemetry/metrics.js', () => ({
  FileOperation: { UPDATE: 'update' },
}));

const mockFs = fs as any;

describe('NotebookEditTool', () => {
  let tool: NotebookEditTool;
  const testNotebookPath = '/test/path/notebook.ipynb';

  const baseNotebook = {
    cells: [
      {
        id: 'cell1',
        cell_type: 'code',
        source: ["print('Hello, World!')\\n"],
        metadata: {},
        execution_count: null,
        outputs: [],
      },
      {
        id: 'cell2',
        cell_type: 'markdown',
        source: ['# Title\\n'],
        metadata: {},
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
    const mockConfig = {
      getTargetDir: () => '/test',
    };
    tool = new NotebookEditTool(mockConfig as any);
    vi.clearAllMocks();
  });

  describe('Parameter validation', () => {
    it('should return error for relative file path', async () => {
      const invocation = tool.build({
        absolute_path: 'relative/path.ipynb',
        operation: 'add_cell',
      });

      const result = await invocation.execute(new AbortController().signal);

      expect(result).toMatchObject({
        error: {
          type: ToolErrorType.INVALID_TOOL_PARAMS,
          message: expect.stringContaining('must be absolute'),
        },
      });
    });

    it('should return error for non-existent file', async () => {
      const error = new Error('File not found');
      (error as any).code = 'ENOENT';
      mockFs.readFile.mockRejectedValue(error);

      const invocation = tool.build({
        absolute_path: testNotebookPath,
        operation: 'add_cell',
      });

      const result = await invocation.execute(new AbortController().signal);

      expect(result).toMatchObject({
        error: {
          type: ToolErrorType.FILE_NOT_FOUND,
          message: expect.stringContaining('File not found'),
        },
      });
    });

    it('should return error for invalid JSON', async () => {
      mockFs.readFile.mockResolvedValue('invalid json content');

      const invocation = tool.build({
        absolute_path: testNotebookPath,
        operation: 'add_cell',
      });

      const result = await invocation.execute(new AbortController().signal);

      expect(result).toMatchObject({
        error: {
          type: ToolErrorType.INVALID_FILE_FORMAT,
          message: expect.stringContaining('Invalid notebook JSON'),
        },
      });
    });
  });

  describe('add_cell operation', () => {
    beforeEach(() => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(baseNotebook));
      mockFs.writeFile.mockResolvedValue(undefined);
    });

    it('should add a code cell at the end by default', async () => {
      const invocation = tool.build({
        absolute_path: testNotebookPath,
        operation: 'add_cell',
        cell_content: "print('New cell')",
        cell_type: 'code',
      });

      const result = await invocation.execute(new AbortController().signal);

      expect(result.error).toBeUndefined();
      expect(result.llmContent).toContain('Successfully performed add_cell');

      const writtenContent = mockFs.writeFile.mock.calls[0][1];
      const writtenNotebook = JSON.parse(writtenContent);
      expect(writtenNotebook.cells.length).toBe(3);
      expect(writtenNotebook.cells[2].source[0]).toContain("print('New cell')");
      expect(writtenNotebook.cells[2].cell_type).toBe('code');
    });

    it('should add a markdown cell at specified position', async () => {
      const invocation = tool.build({
        absolute_path: testNotebookPath,
        operation: 'add_cell',
        cell_content: '## New Header',
        cell_type: 'markdown',
        position: 1,
      });

      const result = await invocation.execute(new AbortController().signal);

      expect(result.error).toBeUndefined();

      const writtenContent = mockFs.writeFile.mock.calls[0][1];
      const writtenNotebook = JSON.parse(writtenContent);
      expect(writtenNotebook.cells.length).toBe(3);
      expect(writtenNotebook.cells[1].source[0]).toContain('## New Header');
      expect(writtenNotebook.cells[1].cell_type).toBe('markdown');
    });
  });

  describe('edit_cell operation', () => {
    beforeEach(() => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(baseNotebook));
      mockFs.writeFile.mockResolvedValue(undefined);
    });

    it('should edit cell by index', async () => {
      const invocation = tool.build({
        absolute_path: testNotebookPath,
        operation: 'edit_cell',
        cell_index: 0,
        cell_content: "print('Edited content')",
      });

      const result = await invocation.execute(new AbortController().signal);

      expect(result.error).toBeUndefined();
      expect(result.llmContent).toContain('Successfully performed edit_cell');

      const writtenContent = mockFs.writeFile.mock.calls[0][1];
      const writtenNotebook = JSON.parse(writtenContent);
      expect(writtenNotebook.cells[0].source[0]).toContain(
        "print('Edited content')",
      );
    });

    it('should edit cell by ID', async () => {
      const invocation = tool.build({
        absolute_path: testNotebookPath,
        operation: 'edit_cell',
        cell_id: 'cell1',
        cell_content: "print('Edited by ID')",
      });

      const result = await invocation.execute(new AbortController().signal);

      expect(result.error).toBeUndefined();

      const writtenContent = mockFs.writeFile.mock.calls[0][1];
      const writtenNotebook = JSON.parse(writtenContent);
      expect(writtenNotebook.cells[0].source[0]).toContain(
        "print('Edited by ID')",
      );
    });
  });

  describe('delete_cell operation', () => {
    beforeEach(() => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(baseNotebook));
      mockFs.writeFile.mockResolvedValue(undefined);
    });

    it('should delete cell by index', async () => {
      const invocation = tool.build({
        absolute_path: testNotebookPath,
        operation: 'delete_cell',
        cell_index: 1,
      });

      const result = await invocation.execute(new AbortController().signal);

      expect(result.error).toBeUndefined();
      expect(result.llmContent).toContain('Successfully performed delete_cell');

      const writtenContent = mockFs.writeFile.mock.calls[0][1];
      const writtenNotebook = JSON.parse(writtenContent);
      expect(writtenNotebook.cells.length).toBe(1);
      expect(writtenNotebook.cells[0].id).toBe('cell1');
    });

    it('should prevent deleting the last cell', async () => {
      const singleCellNotebook = {
        ...baseNotebook,
        cells: [baseNotebook.cells[0]],
      };
      mockFs.readFile.mockResolvedValue(JSON.stringify(singleCellNotebook));

      const invocation = tool.build({
        absolute_path: testNotebookPath,
        operation: 'delete_cell',
        cell_index: 0,
      });

      const result = await invocation.execute(new AbortController().signal);

      expect(result.error).toMatchObject({
        type: ToolErrorType.INVALID_OPERATION,
        message: 'Cannot delete the last cell in the notebook',
      });
    });
  });

  describe('move_cell operation', () => {
    beforeEach(() => {
      const notebookWithMoreCells = {
        ...baseNotebook,
        cells: [
          ...baseNotebook.cells,
          {
            id: 'cell3',
            cell_type: 'code',
            source: ["print('Third cell')\\n"],
            metadata: {},
            execution_count: null,
            outputs: [],
          },
        ],
      };
      mockFs.readFile.mockResolvedValue(JSON.stringify(notebookWithMoreCells));
      mockFs.writeFile.mockResolvedValue(undefined);
    });

    it('should move cell from one position to another', async () => {
      const invocation = tool.build({
        absolute_path: testNotebookPath,
        operation: 'move_cell',
        source_index: 0,
        destination_index: 2,
      });

      const result = await invocation.execute(new AbortController().signal);

      expect(result.error).toBeUndefined();
      expect(result.llmContent).toContain('Successfully performed move_cell');

      const writtenContent = mockFs.writeFile.mock.calls[0][1];
      const writtenNotebook = JSON.parse(writtenContent);
      expect(writtenNotebook.cells[1].id).toBe('cell1'); // Original first cell moved to position 1
      expect(writtenNotebook.cells[0].id).toBe('cell2'); // Original second cell is now first
    });
  });

  describe('clear_outputs operation', () => {
    beforeEach(() => {
      const notebookWithOutputs = {
        ...baseNotebook,
        cells: [
          {
            id: 'cell1',
            cell_type: 'code',
            source: ["print('Hello')\\n"],
            metadata: {},
            execution_count: 1,
            outputs: [{ output_type: 'stream', text: ['Hello\\n'] }],
          },
          {
            id: 'cell2',
            cell_type: 'markdown',
            source: ['# Title\\n'],
            metadata: {},
          },
          {
            id: 'cell3',
            cell_type: 'code',
            source: ["print('World')\\n"],
            metadata: {},
            execution_count: 2,
            outputs: [{ output_type: 'stream', text: ['World\\n'] }],
          },
        ],
      };
      mockFs.readFile.mockResolvedValue(JSON.stringify(notebookWithOutputs));
      mockFs.writeFile.mockResolvedValue(undefined);
    });

    it('should clear outputs from all code cells', async () => {
      const invocation = tool.build({
        absolute_path: testNotebookPath,
        operation: 'clear_outputs',
      });

      const result = await invocation.execute(new AbortController().signal);

      expect(result.error).toBeUndefined();
      expect(result.llmContent).toContain(
        'Successfully performed clear_outputs',
      );

      const writtenContent = mockFs.writeFile.mock.calls[0][1];
      const writtenNotebook = JSON.parse(writtenContent);

      // Check that code cells have empty outputs and null execution_count
      expect(writtenNotebook.cells[0].outputs).toEqual([]);
      expect(writtenNotebook.cells[0].execution_count).toBeNull();
      expect(writtenNotebook.cells[2].outputs).toEqual([]);
      expect(writtenNotebook.cells[2].execution_count).toBeNull();

      // Markdown cell should be unchanged
      expect(writtenNotebook.cells[1].outputs).toBeUndefined();
    });
  });

  describe('JSON formatting', () => {
    beforeEach(() => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(baseNotebook));
      mockFs.writeFile.mockResolvedValue(undefined);
    });

    it('should write notebook with proper formatting and newline', async () => {
      const invocation = tool.build({
        absolute_path: testNotebookPath,
        operation: 'add_cell',
        cell_content: 'test',
      });

      await invocation.execute(new AbortController().signal);

      const writtenContent = mockFs.writeFile.mock.calls[0][1];

      // Check that it's properly formatted JSON with 2-space indentation
      expect(writtenContent).toMatch(/^{\n  "cells"/);

      // Check that it ends with a newline
      expect(writtenContent).toMatch(/\n$/);

      // Verify it's valid JSON
      expect(() => JSON.parse(writtenContent)).not.toThrow();
    });
  });
});
