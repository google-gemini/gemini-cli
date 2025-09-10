/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseDotNetTool } from './base-dotnet-tool.js';
import type { ToolResult } from './tools.js';
import type { Config } from '../config/config.js';

interface ExcelParams {
  /** Excel file path */
  file: string;
  /** Operation type */
  op: 'read' | 'readContent' | 'write' | 'create' | 'listSheets' | 'copySheet' | 'style' | 'validate' | 'rows' | 'cols' | 'merge' | 'addSheet' | 'editSheet' | 'deleteSheet' | 'comment' | 'csvRead' | 'csvExport' | 'csvImport' | 'undo' | 'get_used_range' | 'get_last_row';
  /** Sheet name */
  sheet?: string;
  /** Cell range (A1, A1:C5) */
  range?: string;
  /** Data for write operations (use strings starting with = for formulas) */
  data?: unknown[][];
  /** Cell styling */
  style?: CellStyle;
  /** Data validation rules */
  validation?: DataValidation;
  /** Conditional formatting type */
  format?: 'highlight' | 'dataBar' | 'colorScale' | 'iconSet';
  /** Format condition */
  condition?: string;
  /** Format color */
  color?: string;
  /** Row/column operations */
  action?: 'insert' | 'delete' | 'resize';
  /** Position for row/col operations */
  position?: number;
  /** Count for operations */
  count?: number;
  /** Size (height/width) */
  size?: number;
  /** New sheet name for addSheet/editSheet operations */
  newSheet?: string;
  /** Tab color for sheet (hex color) */
  tabColor?: string;
  /** Comment content */
  comment?: string;
  /** Comment author */
  author?: string;
  /** CSV delimiter (default: ,) */
  delimiter?: string;
  /** CSV encoding (default: utf8) */
  encoding?: BufferEncoding;
  /** Include headers in CSV output */
  headers?: boolean;
  /** CSV quote character (default: ") */
  quote?: string;
  /** Source CSV file path for csvImport operation */
  sourceFile?: string;
  /** Target Excel file path for copySheet operation */
  targetFile?: string;
  /** Source sheet name for copySheet operation */
  sourceSheet?: string;
  /** Target sheet name for copySheet operation */
  targetSheet?: string;
  /** Worksheet name for readContent operation (if not specified, reads all worksheets) */
  worksheet?: string;
  /** Output format for readContent operation: markdown (default), text, or json */
  outputFormat?: 'markdown' | 'text' | 'json';
  /** Maximum rows to return for read operations (default: 100 for preview, set higher for complete data) */
  maxRows?: number;
  /** Starting row for batch reading (1-based, for pagination through large datasets) */
  startRow?: number;
  /** Return data summary instead of full data for large datasets */
  summaryMode?: boolean;
}

interface CellStyle {
  /** Font settings */
  font?: {
    name?: string;
    size?: number;
    bold?: boolean;
    italic?: boolean;
    color?: string;
  };
  /** Fill/background color */
  fill?: {
    type?: 'pattern';
    pattern?: 'solid';
    fgColor?: string;
    bgColor?: string;
  };
  /** Border settings */
  border?: {
    top?: { style: string; color?: string };
    left?: { style: string; color?: string };
    bottom?: { style: string; color?: string };
    right?: { style: string; color?: string };
  };
  /** Number format */
  numFmt?: string;
  /** Text alignment */
  alignment?: {
    horizontal?: 'left' | 'center' | 'right';
    vertical?: 'top' | 'middle' | 'bottom';
    wrapText?: boolean;
  };
}

interface DataValidation {
  /** Validation type */
  type: 'list' | 'whole' | 'decimal' | 'date' | 'time' | 'textLength' | 'custom';
  /** Allow blank values */
  allowBlank?: boolean;
  /** Formula or list values */
  formulae?: string[];
  /** Error message */
  error?: string;
  /** Prompt message */
  prompt?: string;
}


interface ExcelResult extends ToolResult {
  success: boolean;
  file?: string;
  op?: string;
  sheet?: string;
  sheets?: string[];
  data?: unknown[][];
  rowCount?: number;
  colCount?: number;
  /** Used range information (e.g., "A1:D25") */
  usedRange?: string;
  /** Last row with data */
  lastRow?: number;
  /** Last column with data */
  lastColumn?: string;
  /** Formula information for cells */
  formulas?: Array<{ cell: string; formula: string; value?: unknown }>;
  /** Progress information for batch reading */
  progress?: {
    totalRows: number;
    totalColumns: number;
    totalCells: number;
    rowsRead: number;
    startRow: number;
    endRow: number;
    hasMoreData: boolean;
    remainingRows: number;
    completionPercentage: number;
  };
  /** Data summary for large datasets */
  dataSummary?: {
    sampleRows?: unknown[][];
    dataTypes?: string[];
    rowCount: number;
    columnCount: number;
  };
  /** Progress message */
  message?: string;
}

