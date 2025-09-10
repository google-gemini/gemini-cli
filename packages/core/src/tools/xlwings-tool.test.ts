/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { XlwingsTool } from './xlwings-tool.js';
import type { Config } from '../config/config.js';
import { ApprovalMode } from '../config/config.js';
import { createMockWorkspaceContext } from '../test-utils/mockWorkspaceContext.js';

// Mock the ShellExecutionService
vi.mock('../services/shellExecutionService.js', () => ({
  ShellExecutionService: {
    execute: vi.fn(),
  },
}));

describe('XlwingsTool', () => {
  let tool: XlwingsTool;
  let mockConfig: Config;

  beforeEach(() => {
    mockConfig = {
      getApprovalMode: vi.fn().mockReturnValue(ApprovalMode.YOLO),
      getTargetDir: () => '/test/dir',
      getWorkspaceContext: () => createMockWorkspaceContext('/test/dir'),
    } as unknown as Config;

    tool = new XlwingsTool(mockConfig);
  });

  describe('constructor', () => {
    it('should create XlwingsTool with correct properties', () => {
      expect(tool.name).toBe('xlwings');
      expect(tool.displayName).toBe('Excel Live Interaction');
      expect(tool.description).toContain('Real-time Excel manipulation');
    });
  });

  describe('parameter validation', () => {
    it('should accept valid read operation parameters', () => {
      const params = {
        op: 'read' as const,
        workbook: 'test.xlsx',
        worksheet: 'Sheet1',
        range: 'A1:C10',
        max_rows: 100,
      };

      const invocation = tool.build(params);
      expect(invocation).toBeDefined();
      expect(invocation.params).toEqual(params);
    });

    it('should accept valid write operation parameters', () => {
      const params = {
        op: 'write' as const,
        range: 'A1:B2',
        data: [['Name', 'Age'], ['John', 30]],
      };

      const invocation = tool.build(params);
      expect(invocation).toBeDefined();
      expect(invocation.params).toEqual(params);
    });

    it('should accept valid chart creation parameters', () => {
      const params = {
        op: 'create_chart' as const,
        chart: {
          type: 'column' as const,
          title: 'Sales Chart',
          data_range: 'A1:B10',
          position: 'D1',
        },
      };

      const invocation = tool.build(params);
      expect(invocation).toBeDefined();
      expect(invocation.params).toEqual(params);
    });

    it('should accept valid formatting parameters', () => {
      const params = {
        op: 'format' as const,
        range: 'A1:B10',
        format: {
          font: {
            bold: true,
            size: 14,
            color: '#FF0000',
          },
          fill: {
            color: '#FFFF00',
          },
          alignment: 'center' as const,
        },
      };

      const invocation = tool.build(params);
      expect(invocation).toBeDefined();
      expect(invocation.params).toEqual(params);
    });
  });

  describe('Python code generation', () => {
    it('should generate read operation Python code', () => {
      const params = {
        op: 'read' as const,
        workbook: 'test.xlsx',
        worksheet: 'Sheet1',
        range: 'A1:C10',
        max_rows: 100,
      };

      const pythonCode = tool['generatePythonCode'](params);

      expect(pythonCode).toContain('import xlwings as xw');
      expect(pythonCode).toContain('import json');
      expect(pythonCode).toContain('xw.apps.active');
      expect(pythonCode).toContain('get_workbook("test.xlsx")');
      expect(pythonCode).toContain('get_worksheet(wb, "Sheet1")');
      expect(pythonCode).toContain('ws.range("A1:C10")');
      expect(pythonCode).toContain('"operation": "read"');
    });

    it('should generate write operation Python code', () => {
      const params = {
        op: 'write' as const,
        range: 'A1:B2',
        data: [['Name', 'Age'], ['John', 30]],
      };

      const pythonCode = tool['generatePythonCode'](params);

      expect(pythonCode).toContain('import xlwings as xw');
      expect(pythonCode).toContain('"operation": "write"');
      expect(pythonCode).toContain('ws.range("A1:B2").value = data');
      expect(pythonCode).toContain('[["Name", "Age"], ["John", 30]]');
    });

    it('should generate chart creation Python code', () => {
      const params = {
        op: 'create_chart' as const,
        chart: {
          type: 'column' as const,
          title: 'Sales Chart',
          data_range: 'A1:B10',
          position: 'D1',
        },
      };

      const pythonCode = tool['generatePythonCode'](params);

      expect(pythonCode).toContain('chart = ws.charts.add()');
      expect(pythonCode).toContain('chart.set_source_data(ws.range("A1:B10"))');
      expect(pythonCode).toContain('chart.chart_title.text = "Sales Chart"');
      expect(pythonCode).toContain('"chart_created": True');
    });

    it('should generate list_books operation Python code', () => {
      const params = {
        op: 'list_books' as const,
      };

      const pythonCode = tool['generatePythonCode'](params);

      expect(pythonCode).toContain('[book.name for book in xw.books]');
      expect(pythonCode).toContain('"operation": "list_books"');
      expect(pythonCode).toContain('"books": books');
    });

    it('should generate formula operation Python code', () => {
      const params = {
        op: 'formula' as const,
        range: 'C1',
        formula: '=SUM(A1:B1)',
      };

      const pythonCode = tool['generatePythonCode'](params);

      expect(pythonCode).toContain('ws.range("C1").formula = "=SUM(A1:B1)"');
      expect(pythonCode).toContain('"operation": "formula"');
    });
  });

  describe('result parsing', () => {
    it('should parse successful read operation result', () => {
      const pythonOutput = JSON.stringify({
        success: true,
        operation: 'read',
        workbook: 'test.xlsx',
        worksheet: 'Sheet1',
        range: 'A1:B2',
        data: [['Name', 'Age'], ['John', 30]],
        cells_affected: 4,
      });

      const params = { op: 'read' as const };
      const result = tool['parseResult'](pythonOutput, params);

      expect(result.success).toBe(true);
      expect(result.operation).toBe('read');
      expect(result.data).toEqual([['Name', 'Age'], ['John', 30]]);
      expect(result.llmContent).toContain('completed successfully');
      expect(result.llmContent).toContain('Retrieved 2 rows × 2 columns');
      expect(result.returnDisplay).toContain('✅');
    });

    it('should parse successful chart creation result', () => {
      const pythonOutput = JSON.stringify({
        success: true,
        operation: 'create_chart',
        workbook: 'test.xlsx',
        worksheet: 'Sheet1',
        chart_created: true,
        chart_type: 'column',
        position: 'D1',
      });

      const params = { op: 'create_chart' as const };
      const result = tool['parseResult'](pythonOutput, params);

      expect(result.success).toBe(true);
      expect(result.chart_created).toBe(true);
      expect(result.llmContent).toContain('Chart created successfully');
      expect(result.returnDisplay).toContain('✅');
    });

    it('should parse list_books result', () => {
      const pythonOutput = JSON.stringify({
        success: true,
        operation: 'list_books',
        books: ['Workbook1.xlsx', 'Data.xlsx', 'Report.xlsx'],
      });

      const params = { op: 'list_books' as const };
      const result = tool['parseResult'](pythonOutput, params);

      expect(result.success).toBe(true);
      expect(result.books).toEqual(['Workbook1.xlsx', 'Data.xlsx', 'Report.xlsx']);
      expect(result.llmContent).toContain('Found 3 open workbooks');
      expect(result.llmContent).toContain('Workbook1.xlsx, Data.xlsx, Report.xlsx');
    });

    it('should parse error result', () => {
      const pythonOutput = JSON.stringify({
        success: false,
        operation: 'read',
        xlwings_error: 'No active Excel application found',
      });

      const params = { op: 'read' as const };
      const result = tool['parseResult'](pythonOutput, params);

      expect(result.success).toBe(false);
      expect(result.xlwings_error).toBe('No active Excel application found');
      expect(result.llmContent).toContain('failed: No active Excel application found');
      expect(result.returnDisplay).toContain('❌');
    });

    it('should handle malformed JSON output', () => {
      const pythonOutput = 'This is not valid JSON output';

      const params = { op: 'read' as const };
      const result = tool['parseResult'](pythonOutput, params);

      expect(result.success).toBe(false);
      expect(result.operation).toBe('read');
      expect(result.llmContent).toContain('Excel operation output');
    });

    it('should handle parsing errors', () => {
      const pythonOutput = '{"invalid": json}';

      const params = { op: 'read' as const };
      const result = tool['parseResult'](pythonOutput, params);

      expect(result.success).toBe(false);
      expect(result.xlwings_error).toContain('Failed to parse Python output');
      expect(result.returnDisplay).toContain('❌');
    });
  });

  describe('operation-specific logic', () => {
    it('should handle copy_paste operation parameters', () => {
      const params = {
        op: 'copy_paste' as const,
        copy_paste: {
          source_range: 'A1:B10',
          destination_range: 'D1:E10',
          values_only: true,
        },
      };

      const pythonCode = tool['generatePythonCode'](params);

      expect(pythonCode).toContain('source_range = "A1:B10"');
      expect(pythonCode).toContain('dest_range = "D1:E10"');
      expect(pythonCode).toContain('values_only = True');
      expect(pythonCode).toContain('dest.value = source.value');
    });

    it('should handle find_replace operation parameters', () => {
      const params = {
        op: 'find_replace' as const,
        search: {
          find: 'oldtext',
          replace: 'newtext',
          match_case: true,
        },
      };

      const pythonCode = tool['generatePythonCode'](params);

      expect(pythonCode).toContain('find_text = "oldtext"');
      expect(pythonCode).toContain('replace_text = "newtext"');
      expect(pythonCode).toContain('"operation": "find_replace"');
    });

    it('should handle add_sheet operation', () => {
      const params = {
        op: 'add_sheet' as const,
        new_sheet_name: 'NewDataSheet',
      };

      const pythonCode = tool['generatePythonCode'](params);

      expect(pythonCode).toContain('sheet_name = "NewDataSheet"');
      expect(pythonCode).toContain('wb.sheets.add(sheet_name)');
      expect(pythonCode).toContain('"operation": "add_sheet"');
    });

    it('should handle clear operation', () => {
      const params = {
        op: 'clear' as const,
        range: 'A1:Z100',
      };

      const pythonCode = tool['generatePythonCode'](params);

      expect(pythonCode).toContain('ws.range("A1:Z100")');
      expect(pythonCode).toContain('range_obj.clear()');
      expect(pythonCode).toContain('"operation": "clear"');
    });
  });

  describe('edge cases', () => {
    it('should handle minimal parameters', () => {
      const params = {
        op: 'list_books' as const,
      };

      const invocation = tool.build(params);
      expect(invocation).toBeDefined();
    });

    it('should handle missing optional parameters gracefully', () => {
      const params = {
        op: 'read' as const,
        // No workbook, worksheet, or range specified
      };

      const pythonCode = tool['generatePythonCode'](params);

      expect(pythonCode).toContain('get_workbook("")'); // Empty string for no workbook
      expect(pythonCode).toContain('get_worksheet(wb, "")'); // Empty string for no worksheet
      expect(pythonCode).toContain("ws.range('A1').current_region"); // Default range logic
    });

    it('should enforce chart configuration for create_chart operation', () => {
      const params = {
        op: 'create_chart' as const,
        // Missing chart configuration
      };

      const pythonCode = tool['generatePythonCode'](params);

      expect(pythonCode).toContain('Chart configuration is required');
    });
  });
});