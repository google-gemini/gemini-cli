/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ExcelTool } from './excel-dotnet-tool.js';
import type { Config } from '../config/config.js';
import { ApprovalMode } from '../config/config.js';
import { ToolErrorType } from './tool-error.js';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { createMockWorkspaceContext } from '../test-utils/mockWorkspaceContext.js';

// Mock the spawn function and file system operations
const mockSpawn = vi.hoisted(() => vi.fn());
const mockExistsSync = vi.hoisted(() => vi.fn());
const mockWriteFile = vi.hoisted(() => vi.fn());
const mockReadFile = vi.hoisted(() => vi.fn());
const mockUnlink = vi.hoisted(() => vi.fn());
const mockMkdir = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: mockSpawn,
    execFile: vi.fn(),
    exec: vi.fn(),
  };
});

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: mockExistsSync,
  };
});

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    writeFile: mockWriteFile,
    readFile: mockReadFile,
    unlink: mockUnlink,
    mkdir: mockMkdir,
  };
});

vi.mock('node:crypto', () => ({
  randomUUID: () => 'test-uuid-12345',
}));

vi.mock('pdf-parse', () => ({
  default: vi.fn().mockResolvedValue({
    text: 'mocked pdf text',
    numPages: 1,
    info: {}
  }),
}));