export class ExcelTool extends BaseDotNetTool<ExcelParams, ExcelResult> {
  constructor(config?: Config) {
    super(
      'excel',
      'Excel & CSV Operations with Smart Data Handling',
      'Excel/CSV file management with batch reading and progress tracking. Features: BATCH READING (use maxRows, startRow for pagination), PROGRESS TRACKING (shows total/remaining rows), DATA SUMMARY (summaryMode for large datasets). Operations: read/write Excel/CSV data & formulas, styling, validation, row/col operations, merge cells, sheets. readContent converts Excel to LLM-friendly formats (markdown, text, json). IMPORTANT: Supports all Excel formats (.xlsx, .xlsm, .xls). CSV operations: csvRead, csvExport, csvImport.',
      'excel', // .NET module name
      {
        type: 'object',
        required: ['file', 'op'],
        properties: {
          file: { type: 'string', description: 'File path: Excel file for most operations (including csvExport), CSV file ONLY for csvRead. Supports .xlsx, .xlsm, .xls formats' },
          op: { 
            type: 'string', 
            enum: ['read', 'readContent', 'write', 'create', 'listSheets', 'copySheet', 'style', 'validate', 'rows', 'cols', 'merge', 'addSheet', 'editSheet', 'deleteSheet', 'comment', 'csvRead', 'csvExport', 'csvImport', 'undo', 'get_used_range', 'get_last_row'],
            description: 'Operation type'
          },
          sheet: { type: 'string', description: 'Sheet name' },
          range: { type: 'string', description: 'Cell range (A1 or A1:C5)' },
          data: { 
            type: 'array', 
            items: { 
              type: 'array',
              items: { type: 'string' }
            },
            description: 'Data rows (strings starting with = are formulas)'
          },
          style: { type: 'object', description: 'Cell styling options' },
          validation: { type: 'object', description: 'Data validation rules' },
          format: { type: 'string', description: 'Conditional format type' },
          condition: { type: 'string', description: 'Format condition' },
          color: { type: 'string', description: 'Format color' },
          action: { type: 'string', enum: ['insert', 'delete', 'resize'], description: 'Row/col action' },
          position: { type: 'number', description: 'Row/col position' },
          count: { type: 'number', description: 'Count for operations' },
          size: { type: 'number', description: 'Row height/col width' },
          newSheet: { type: 'string', description: 'New sheet name' },
          tabColor: { type: 'string', description: 'Tab color (hex: #FF0000)' },
          comment: { type: 'string', description: 'Comment content' },
          author: { type: 'string', description: 'Comment author' },
          sourceFile: { type: 'string', description: 'Source file path: Excel file for copySheet, CSV file for csvImport' },
          targetFile: { type: 'string', description: 'Target Excel file path for copySheet' },
          sourceSheet: { type: 'string', description: 'Source sheet name for copySheet' },
          targetSheet: { type: 'string', description: 'Target sheet name for copySheet' },
          delimiter: { type: 'string', description: 'CSV delimiter (default: ,)' },
          encoding: { type: 'string', description: 'CSV file encoding (default: utf8)' },
          headers: { type: 'boolean', description: 'Include headers in CSV output (default: true)' },
          quote: { type: 'string', description: 'CSV quote character (default: ")' },
          worksheet: { type: 'string', description: 'Worksheet name for readContent operation (if not specified, reads all worksheets)' },
          outputFormat: { type: 'string', enum: ['markdown', 'text', 'json'], description: 'Output format for readContent operation (default: markdown)' },
          maxRows: { type: 'number', description: 'Maximum rows to return for read operations (default: 100 for preview, increase for more data)' },
          startRow: { type: 'number', description: 'Starting row for batch reading (1-based, for pagination through large datasets)' },
          summaryMode: { type: 'boolean', description: 'Return data summary instead of full data for large datasets (default: false)' }
        }
      },
      true,  // isOutputMarkdown
      false, // canUpdateOutput 
      config // config parameter
    );
  }

  protected isModifyOperation(params: ExcelParams): boolean {
    const modifyOps = ['write', 'create', 'style', 'merge', 'addSheet', 'deleteSheet', 'editSheet', 'csvImport'];
    return modifyOps.includes(params.op);
  }

}


// export const excelTool = new ExcelTool(); // Removed: Tools now require config parameter