describe('ExcelTool', () => {
  let tempRootDir: string;
  let tool: ExcelTool;
  let mockConfig: Config;
  const abortSignal = new AbortController().signal;

  beforeEach(async () => {
    tempRootDir = await fsp.mkdtemp(
      path.join(os.tmpdir(), 'excel-tool-test-'),
    );

    mockConfig = {
      getApprovalMode: vi.fn().mockReturnValue(ApprovalMode.YOLO),
      getTargetDir: () => tempRootDir,
      getWorkspaceContext: () => createMockWorkspaceContext(tempRootDir),
    } as unknown as Config;

    tool = new ExcelTool(mockConfig);

    // Reset mocks
    vi.clearAllMocks();

    // Default mock implementations
    mockExistsSync.mockReturnValue(true);
    mockWriteFile.mockResolvedValue(undefined);
    mockReadFile.mockResolvedValue(JSON.stringify({
      success: true,
      data: [['A1', 'B1'], ['A2', 'B2']],
      llmContent: 'Excel operation completed successfully',
      returnDisplay: 'Excel operation completed successfully'
    }));
    mockUnlink.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);

    // Mock successful process execution
    const mockProcess = {
      stdout: {
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            // Simulate stdout data
          }
        }),
      },
      stderr: {
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            // Simulate stderr data
          }
        }),
      },
      on: vi.fn((event, callback) => {
        if (event === 'close') {
          // Simulate successful process completion
          setTimeout(() => callback(0), 10);
        }
      }),
      kill: vi.fn(),
      killed: false,
    };

    mockSpawn.mockReturnValue(mockProcess);
  });

  afterEach(async () => {
    if (fs.existsSync(tempRootDir)) {
      await fsp.rm(tempRootDir, { recursive: true, force: true });
    }
  });

  describe('constructor', () => {
    it('should create ExcelTool with correct properties', () => {
      expect(tool.name).toBe('excel');
      expect(tool.displayName).toBe('Excel & CSV Operations');
      expect(tool.description).toContain('Excel/CSV file management');
    });

    it('should create ExcelTool without config', () => {
      const toolWithoutConfig = new ExcelTool();
      expect(toolWithoutConfig.name).toBe('excel');
    });
  });

  describe('isModifyOperation', () => {
    it('should correctly identify modify operations', async () => {
      const modifyParams = [
        { file: 'test.xlsx', op: 'write' as const },
        { file: 'test.xlsx', op: 'create' as const },
        { file: 'test.xlsx', op: 'style' as const },
        { file: 'test.xlsx', op: 'merge' as const },
        { file: 'test.xlsx', op: 'addSheet' as const },
        { file: 'test.xlsx', op: 'deleteSheet' as const },
        { file: 'test.xlsx', op: 'editSheet' as const },
        { file: 'test.xlsx', op: 'csvImport' as const },
      ];

      for (const params of modifyParams) {
        const invocation = tool.build(params);
        expect(invocation).toBeDefined();
      }
    });

    it('should correctly identify read-only operations', async () => {
      const readParams = [
        { file: 'test.xlsx', op: 'read' as const },
        { file: 'test.xlsx', op: 'readContent' as const },
        { file: 'test.xlsx', op: 'listSheets' as const },
        { file: 'test.csv', op: 'csvRead' as const },
      ];

      for (const params of readParams) {
        const invocation = tool.build(params);
        expect(invocation).toBeDefined();
      }
    });
  });

  describe('tool execution', () => {
    it('should execute read operation successfully', async () => {
      const params = {
        file: 'test.xlsx',
        op: 'read' as const,
        sheet: 'Sheet1',
        range: 'A1:B2'
      };

      const invocation = tool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.success).toBe(true);
      expect(result.llmContent).toBe('Excel operation completed successfully');
      expect(mockSpawn).toHaveBeenCalled();
      expect(mockWriteFile).toHaveBeenCalled();
      expect(mockReadFile).toHaveBeenCalled();
    });

    it('should execute write operation successfully', async () => {
      const params = {
        file: 'test.xlsx',
        op: 'write' as const,
        sheet: 'Sheet1',
        range: 'A1:B2',
        data: [['Hello', 'World'], ['Test', 'Data']]
      };

      const invocation = tool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.success).toBe(true);
      expect(mockSpawn).toHaveBeenCalled();
    });

    it('should execute create operation successfully', async () => {
      const params = {
        file: 'new-file.xlsx',
        op: 'create' as const,
        data: [['Header1', 'Header2'], ['Value1', 'Value2']]
      };

      const invocation = tool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.success).toBe(true);
      expect(mockSpawn).toHaveBeenCalled();
    });

    it('should execute listSheets operation successfully', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify({
        success: true,
        sheets: ['Sheet1', 'Sheet2', 'Sheet3'],
        llmContent: 'Found 3 sheets',
        returnDisplay: 'Sheets: Sheet1, Sheet2, Sheet3'
      }));

      const params = {
        file: 'test.xlsx',
        op: 'listSheets' as const
      };

      const invocation = tool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.success).toBe(true);
      expect(result.sheets).toEqual(['Sheet1', 'Sheet2', 'Sheet3']);
    });

    it('should execute CSV operations successfully', async () => {
      const csvReadParams = {
        file: 'test.csv',
        op: 'csvRead' as const,
        delimiter: ';',
        encoding: 'utf8' as BufferEncoding
      };

      const invocation = tool.build(csvReadParams);
      const result = await invocation.execute(abortSignal);

      expect(result.success).toBe(true);
      expect(mockSpawn).toHaveBeenCalled();
    });

    it('should handle readContent operation with different formats', async () => {
      const formats: Array<'markdown' | 'text' | 'json'> = ['markdown', 'text', 'json'];
      
      for (const format of formats) {
        const params = {
          file: 'test.xlsx',
          op: 'readContent' as const,
          worksheet: 'Sheet1',
          outputFormat: format
        };

        const invocation = tool.build(params);
        const result = await invocation.execute(abortSignal);

        expect(result.success).toBe(true);
      }
    });

    it('should handle style operations with complex styling', async () => {
      const params = {
        file: 'test.xlsx',
        op: 'style' as const,
        sheet: 'Sheet1',
        range: 'A1:B2',
        style: {
          font: {
            name: 'Arial',
            size: 12,
            bold: true,
            italic: false,
            color: '#FF0000'
          },
          fill: {
            type: 'pattern' as const,
            pattern: 'solid' as const,
            fgColor: '#FFFF00'
          },
          border: {
            top: { style: 'thin', color: '#000000' },
            bottom: { style: 'thin', color: '#000000' }
          },
          numFmt: '#,##0.00',
          alignment: {
            horizontal: 'center' as const,
            vertical: 'middle' as const,
            wrapText: true
          }
        }
      };

      const invocation = tool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.success).toBe(true);
    });

    it('should handle validation operations', async () => {
      const params = {
        file: 'test.xlsx',
        op: 'validate' as const,
        sheet: 'Sheet1',
        range: 'A1:A10',
        validation: {
          type: 'list' as const,
          allowBlank: false,
          formulae: ['Option1,Option2,Option3'],
          error: 'Please select from the list',
          prompt: 'Select an option'
        }
      };

      const invocation = tool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.success).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle missing .NET processor', async () => {
      mockExistsSync.mockReturnValue(false);

      const params = {
        file: 'test.xlsx',
        op: 'read' as const
      };

      const invocation = tool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.success).toBe(false);
      expect(result.error?.type).toBe(ToolErrorType.EXECUTION_FAILED);
      expect(result.error?.message).toContain('GeminiProcessor.exe not found');
    });

    it('should handle process execution failure', async () => {
      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            setTimeout(() => callback(1), 10); // Exit code 1 = failure
          }
        }),
        kill: vi.fn(),
        killed: false,
      };

      mockSpawn.mockReturnValue(mockProcess);

      const params = {
        file: 'test.xlsx',
        op: 'read' as const
      };

      const invocation = tool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.success).toBe(false);
      expect(result.error?.type).toBe(ToolErrorType.EXECUTION_FAILED);
    });

    it('should handle invalid JSON response', async () => {
      mockReadFile.mockResolvedValue('invalid json');

      const params = {
        file: 'test.xlsx',
        op: 'read' as const
      };

      const invocation = tool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.success).toBe(false);
      expect(result.error?.type).toBe(ToolErrorType.EXECUTION_FAILED);
      expect(result.error?.message).toContain('Failed to read response file');
    });

    it('should handle .NET error response', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify({
        success: false,
        error: 'File not found: test.xlsx'
      }));

      const params = {
        file: 'test.xlsx',
        op: 'read' as const
      };

      const invocation = tool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('File not found: test.xlsx');
    });

    it('should handle process timeout', async () => {
      vi.useFakeTimers();

      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
          // Never call the close callback to simulate hanging process
        }),
        kill: vi.fn(),
        killed: false,
      };

      mockSpawn.mockReturnValue(mockProcess);

      const params = {
        file: 'test.xlsx',
        op: 'read' as const
      };

      const invocation = tool.build(params);
      const resultPromise = invocation.execute(abortSignal);

      // Fast-forward time to trigger timeout
      vi.advanceTimersByTime(30000);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('timeout');
      expect(mockProcess.kill).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe('confirmation behavior', () => {
    it('should not require confirmation in YOLO mode', async () => {
      mockConfig.getApprovalMode = vi.fn().mockReturnValue(ApprovalMode.YOLO);
      
      const params = {
        file: 'test.xlsx',
        op: 'write' as const,
        data: [['test']]
      };

      const invocation = tool.build(params);
      const confirmationDetails = await invocation.shouldConfirmExecute(abortSignal);

      expect(confirmationDetails).toBe(false);
    });

    it('should require confirmation for destructive operations', async () => {
      mockConfig.getApprovalMode = vi.fn().mockReturnValue(ApprovalMode.DEFAULT);
      
      const destructiveOps = ['write', 'create', 'deleteSheet', 'csvImport'];
      
      for (const op of destructiveOps) {
        const params = {
          file: 'test.xlsx',
          op: op as any
        };

        const invocation = tool.build(params);
        const confirmationDetails = await invocation.shouldConfirmExecute(abortSignal);

        expect(confirmationDetails).not.toBe(false);
        if (confirmationDetails !== false) {
          expect(confirmationDetails.type).toBe('exec');
          expect(confirmationDetails.title).toBe('Confirm Excel Operation');
        }
      }
    });

    it('should not require confirmation for read-only operations', async () => {
      mockConfig.getApprovalMode = vi.fn().mockReturnValue(ApprovalMode.DEFAULT);
      
      const readOnlyOps = ['read', 'readContent', 'listSheets', 'csvRead'];
      
      for (const op of readOnlyOps) {
        const params = {
          file: 'test.xlsx',
          op: op as any
        };

        const invocation = tool.build(params);
        const confirmationDetails = await invocation.shouldConfirmExecute(abortSignal);

        expect(confirmationDetails).toBe(false);
      }
    });
  });

  describe('parameter validation', () => {
    it('should accept valid parameters for different operations', () => {
      const validParams = [
        { file: 'test.xlsx', op: 'read' as const },
        { file: 'test.xlsx', op: 'write' as const, data: [['test']] },
        { file: 'test.xlsx', op: 'listSheets' as const },
        { file: 'test.csv', op: 'csvRead' as const },
        { file: 'test.xlsx', op: 'addSheet' as const, newSheet: 'NewSheet' },
      ];

      for (const params of validParams) {
        const invocation = tool.build(params);
        expect(invocation).toBeDefined();
        expect(invocation.params).toEqual(params);
      }
    });

    it('should handle complex operation parameters', () => {
      const complexParams = {
        file: 'complex.xlsx',
        op: 'copySheet' as const,
        sourceFile: 'source.xlsx',
        targetFile: 'target.xlsx',
        sourceSheet: 'SourceSheet',
        targetSheet: 'TargetSheet'
      };

      const invocation = tool.build(complexParams);
      expect(invocation).toBeDefined();
      expect(invocation.params).toEqual(complexParams);
    });
  });

  describe('temp directory management', () => {
    it('should create temp directory if it does not exist', async () => {
      mockExistsSync.mockReturnValue(false);

      const params = {
        file: 'test.xlsx',
        op: 'read' as const
      };

      const invocation = tool.build(params);
      await invocation.execute(abortSignal);

      expect(mockMkdir).toHaveBeenCalled();
    });

    it('should clean up temp files after execution', async () => {
      const params = {
        file: 'test.xlsx',
        op: 'read' as const
      };

      const invocation = tool.build(params);
      await invocation.execute(abortSignal);

      expect(mockUnlink).toHaveBeenCalledTimes(2); // Request and response files
    });
  });
});