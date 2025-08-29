/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
} from './tools.js';
import type {
  ToolInvocation,
  ToolLocation,
  ToolResult,
} from './tools.js';
import { ToolErrorType } from './tool-error.js';
import { Config } from '../config/config.js';
import { makeRelative } from '../utils/paths.js';

/**
 * Parameters for Excel operations
 */
export interface ExcelToolParams {
  /** The Excel file path */
  filePath: string;
  /** The operation to perform */
  operation: 'read' | 'write' | 'create' | 'analyze' | 'format' | 'create_worksheet' | 'delete_worksheet' | 'create_workbook' | 'set_formula' | 'style_cell' | 'add_comment' | 'merge_cells' | 'insert_row' | 'insert_column' | 'delete_row' | 'delete_column' | 'search' | 'find_and_replace' | 'list_worksheets' | 'alter_worksheet';
  /** Worksheet name (optional, defaults to first sheet) */
  worksheetName?: string;
  /** Cell range for read/write operations (e.g., 'A1:C10') */
  range?: string;
  /** Data to write (for write operations) */
  data?: any[][];
  /** Formatting options */
  formatting?: ExcelFormattingOptions;
  /** Analysis type (for analyze operations) */
  analysisType?: 'summary' | 'charts' | 'pivot' | 'formulas';
  /** Formula to set (for set_formula operation) */
  formula?: string;
  /** Cell styling options (for style_cell operation) */
  cellStyle?: CellStyleOptions;
  /** Comment text (for add_comment operation) */
  comment?: string;
  /** Row/column index for insert/delete operations */
  index?: number;
  /** Number of rows/columns to insert/delete */
  count?: number;
  /** Worksheets to create (for create_workbook operation) */
  worksheets?: WorksheetConfig[];
  /** Search term for search operations */
  searchTerm?: string;
  /** Replacement text for find_and_replace operation */
  replaceWith?: string;
  /** Search options */
  searchOptions?: {
    caseSensitive?: boolean;
    matchWholeCell?: boolean;
    useRegex?: boolean;
    searchInFormulas?: boolean;
    searchInValues?: boolean;
    searchInComments?: boolean;
  };
  /** New worksheet name for alter_worksheet operation */
  newWorksheetName?: string;
  /** Tab color for worksheet (for alter_worksheet operation) */
  tabColor?: string;
  /** Whether to activate the worksheet after alteration */
  activateWorksheet?: boolean;
}

/**
 * Worksheet configuration for workbook creation
 */
export interface WorksheetConfig {
  /** Worksheet name */
  name: string;
  /** Initial data for the worksheet */
  data?: any[][];
  /** Tab color */
  tabColor?: string;
}

/**
 * Cell styling options
 */
export interface CellStyleOptions {
  /** Font options */
  font?: {
    name?: string;
    size?: number;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    color?: string;
  };
  /** Fill/background options */
  fill?: {
    type: 'pattern' | 'gradient';
    pattern?: 'solid' | 'darkVertical' | 'darkHorizontal' | 'lightVertical' | 'lightHorizontal';
    fgColor?: string;
    bgColor?: string;
  };
  /** Border options */
  border?: {
    top?: { style: 'thin' | 'medium' | 'thick' | 'double'; color?: string };
    bottom?: { style: 'thin' | 'medium' | 'thick' | 'double'; color?: string };
    left?: { style: 'thin' | 'medium' | 'thick' | 'double'; color?: string };
    right?: { style: 'thin' | 'medium' | 'thick' | 'double'; color?: string };
  };
  /** Number format */
  numFmt?: string;
  /** Alignment */
  alignment?: {
    horizontal?: 'left' | 'center' | 'right';
    vertical?: 'top' | 'middle' | 'bottom';
    wrapText?: boolean;
  };
}

/**
 * Excel formatting options
 */
export interface ExcelFormattingOptions {
  /** Header row styling */
  headerStyle?: {
    bold?: boolean;
    backgroundColor?: string;
    fontColor?: string;
  };
  /** Column widths */
  columnWidths?: number[];
  /** Number formats for columns */
  numberFormats?: string[];
  /** Borders */
  borders?: boolean;
  /** Auto-fit columns */
  autoFit?: boolean;
}

/**
 * Search result item
 */
export interface SearchResult {
  /** Cell address where match was found */
  cellAddress: string;
  /** Worksheet name where match was found */
  worksheetName: string;
  /** The matching content */
  matchedText: string;
  /** The entire cell value */
  cellValue: any;
  /** Type of content (value, formula, comment) */
  contentType: 'value' | 'formula' | 'comment';
  /** Row and column numbers */
  row: number;
  column: number;
}

/**
 * Excel operation result data
 */
export interface ExcelOperationResult {
  /** The file path that was processed */
  filePath: string;
  /** Operation that was performed */
  operation: string;
  /** Result data (for read operations) */
  data?: any[][];
  /** Worksheet information */
  worksheetInfo?: {
    name: string;
    rowCount: number;
    columnCount: number;
    lastColumn: string;
    lastRow: number;
    dataWritten?: {
      rows: number;
      columns: number;
      startRow: number;
      startCol: number;
    };
    totalWorksheets?: number;
    names?: string[];
    tabColor?: string;
    isActive?: boolean;
  };
  /** Analysis results (for analyze operations) */
  analysis?: any;
  /** Search results (for search operations) */
  searchResults?: SearchResult[];
  /** Number of replacements made (for find_and_replace) */
  replacementCount?: number;
  /** Worksheet names (for list_worksheets operation) */
  worksheetNames?: string[];
  /** Changes made (for alter_worksheet operation) */
  changes?: string[];
  /** Success flag */
  success: boolean;
}

/**
 * Excel tool invocation
 */
class ExcelToolInvocation extends BaseToolInvocation<
  ExcelToolParams,
  ToolResult
> {
  constructor(params: ExcelToolParams, private config: Config) {
    super(params);
  }

  override getDescription(): string {
    const operation = this.params.operation;
    const filePath = makeRelative(this.params.filePath, this.config.getTargetDir());
    
    switch (operation) {
      case 'read':
        return `Reading Excel file: ${filePath}${this.params.range ? ` (range: ${this.params.range})` : ''}`;
      case 'write':
        return `Writing data to Excel file: ${filePath}${this.params.worksheetName ? ` (worksheet: ${this.params.worksheetName})` : ''}`;
      case 'create':
        return `Creating new Excel file: ${filePath}`;
      case 'analyze':
        return `Analyzing Excel file: ${filePath}${this.params.analysisType ? ` (${this.params.analysisType})` : ''}`;
      case 'format':
        return `Formatting Excel file: ${filePath}`;
      case 'create_worksheet':
        return `Creating worksheet in: ${filePath}${this.params.worksheetName ? ` (${this.params.worksheetName})` : ''}`;
      case 'delete_worksheet':
        return `Deleting worksheet from: ${filePath}${this.params.worksheetName ? ` (${this.params.worksheetName})` : ''}`;
      case 'create_workbook':
        return `Creating new workbook: ${filePath}`;
      case 'set_formula':
        return `Setting formula in: ${filePath}${this.params.range ? ` (${this.params.range})` : ''}`;
      case 'style_cell':
        return `Styling cell in: ${filePath}${this.params.range ? ` (${this.params.range})` : ''}`;
      case 'add_comment':
        return `Adding comment to: ${filePath}${this.params.range ? ` (${this.params.range})` : ''}`;
      case 'merge_cells':
        return `Merging cells in: ${filePath}${this.params.range ? ` (${this.params.range})` : ''}`;
      case 'insert_row':
        return `Inserting row in: ${filePath}${this.params.index ? ` (row ${this.params.index})` : ''}`;
      case 'insert_column':
        return `Inserting column in: ${filePath}${this.params.index ? ` (column ${this.params.index})` : ''}`;
      case 'delete_row':
        return `Deleting row from: ${filePath}${this.params.index ? ` (row ${this.params.index})` : ''}`;
      case 'delete_column':
        return `Deleting column from: ${filePath}${this.params.index ? ` (column ${this.params.index})` : ''}`;
      case 'search':
        return `Searching in: ${filePath}${this.params.searchTerm ? ` (term: "${this.params.searchTerm}")` : ''}`;
      case 'find_and_replace':
        return `Find and replace in: ${filePath}${this.params.searchTerm ? ` ("${this.params.searchTerm}" → "${this.params.replaceWith}")` : ''}`;
      case 'list_worksheets':
        return `Listing worksheets in: ${filePath}`;
      case 'alter_worksheet':
        return `Altering worksheet in: ${filePath}${this.params.worksheetName ? ` (${this.params.worksheetName})` : ''}`;
      default:
        return `Excel operation on: ${filePath}`;
    }
  }

  override toolLocations(): ToolLocation[] {
    return [{ path: this.params.filePath }];
  }

  async execute(signal: AbortSignal, updateOutput?: (output: string) => void): Promise<ToolResult> {
    const { filePath, operation } = this.params;
    
    try {
      const result = await this.performOperation();
      
      return {
        llmContent: JSON.stringify(result, null, 2),
        returnDisplay: `Excel ${operation} operation completed successfully on ${makeRelative(filePath, this.config.getTargetDir())}`,
      };
    } catch (error) {
      const errorMessage = `Excel operation failed: ${error instanceof Error ? error.message : String(error)}`;
      return {
        llmContent: errorMessage,
        returnDisplay: errorMessage,
        error: {
          message: errorMessage,
          type: ToolErrorType.EXECUTION_FAILED,
        },
      };
    }
  }

  private async performOperation(): Promise<ExcelOperationResult> {
    const { operation } = this.params;
    
    switch (operation) {
      case 'read':
        return await this.readExcel();
      case 'write':
        return await this.writeExcel();
      case 'create':
        return await this.createExcel();
      case 'analyze':
        return await this.analyzeExcel();
      case 'format':
        return await this.formatExcel();
      case 'create_worksheet':
        return await this.createWorksheet();
      case 'delete_worksheet':
        return await this.deleteWorksheet();
      case 'create_workbook':
        return await this.createWorkbook();
      case 'set_formula':
        return await this.setFormula();
      case 'style_cell':
        return await this.styleCell();
      case 'add_comment':
        return await this.addComment();
      case 'merge_cells':
        return await this.mergeCells();
      case 'insert_row':
        return await this.insertRow();
      case 'insert_column':
        return await this.insertColumn();
      case 'delete_row':
        return await this.deleteRow();
      case 'delete_column':
        return await this.deleteColumn();
      case 'search':
        return await this.searchContent();
      case 'find_and_replace':
        return await this.findAndReplace();
      case 'list_worksheets':
        return await this.listWorksheets();
      case 'alter_worksheet':
        return await this.alterWorksheet();
      default:
        throw new Error(`Unsupported operation: ${operation}`);
    }
  }

  private async readExcel(): Promise<ExcelOperationResult> {
    const { filePath, worksheetName, range } = this.params;
    
    if (!existsSync(filePath)) {
      throw new Error(`Excel file not found: ${filePath}`);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    
    const worksheet = worksheetName 
      ? workbook.getWorksheet(worksheetName)
      : workbook.worksheets[0];
    
    if (!worksheet) {
      throw new Error(worksheetName 
        ? `Worksheet '${worksheetName}' not found`
        : 'No worksheets found in the file'
      );
    }

    let data: any[][] = [];
    let worksheetInfo;

    if (range) {
      // Read specific range
      const rangeData: any[][] = [];
      const match = range.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/);
      if (match) {
        const [, startCol, startRow, endCol, endRow] = match;
        const startColNum = this.columnToNumber(startCol);
        const endColNum = this.columnToNumber(endCol);
        const startRowNum = parseInt(startRow);
        const endRowNum = parseInt(endRow);
        
        for (let rowNum = startRowNum; rowNum <= endRowNum; rowNum++) {
          const rowData: any[] = [];
          for (let colNum = startColNum; colNum <= endColNum; colNum++) {
            const cell = worksheet.getCell(rowNum, colNum);
            rowData.push(cell.value);
          }
          rangeData.push(rowData);
        }
      }
      data = rangeData;
    } else {
      // Read all data
      worksheet.eachRow((row: ExcelJS.Row, rowNumber: number) => {
        const rowData: any[] = [];
        row.eachCell((cell: ExcelJS.Cell, colNumber: number) => {
          rowData[colNumber - 1] = cell.value;
        });
        data.push(rowData);
      });
    }

    worksheetInfo = {
      name: worksheet.name,
      rowCount: worksheet.rowCount,
      columnCount: worksheet.columnCount,
      lastColumn: worksheet.lastColumn?.letter || 'A',
      lastRow: worksheet.lastRow?.number || 1,
    };

    return {
      success: true,
      filePath,
      operation: 'read',
      data,
      worksheetInfo,
    };
  }

  private async writeExcel(): Promise<ExcelOperationResult> {
    const { filePath, worksheetName, data, formatting, range } = this.params;
    
    if (!data || data.length === 0) {
      throw new Error('No data provided for write operation');
    }

    let workbook = new ExcelJS.Workbook();
    
    // Load existing workbook if file exists
    if (existsSync(filePath)) {
      await workbook.xlsx.readFile(filePath);
    }
    
    const worksheet = worksheetName
      ? workbook.getWorksheet(worksheetName) || workbook.addWorksheet(worksheetName)
      : workbook.worksheets[0] || workbook.addWorksheet('Sheet1');

    let startRow = 1;
    let startCol = 1;
    
    // Parse range parameter if provided (e.g., "A1", "B3", "A5:C10")
    if (range) {
      const rangeMatch = range.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);
      if (rangeMatch) {
        startCol = this.columnToNumber(rangeMatch[1]);
        startRow = parseInt(rangeMatch[2]);
      }
    } else if (existsSync(filePath) && worksheet.rowCount > 0) {
      // If no range specified and file exists with data, append after existing data
      startRow = worksheet.lastRow ? worksheet.lastRow.number + 1 : 1;
    }
    
    // Only clear existing data if explicitly starting from A1 and no range specified
    if (!range && startRow === 1) {
      worksheet.spliceRows(1, worksheet.rowCount);
    }

    // Write data starting from the determined position
    data.forEach((row, rowIndex) => {
      const wsRow = worksheet.getRow(startRow + rowIndex);
      row.forEach((cellValue, colIndex) => {
        wsRow.getCell(startCol + colIndex).value = cellValue;
      });
      wsRow.commit();
    });

    // Apply formatting if provided
    if (formatting) {
      await this.applyFormatting(worksheet, formatting, data.length, data[0]?.length || 0);
    }

    await workbook.xlsx.writeFile(filePath);

    return {
      success: true,
      filePath,
      operation: 'write',
      worksheetInfo: {
        name: worksheet.name,
        rowCount: worksheet.rowCount,
        columnCount: worksheet.columnCount,
        lastColumn: worksheet.lastColumn?.letter || 'A',
        lastRow: worksheet.lastRow?.number || 1,
        dataWritten: {
          rows: data.length,
          columns: data[0]?.length || 0,
          startRow,
          startCol,
        },
      },
    };
  }

  private async createExcel(): Promise<ExcelOperationResult> {
    const { filePath, worksheetName, data } = this.params;
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(worksheetName || 'Sheet1');
    
    // Add data if provided
    if (data && data.length > 0) {
      data.forEach((row, rowIndex) => {
        const wsRow = worksheet.getRow(rowIndex + 1);
        row.forEach((cellValue, colIndex) => {
          wsRow.getCell(colIndex + 1).value = cellValue;
        });
        wsRow.commit();
      });
    }

    // Ensure directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    
    await workbook.xlsx.writeFile(filePath);

    return {
      success: true,
      filePath,
      operation: 'create',
      worksheetInfo: {
        name: worksheet.name,
        rowCount: data?.length || 0,
        columnCount: data?.[0]?.length || 0,
        lastColumn: data?.[0] ? String.fromCharCode(64 + data[0].length) : 'A',
        lastRow: data?.length || 0,
      },
    };
  }

  private async analyzeExcel(): Promise<ExcelOperationResult> {
    const { filePath, worksheetName, analysisType } = this.params;
    
    if (!existsSync(filePath)) {
      throw new Error(`Excel file not found: ${filePath}`);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    
    const worksheet = worksheetName 
      ? workbook.getWorksheet(worksheetName)
      : workbook.worksheets[0];
    
    if (!worksheet) {
      throw new Error('No worksheet found for analysis');
    }

    const analysis: any = {};

    switch (analysisType) {
      case 'summary':
        analysis.summary = await this.generateSummary(worksheet);
        break;
      case 'charts':
        analysis.chartData = await this.extractChartData(worksheet);
        break;
      case 'formulas':
        analysis.formulas = await this.extractFormulas(worksheet);
        break;
      default:
        // Complete analysis
        analysis.summary = await this.generateSummary(worksheet);
        analysis.formulas = await this.extractFormulas(worksheet);
        break;
    }

    return {
      success: true,
      filePath,
      operation: 'analyze',
      analysis,
      worksheetInfo: {
        name: worksheet.name,
        rowCount: worksheet.rowCount,
        columnCount: worksheet.columnCount,
        lastColumn: worksheet.lastColumn?.letter || 'A',
        lastRow: worksheet.lastRow?.number || 1,
      },
    };
  }

  private async formatExcel(): Promise<ExcelOperationResult> {
    const { filePath, worksheetName, formatting } = this.params;
    
    if (!formatting) {
      throw new Error('No formatting options provided');
    }

    if (!existsSync(filePath)) {
      throw new Error(`Excel file not found: ${filePath}`);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    
    const worksheet = worksheetName 
      ? workbook.getWorksheet(worksheetName)
      : workbook.worksheets[0];
    
    if (!worksheet) {
      throw new Error('No worksheet found for formatting');
    }

    await this.applyFormatting(worksheet, formatting, worksheet.rowCount, worksheet.columnCount);
    await workbook.xlsx.writeFile(filePath);

    return {
      success: true,
      filePath,
      operation: 'format',
      worksheetInfo: {
        name: worksheet.name,
        rowCount: worksheet.rowCount,
        columnCount: worksheet.columnCount,
        lastColumn: worksheet.lastColumn?.letter || 'A',
        lastRow: worksheet.lastRow?.number || 1,
      },
    };
  }

  private async applyFormatting(
    worksheet: ExcelJS.Worksheet,
    formatting: ExcelFormattingOptions,
    rowCount: number,
    columnCount: number
  ): Promise<void> {
    // Apply header styling
    if (formatting.headerStyle && rowCount > 0) {
      const headerRow = worksheet.getRow(1);
      headerRow.eachCell((cell: ExcelJS.Cell) => {
        if (formatting.headerStyle?.bold) {
          cell.font = { ...cell.font, bold: true };
        }
        if (formatting.headerStyle?.backgroundColor) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: formatting.headerStyle.backgroundColor.replace('#', 'FF') },
          };
        }
        if (formatting.headerStyle?.fontColor) {
          cell.font = {
            ...cell.font,
            color: { argb: formatting.headerStyle.fontColor.replace('#', 'FF') },
          };
        }
      });
    }

    // Apply column widths
    if (formatting.columnWidths) {
      formatting.columnWidths.forEach((width, index) => {
        const column = worksheet.getColumn(index + 1);
        column.width = width;
      });
    }

    // Auto-fit columns
    if (formatting.autoFit) {
      worksheet.columns.forEach((column: Partial<ExcelJS.Column>) => {
        let maxLength = 0;
        column?.eachCell?.({ includeEmpty: false }, (cell: ExcelJS.Cell) => {
          const cellValue = cell.value?.toString() || '';
          maxLength = Math.max(maxLength, cellValue.length);
        });
        column.width = Math.min(Math.max(maxLength + 2, 10), 50);
      });
    }

    // Apply borders
    if (formatting.borders) {
      for (let row = 1; row <= rowCount; row++) {
        for (let col = 1; col <= columnCount; col++) {
          const cell = worksheet.getCell(row, col);
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
        }
      }
    }

    // Apply number formats
    if (formatting.numberFormats) {
      formatting.numberFormats.forEach((format, colIndex) => {
        const column = worksheet.getColumn(colIndex + 1);
        column.numFmt = format;
      });
    }
  }

  private async generateSummary(worksheet: ExcelJS.Worksheet): Promise<any> {
    const summary: any = {
      totalRows: worksheet.rowCount,
      totalColumns: worksheet.columnCount,
      hasHeaders: false,
      dataTypes: {},
      emptyCells: 0,
      totalCells: 0,
    };

    // Analyze first row for headers
    const firstRow = worksheet.getRow(1);
    let hasHeaders = true;
    firstRow.eachCell((cell: ExcelJS.Cell) => {
      if (typeof cell.value !== 'string') {
        hasHeaders = false;
      }
    });
    summary.hasHeaders = hasHeaders;

    // Analyze data types and count cells
    worksheet.eachRow((row: ExcelJS.Row) => {
      row.eachCell((cell: ExcelJS.Cell) => {
        summary.totalCells++;
        const value = cell.value;
        if (value === null || value === undefined || value === '') {
          summary.emptyCells++;
        } else {
          const type = typeof value;
          summary.dataTypes[type] = (summary.dataTypes[type] || 0) + 1;
        }
      });
    });

    return summary;
  }

  private async extractChartData(worksheet: ExcelJS.Worksheet): Promise<any> {
    // This would extract data suitable for charts
    const chartData: any = {
      numericColumns: [],
      textColumns: [],
      suggestedCharts: [],
    };

    // Analyze each column
    for (let col = 1; col <= worksheet.columnCount; col++) {
      const column = worksheet.getColumn(col);
      let numericCount = 0;
      let textCount = 0;
      let totalValues = 0;

      column.eachCell({ includeEmpty: false }, (cell: ExcelJS.Cell, rowNumber: number) => {
        if (rowNumber > 1) { // Skip header
          totalValues++;
          if (typeof cell.value === 'number') {
            numericCount++;
          } else if (typeof cell.value === 'string') {
            textCount++;
          }
        }
      });

      if (numericCount / totalValues > 0.8) {
        chartData.numericColumns.push(col);
      } else if (textCount / totalValues > 0.8) {
        chartData.textColumns.push(col);
      }
    }

    // Suggest chart types based on data structure
    if (chartData.numericColumns.length > 1) {
      chartData.suggestedCharts.push('scatter', 'line');
    }
    if (chartData.textColumns.length > 0 && chartData.numericColumns.length > 0) {
      chartData.suggestedCharts.push('bar', 'column', 'pie');
    }

    return chartData;
  }

  private async extractFormulas(worksheet: ExcelJS.Worksheet): Promise<any> {
    const formulas: any = {
      count: 0,
      types: {},
      cells: [],
    };

    worksheet.eachRow((row: ExcelJS.Row, rowNumber: number) => {
      row.eachCell((cell: ExcelJS.Cell, colNumber: number) => {
        if (cell.formula) {
          formulas.count++;
          const cellRef = `${String.fromCharCode(64 + colNumber)}${rowNumber}`;
          formulas.cells.push({
            cell: cellRef,
            formula: cell.formula,
            result: cell.result || cell.value,
          });

          // Categorize formula types
          const formula = cell.formula.toString().toUpperCase();
          if (formula.includes('SUM(')) {
            formulas.types.SUM = (formulas.types.SUM || 0) + 1;
          } else if (formula.includes('AVERAGE(') || formula.includes('AVG(')) {
            formulas.types.AVERAGE = (formulas.types.AVERAGE || 0) + 1;
          } else if (formula.includes('COUNT(')) {
            formulas.types.COUNT = (formulas.types.COUNT || 0) + 1;
          } else if (formula.includes('IF(')) {
            formulas.types.IF = (formulas.types.IF || 0) + 1;
          } else if (formula.includes('VLOOKUP(')) {
            formulas.types.VLOOKUP = (formulas.types.VLOOKUP || 0) + 1;
          } else {
            formulas.types.OTHER = (formulas.types.OTHER || 0) + 1;
          }
        }
      });
    });

    return formulas;
  }

  private columnToNumber(columnLetter: string): number {
    let result = 0;
    for (let i = 0; i < columnLetter.length; i++) {
      result = result * 26 + (columnLetter.charCodeAt(i) - 64);
    }
    return result;
  }

  private async createWorksheet(): Promise<ExcelOperationResult> {
    const { filePath, worksheetName, data } = this.params;
    
    if (!worksheetName) {
      throw new Error('Worksheet name is required for create_worksheet operation');
    }

    if (!existsSync(filePath)) {
      throw new Error(`Excel file not found: ${filePath}`);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    
    // Check if worksheet already exists
    if (workbook.getWorksheet(worksheetName)) {
      throw new Error(`Worksheet '${worksheetName}' already exists`);
    }

    const worksheet = workbook.addWorksheet(worksheetName);
    
    // Add data if provided
    if (data && data.length > 0) {
      data.forEach((row, rowIndex) => {
        const wsRow = worksheet.getRow(rowIndex + 1);
        row.forEach((cellValue, colIndex) => {
          wsRow.getCell(colIndex + 1).value = cellValue;
        });
        wsRow.commit();
      });
    }

    await workbook.xlsx.writeFile(filePath);

    return {
      success: true,
      filePath,
      operation: 'create_worksheet',
      worksheetInfo: {
        name: worksheet.name,
        rowCount: data?.length || 0,
        columnCount: data?.[0]?.length || 0,
        lastColumn: data?.[0] ? String.fromCharCode(64 + data[0].length) : 'A',
        lastRow: data?.length || 0,
      },
    };
  }

  private async deleteWorksheet(): Promise<ExcelOperationResult> {
    const { filePath, worksheetName } = this.params;
    
    if (!worksheetName) {
      throw new Error('Worksheet name is required for delete_worksheet operation');
    }

    if (!existsSync(filePath)) {
      throw new Error(`Excel file not found: ${filePath}`);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    
    const worksheet = workbook.getWorksheet(worksheetName);
    if (!worksheet) {
      throw new Error(`Worksheet '${worksheetName}' not found`);
    }

    workbook.removeWorksheet(worksheet.id);
    await workbook.xlsx.writeFile(filePath);

    return {
      success: true,
      filePath,
      operation: 'delete_worksheet',
    };
  }

  private async createWorkbook(): Promise<ExcelOperationResult> {
    const { filePath, worksheets } = this.params;
    
    const workbook = new ExcelJS.Workbook();
    
    if (worksheets && worksheets.length > 0) {
      for (const wsConfig of worksheets) {
        const worksheet = workbook.addWorksheet(wsConfig.name);
        
        // Set tab color if provided
        if (wsConfig.tabColor) {
          worksheet.properties.tabColor = { argb: wsConfig.tabColor.replace('#', 'FF') };
        }
        
        // Add data if provided
        if (wsConfig.data && wsConfig.data.length > 0) {
          wsConfig.data.forEach((row, rowIndex) => {
            const wsRow = worksheet.getRow(rowIndex + 1);
            row.forEach((cellValue, colIndex) => {
              wsRow.getCell(colIndex + 1).value = cellValue;
            });
            wsRow.commit();
          });
        }
      }
    } else {
      // Create default worksheet if none specified
      workbook.addWorksheet('Sheet1');
    }

    // Ensure directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    
    await workbook.xlsx.writeFile(filePath);

    return {
      success: true,
      filePath,
      operation: 'create_workbook',
      worksheetInfo: {
        name: worksheets?.[0]?.name || 'Sheet1',
        rowCount: worksheets?.[0]?.data?.length || 0,
        columnCount: worksheets?.[0]?.data?.[0]?.length || 0,
        lastColumn: worksheets?.[0]?.data?.[0] ? String.fromCharCode(64 + worksheets[0].data[0].length) : 'A',
        lastRow: worksheets?.[0]?.data?.length || 0,
      },
    };
  }

  private async setFormula(): Promise<ExcelOperationResult> {
    const { filePath, worksheetName, range, formula } = this.params;
    
    if (!range) {
      throw new Error('Range parameter is required for set_formula operation');
    }
    
    if (!formula) {
      throw new Error('Formula is required for set_formula operation');
    }

    if (!existsSync(filePath)) {
      throw new Error(`Excel file not found: ${filePath}`);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    
    const worksheet = worksheetName 
      ? workbook.getWorksheet(worksheetName)
      : workbook.worksheets[0];
    
    if (!worksheet) {
      throw new Error('No worksheet found');
    }

    // Handle both single cell and range
    if (range.includes(':')) {
      // Range operation (e.g., "A1:A5")
      const match = range.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/);
      if (match) {
        const [, startCol, startRow, endCol, endRow] = match;
        const startColNum = this.columnToNumber(startCol);
        const endColNum = this.columnToNumber(endCol);
        const startRowNum = parseInt(startRow);
        const endRowNum = parseInt(endRow);
        
        for (let rowNum = startRowNum; rowNum <= endRowNum; rowNum++) {
          for (let colNum = startColNum; colNum <= endColNum; colNum++) {
            const cell = worksheet.getCell(rowNum, colNum);
            (cell as any).formula = formula;
          }
        }
      } else {
        throw new Error(`Invalid range format: ${range}. Expected format: A1:B5`);
      }
    } else {
      // Single cell operation
      const cell = worksheet.getCell(range);
      (cell as any).formula = formula;
    }

    await workbook.xlsx.writeFile(filePath);

    return {
      success: true,
      filePath,
      operation: 'set_formula',
      worksheetInfo: {
        name: worksheet.name,
        rowCount: worksheet.rowCount,
        columnCount: worksheet.columnCount,
        lastColumn: worksheet.lastColumn?.letter || 'A',
        lastRow: worksheet.lastRow?.number || 1,
      },
    };
  }

  private async styleCell(): Promise<ExcelOperationResult> {
    const { filePath, worksheetName, range, cellStyle } = this.params;
    
    if (!range) {
      throw new Error('Range is required for style_cell operation');
    }
    
    if (!cellStyle) {
      throw new Error('Cell style is required for style_cell operation');
    }

    if (!existsSync(filePath)) {
      throw new Error(`Excel file not found: ${filePath}`);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    
    const worksheet = worksheetName 
      ? workbook.getWorksheet(worksheetName)
      : workbook.worksheets[0];
    
    if (!worksheet) {
      throw new Error('No worksheet found');
    }

    this.applyCellStyle(worksheet, range, cellStyle);
    await workbook.xlsx.writeFile(filePath);

    return {
      success: true,
      filePath,
      operation: 'style_cell',
      worksheetInfo: {
        name: worksheet.name,
        rowCount: worksheet.rowCount,
        columnCount: worksheet.columnCount,
        lastColumn: worksheet.lastColumn?.letter || 'A',
        lastRow: worksheet.lastRow?.number || 1,
      },
    };
  }

  private async addComment(): Promise<ExcelOperationResult> {
    const { filePath, worksheetName, range, comment } = this.params;
    
    if (!range) {
      throw new Error('Range is required for add_comment operation');
    }
    
    if (!comment) {
      throw new Error('Comment text is required for add_comment operation');
    }

    if (!existsSync(filePath)) {
      throw new Error(`Excel file not found: ${filePath}`);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    
    const worksheet = worksheetName 
      ? workbook.getWorksheet(worksheetName)
      : workbook.worksheets[0];
    
    if (!worksheet) {
      throw new Error('No worksheet found');
    }

    const cell = worksheet.getCell(range);
    cell.note = comment;

    await workbook.xlsx.writeFile(filePath);

    return {
      success: true,
      filePath,
      operation: 'add_comment',
      worksheetInfo: {
        name: worksheet.name,
        rowCount: worksheet.rowCount,
        columnCount: worksheet.columnCount,
        lastColumn: worksheet.lastColumn?.letter || 'A',
        lastRow: worksheet.lastRow?.number || 1,
      },
    };
  }

  private async mergeCells(): Promise<ExcelOperationResult> {
    const { filePath, worksheetName, range } = this.params;
    
    if (!range) {
      throw new Error('Range is required for merge_cells operation');
    }

    if (!existsSync(filePath)) {
      throw new Error(`Excel file not found: ${filePath}`);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    
    const worksheet = worksheetName 
      ? workbook.getWorksheet(worksheetName)
      : workbook.worksheets[0];
    
    if (!worksheet) {
      throw new Error('No worksheet found');
    }

    worksheet.mergeCells(range);
    await workbook.xlsx.writeFile(filePath);

    return {
      success: true,
      filePath,
      operation: 'merge_cells',
      worksheetInfo: {
        name: worksheet.name,
        rowCount: worksheet.rowCount,
        columnCount: worksheet.columnCount,
        lastColumn: worksheet.lastColumn?.letter || 'A',
        lastRow: worksheet.lastRow?.number || 1,
      },
    };
  }

  private async insertRow(): Promise<ExcelOperationResult> {
    const { filePath, worksheetName, index, count } = this.params;
    
    if (!index) {
      throw new Error('Row index is required for insert_row operation');
    }

    if (!existsSync(filePath)) {
      throw new Error(`Excel file not found: ${filePath}`);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    
    const worksheet = worksheetName 
      ? workbook.getWorksheet(worksheetName)
      : workbook.worksheets[0];
    
    if (!worksheet) {
      throw new Error('No worksheet found');
    }

    worksheet.insertRow(index, count || 1);
    await workbook.xlsx.writeFile(filePath);

    return {
      success: true,
      filePath,
      operation: 'insert_row',
      worksheetInfo: {
        name: worksheet.name,
        rowCount: worksheet.rowCount,
        columnCount: worksheet.columnCount,
        lastColumn: worksheet.lastColumn?.letter || 'A',
        lastRow: worksheet.lastRow?.number || 1,
      },
    };
  }

  private async insertColumn(): Promise<ExcelOperationResult> {
    const { filePath, worksheetName, index, count } = this.params;
    
    if (!index) {
      throw new Error('Column index is required for insert_column operation');
    }

    if (!existsSync(filePath)) {
      throw new Error(`Excel file not found: ${filePath}`);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    
    const worksheet = worksheetName 
      ? workbook.getWorksheet(worksheetName)
      : workbook.worksheets[0];
    
    if (!worksheet) {
      throw new Error('No worksheet found');
    }

    // Insert columns using spliceColumns to add empty columns
    worksheet.spliceColumns(index, 0, ...Array(count || 1).fill([]));
    await workbook.xlsx.writeFile(filePath);

    return {
      success: true,
      filePath,
      operation: 'insert_column',
      worksheetInfo: {
        name: worksheet.name,
        rowCount: worksheet.rowCount,
        columnCount: worksheet.columnCount,
        lastColumn: worksheet.lastColumn?.letter || 'A',
        lastRow: worksheet.lastRow?.number || 1,
      },
    };
  }

  private async deleteRow(): Promise<ExcelOperationResult> {
    const { filePath, worksheetName, index, count } = this.params;
    
    if (!index) {
      throw new Error('Row index is required for delete_row operation');
    }

    if (!existsSync(filePath)) {
      throw new Error(`Excel file not found: ${filePath}`);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    
    const worksheet = worksheetName 
      ? workbook.getWorksheet(worksheetName)
      : workbook.worksheets[0];
    
    if (!worksheet) {
      throw new Error('No worksheet found');
    }

    worksheet.spliceRows(index, count || 1);
    await workbook.xlsx.writeFile(filePath);

    return {
      success: true,
      filePath,
      operation: 'delete_row',
      worksheetInfo: {
        name: worksheet.name,
        rowCount: worksheet.rowCount,
        columnCount: worksheet.columnCount,
        lastColumn: worksheet.lastColumn?.letter || 'A',
        lastRow: worksheet.lastRow?.number || 1,
      },
    };
  }

  private async deleteColumn(): Promise<ExcelOperationResult> {
    const { filePath, worksheetName, index, count } = this.params;
    
    if (!index) {
      throw new Error('Column index is required for delete_column operation');
    }

    if (!existsSync(filePath)) {
      throw new Error(`Excel file not found: ${filePath}`);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    
    const worksheet = worksheetName 
      ? workbook.getWorksheet(worksheetName)
      : workbook.worksheets[0];
    
    if (!worksheet) {
      throw new Error('No worksheet found');
    }

    worksheet.spliceColumns(index, count || 1);
    await workbook.xlsx.writeFile(filePath);

    return {
      success: true,
      filePath,
      operation: 'delete_column',
      worksheetInfo: {
        name: worksheet.name,
        rowCount: worksheet.rowCount,
        columnCount: worksheet.columnCount,
        lastColumn: worksheet.lastColumn?.letter || 'A',
        lastRow: worksheet.lastRow?.number || 1,
      },
    };
  }

  private applyCellStyle(worksheet: ExcelJS.Worksheet, range: string, cellStyle: CellStyleOptions): void {
    // Handle range or single cell
    if (range.includes(':')) {
      // It's a range
      const match = range.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/);
      if (match) {
        const [, startCol, startRow, endCol, endRow] = match;
        const startColNum = this.columnToNumber(startCol);
        const endColNum = this.columnToNumber(endCol);
        const startRowNum = parseInt(startRow);
        const endRowNum = parseInt(endRow);
        
        for (let rowNum = startRowNum; rowNum <= endRowNum; rowNum++) {
          for (let colNum = startColNum; colNum <= endColNum; colNum++) {
            const cell = worksheet.getCell(rowNum, colNum);
            this.applyStyleToCell(cell, cellStyle);
          }
        }
      }
    } else {
      // Single cell
      const cell = worksheet.getCell(range);
      this.applyStyleToCell(cell, cellStyle);
    }
  }

  private applyStyleToCell(cell: ExcelJS.Cell, cellStyle: CellStyleOptions): void {
    if (cellStyle.font) {
      cell.font = {
        ...cell.font,
        ...cellStyle.font,
        color: cellStyle.font.color ? { argb: cellStyle.font.color.replace('#', 'FF') } : cell.font?.color,
      };
    }

    if (cellStyle.fill) {
      if (cellStyle.fill.type === 'pattern') {
        cell.fill = {
          type: 'pattern',
          pattern: cellStyle.fill.pattern || 'solid',
          fgColor: cellStyle.fill.fgColor ? { argb: cellStyle.fill.fgColor.replace('#', 'FF') } : undefined,
          bgColor: cellStyle.fill.bgColor ? { argb: cellStyle.fill.bgColor.replace('#', 'FF') } : undefined,
        };
      }
    }

    if (cellStyle.border) {
      const border: any = {};
      if (cellStyle.border.top) {
        border.top = {
          style: cellStyle.border.top.style,
          color: cellStyle.border.top.color ? { argb: cellStyle.border.top.color.replace('#', 'FF') } : undefined,
        };
      }
      if (cellStyle.border.bottom) {
        border.bottom = {
          style: cellStyle.border.bottom.style,
          color: cellStyle.border.bottom.color ? { argb: cellStyle.border.bottom.color.replace('#', 'FF') } : undefined,
        };
      }
      if (cellStyle.border.left) {
        border.left = {
          style: cellStyle.border.left.style,
          color: cellStyle.border.left.color ? { argb: cellStyle.border.left.color.replace('#', 'FF') } : undefined,
        };
      }
      if (cellStyle.border.right) {
        border.right = {
          style: cellStyle.border.right.style,
          color: cellStyle.border.right.color ? { argb: cellStyle.border.right.color.replace('#', 'FF') } : undefined,
        };
      }
      cell.border = border;
    }

    if (cellStyle.numFmt) {
      cell.numFmt = cellStyle.numFmt;
    }

    if (cellStyle.alignment) {
      cell.alignment = {
        ...cell.alignment,
        ...cellStyle.alignment,
      };
    }
  }

  private async searchContent(): Promise<ExcelOperationResult> {
    const { filePath, worksheetName, searchTerm, searchOptions } = this.params;
    
    if (!searchTerm) {
      throw new Error('Search term is required for search operation');
    }

    if (!existsSync(filePath)) {
      throw new Error(`Excel file not found: ${filePath}`);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    
    const worksheetsToSearch = worksheetName 
      ? [workbook.getWorksheet(worksheetName)].filter(ws => ws)
      : workbook.worksheets;
    
    if (worksheetsToSearch.length === 0) {
      throw new Error('No worksheets found to search');
    }

    const searchResults: SearchResult[] = [];
    const options = searchOptions || {
      caseSensitive: false,
      matchWholeCell: false,
      useRegex: false,
      searchInFormulas: true,
      searchInValues: true,
      searchInComments: true,
    };

    for (const worksheet of worksheetsToSearch) {
      if (!worksheet) continue;
      
      worksheet.eachRow((row: ExcelJS.Row, rowNumber: number) => {
        row.eachCell((cell: ExcelJS.Cell, colNumber: number) => {
          const cellReference = `${String.fromCharCode(64 + colNumber)}${rowNumber}`;
          
          // Search in cell values
          if (options.searchInValues && cell.value != null) {
            const cellValueStr = String(cell.value);
            if (this.matchesSearchTerm(cellValueStr, searchTerm, options)) {
              searchResults.push({
                cellAddress: cellReference,
                worksheetName: worksheet.name,
                matchedText: this.getMatchedText(cellValueStr, searchTerm, options),
                cellValue: cell.value,
                contentType: 'value',
                row: rowNumber,
                column: colNumber,
              });
            }
          }

          // Search in formulas
          if (options.searchInFormulas && (cell as any).formula) {
            const formulaStr = String((cell as any).formula);
            if (this.matchesSearchTerm(formulaStr, searchTerm, options)) {
              searchResults.push({
                cellAddress: cellReference,
                worksheetName: worksheet.name,
                matchedText: this.getMatchedText(formulaStr, searchTerm, options),
                cellValue: (cell as any).formula,
                contentType: 'formula',
                row: rowNumber,
                column: colNumber,
              });
            }
          }

          // Search in comments
          if (options.searchInComments && cell.note) {
            const commentStr = String(cell.note);
            if (this.matchesSearchTerm(commentStr, searchTerm, options)) {
              searchResults.push({
                cellAddress: cellReference,
                worksheetName: worksheet.name,
                matchedText: this.getMatchedText(commentStr, searchTerm, options),
                cellValue: cell.note,
                contentType: 'comment',
                row: rowNumber,
                column: colNumber,
              });
            }
          }
        });
      });
    }

    return {
      success: true,
      filePath,
      operation: 'search',
      searchResults,
      worksheetInfo: worksheetsToSearch[0] ? {
        name: worksheetsToSearch[0].name,
        rowCount: worksheetsToSearch[0].rowCount,
        columnCount: worksheetsToSearch[0].columnCount,
        lastColumn: worksheetsToSearch[0].lastColumn?.letter || 'A',
        lastRow: worksheetsToSearch[0].lastRow?.number || 1,
      } : undefined,
    };
  }

  private async findAndReplace(): Promise<ExcelOperationResult> {
    const { filePath, worksheetName, searchTerm, replaceWith, searchOptions } = this.params;
    
    if (!searchTerm) {
      throw new Error('Search term is required for find_and_replace operation');
    }

    if (replaceWith === undefined) {
      throw new Error('Replace text is required for find_and_replace operation');
    }

    if (!existsSync(filePath)) {
      throw new Error(`Excel file not found: ${filePath}`);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    
    const worksheetsToProcess = worksheetName 
      ? [workbook.getWorksheet(worksheetName)].filter(ws => ws)
      : workbook.worksheets;
    
    if (worksheetsToProcess.length === 0) {
      throw new Error('No worksheets found for find and replace');
    }

    let replacementCount = 0;
    const options = searchOptions || {
      caseSensitive: false,
      matchWholeCell: false,
      useRegex: false,
      searchInFormulas: true,
      searchInValues: true,
      searchInComments: true,
    };

    for (const worksheet of worksheetsToProcess) {
      if (!worksheet) continue;
      
      worksheet.eachRow((row: ExcelJS.Row, rowNumber: number) => {
        row.eachCell((cell: ExcelJS.Cell, colNumber: number) => {
          // Replace in cell values
          if (options.searchInValues && cell.value != null) {
            const originalValue = String(cell.value);
            const newValue = this.replaceInText(originalValue, searchTerm, replaceWith, options);
            if (newValue !== originalValue) {
              cell.value = newValue;
              replacementCount++;
            }
          }

          // Replace in formulas
          if (options.searchInFormulas && (cell as any).formula) {
            const originalFormula = String((cell as any).formula);
            const newFormula = this.replaceInText(originalFormula, searchTerm, replaceWith, options);
            if (newFormula !== originalFormula) {
              (cell as any).formula = newFormula;
              replacementCount++;
            }
          }

          // Replace in comments
          if (options.searchInComments && cell.note) {
            const originalComment = String(cell.note);
            const newComment = this.replaceInText(originalComment, searchTerm, replaceWith, options);
            if (newComment !== originalComment) {
              cell.note = newComment;
              replacementCount++;
            }
          }
        });
      });
    }

    await workbook.xlsx.writeFile(filePath);

    return {
      success: true,
      filePath,
      operation: 'find_and_replace',
      replacementCount,
      worksheetInfo: worksheetsToProcess[0] ? {
        name: worksheetsToProcess[0].name,
        rowCount: worksheetsToProcess[0].rowCount,
        columnCount: worksheetsToProcess[0].columnCount,
        lastColumn: worksheetsToProcess[0].lastColumn?.letter || 'A',
        lastRow: worksheetsToProcess[0].lastRow?.number || 1,
      } : undefined,
    };
  }

  private matchesSearchTerm(text: string, searchTerm: string, options: any): boolean {
    if (options.useRegex) {
      try {
        const flags = options.caseSensitive ? 'g' : 'gi';
        const regex = new RegExp(searchTerm, flags);
        return regex.test(text);
      } catch {
        // Fallback to literal search if regex is invalid
        return this.matchesSearchTerm(text, searchTerm, { ...options, useRegex: false });
      }
    }

    const searchText = options.caseSensitive ? text : text.toLowerCase();
    const term = options.caseSensitive ? searchTerm : searchTerm.toLowerCase();

    if (options.matchWholeCell) {
      return searchText === term;
    } else {
      return searchText.includes(term);
    }
  }

  private getMatchedText(text: string, searchTerm: string, options: any): string {
    if (options.useRegex) {
      try {
        const flags = options.caseSensitive ? 'g' : 'gi';
        const regex = new RegExp(searchTerm, flags);
        const match = text.match(regex);
        return match ? match[0] : searchTerm;
      } catch {
        return searchTerm;
      }
    }

    return searchTerm;
  }

  private replaceInText(text: string, searchTerm: string, replaceWith: string, options: any): string {
    if (options.useRegex) {
      try {
        const flags = options.caseSensitive ? 'g' : 'gi';
        const regex = new RegExp(searchTerm, flags);
        return text.replace(regex, replaceWith);
      } catch {
        // Fallback to literal replacement if regex is invalid
        return this.replaceInText(text, searchTerm, replaceWith, { ...options, useRegex: false });
      }
    }

    if (options.matchWholeCell) {
      const searchText = options.caseSensitive ? text : text.toLowerCase();
      const term = options.caseSensitive ? searchTerm : searchTerm.toLowerCase();
      return searchText === term ? replaceWith : text;
    } else {
      if (options.caseSensitive) {
        return text.split(searchTerm).join(replaceWith);
      } else {
        const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        return text.replace(regex, replaceWith);
      }
    }
  }

  private async listWorksheets(): Promise<ExcelOperationResult> {
    const { filePath } = this.params;
    
    if (!existsSync(filePath)) {
      throw new Error(`Excel file not found: ${filePath}`);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    
    const worksheetNames: string[] = workbook.worksheets.map((ws: ExcelJS.Worksheet) => ws.name);
    
    return {
      success: true,
      filePath,
      operation: 'list_worksheets',
      worksheetNames,
      worksheetInfo: {
        name: worksheetNames[0] || '',
        rowCount: 0,
        columnCount: 0,
        lastColumn: 'A',
        lastRow: 1,
        totalWorksheets: worksheetNames.length,
        names: worksheetNames,
      },
    };
  }

  private async alterWorksheet(): Promise<ExcelOperationResult> {
    const { filePath, worksheetName, newWorksheetName, tabColor, activateWorksheet } = this.params;
    
    if (!existsSync(filePath)) {
      throw new Error(`Excel file not found: ${filePath}`);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    
    const worksheet = workbook.getWorksheet(worksheetName!);
    if (!worksheet) {
      throw new Error(`Worksheet '${worksheetName}' not found in ${filePath}`);
    }

    const changes: string[] = [];

    // Rename worksheet if new name provided
    if (newWorksheetName && newWorksheetName.trim() !== '') {
      const oldName = worksheet.name;
      worksheet.name = newWorksheetName.trim();
      changes.push(`Renamed worksheet from '${oldName}' to '${worksheet.name}'`);
    }

    // Set tab color if provided
    if (tabColor) {
      // Remove # if present and validate hex color
      const cleanColor = tabColor.replace('#', '');
      if (!/^[0-9A-Fa-f]{6}$/i.test(cleanColor)) {
        throw new Error(`Invalid hex color: ${tabColor}. Use format like "#FF0000" or "FF0000"`);
      }
      worksheet.properties.tabColor = { argb: `FF${cleanColor.toUpperCase()}` };
      changes.push(`Set tab color to #${cleanColor.toUpperCase()}`);
    }

    // Activate worksheet if requested
    if (activateWorksheet) {
      workbook.worksheets.forEach((ws: ExcelJS.Worksheet) => {
        ws.state = 'visible';
      });
      worksheet.state = 'visible';
      changes.push(`Activated worksheet '${worksheet.name}'`);
    }

    // Save the workbook
    await workbook.xlsx.writeFile(filePath);

    return {
      success: true,
      filePath,
      operation: 'alter_worksheet',
      changes,
      worksheetInfo: {
        name: worksheet.name,
        rowCount: worksheet.rowCount,
        columnCount: worksheet.columnCount,
        lastColumn: worksheet.lastColumn?.letter || 'A',
        lastRow: worksheet.lastRow?.number || 1,
        tabColor: tabColor || undefined,
        isActive: activateWorksheet || false,
      },
    };
  }
}

/**
 * Excel Tool for reading, writing, creating, and analyzing Excel files
 */
export class ExcelTool extends BaseDeclarativeTool<
  ExcelToolParams,
  ToolResult
> {
  static readonly Name = 'excel';
  
  constructor(private config: Config) {
    super(
      'excel',
      'Excel File Operations',
      'Powerful Excel file manipulation tool that can read, write, modify, and create Excel (.xlsx/.xls) files. For write operations: use "range" parameter to specify where to write data (e.g., "A5" to start from row 5). If no range is specified, data will be appended automatically. Supports setting formulas, data modification, cell styling, worksheet management, analysis, formatting, comments, merging cells, and row/column operations.',
      Kind.Other,
      {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path to the Excel file (.xlsx or .xls)',
          },
          operation: {
            type: 'string',
            enum: ['read', 'write', 'create', 'analyze', 'format', 'create_worksheet', 'delete_worksheet', 'create_workbook', 'set_formula', 'style_cell', 'add_comment', 'merge_cells', 'insert_row', 'insert_column', 'delete_row', 'delete_column', 'search', 'find_and_replace', 'list_worksheets', 'alter_worksheet'],
            description: 'The operation to perform on the Excel file. Use "write" to add data - specify "range" parameter like "A5" to write at specific position, or omit range to append automatically. Use "set_formula" to add Excel formulas. Use "read" to get current content. Use "list_worksheets" to get worksheet names only. Use "alter_worksheet" to rename or modify worksheet properties.',
          },
          worksheetName: {
            type: 'string',
            description: 'Name of the worksheet to operate on (optional, defaults to first sheet)',
          },
          range: {
            type: 'string',
            description: 'Cell range for all operations. Examples: "A1" (single cell), "A5" (start from row 5), "A1:C10" (rectangular range). For write operations: specifies where to write data; if omitted, data is appended. For set_formula/style_cell operations: specifies target cells. For read operations: specifies area to read.',
          },
          data: {
            type: 'array',
            items: {
              type: 'array',
              items: {
                oneOf: [
                  { type: 'string' },
                  { type: 'number' },
                  { type: 'boolean' },
                  { type: 'null' }
                ]
              },
            },
            description: 'Two-dimensional array of data for write operations. Each cell can contain strings, numbers, booleans, or null values.',
          },
          formatting: {
            type: 'object',
            properties: {
              headerStyle: {
                type: 'object',
                properties: {
                  bold: { type: 'boolean' },
                  backgroundColor: { type: 'string' },
                  fontColor: { type: 'string' },
                },
              },
              columnWidths: {
                type: 'array',
                items: { type: 'number' },
              },
              numberFormats: {
                type: 'array',
                items: { type: 'string' },
              },
              borders: { type: 'boolean' },
              autoFit: { type: 'boolean' },
            },
            description: 'Formatting options for the Excel file',
          },
          analysisType: {
            type: 'string',
            enum: ['summary', 'charts', 'pivot', 'formulas'],
            description: 'Type of analysis to perform (for analyze operation)',
          },
          formula: {
            type: 'string',
            description: 'Excel formula to set (for set_formula operation). Include the "=" sign, e.g., "=SUM(A1:A5)", "=FACT(ROW())", "=A1*2". This formula will be applied to each cell in the specified range parameter.',
          },
          cellStyle: {
            type: 'object',
            properties: {
              font: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  size: { type: 'number' },
                  bold: { type: 'boolean' },
                  italic: { type: 'boolean' },
                  underline: { type: 'boolean' },
                  color: { type: 'string' },
                },
              },
              fill: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['pattern', 'gradient'] },
                  pattern: { type: 'string' },
                  fgColor: { type: 'string' },
                  bgColor: { type: 'string' },
                },
              },
              border: {
                type: 'object',
                properties: {
                  top: { type: 'object' },
                  bottom: { type: 'object' },
                  left: { type: 'object' },
                  right: { type: 'object' },
                },
              },
              numFmt: { type: 'string' },
              alignment: {
                type: 'object',
                properties: {
                  horizontal: { type: 'string', enum: ['left', 'center', 'right'] },
                  vertical: { type: 'string', enum: ['top', 'middle', 'bottom'] },
                  wrapText: { type: 'boolean' },
                },
              },
            },
            description: 'Cell styling options (for style_cell operation)',
          },
          comment: {
            type: 'string',
            description: 'Comment text (for add_comment operation)',
          },
          index: {
            type: 'number',
            description: 'Row/column index for insert/delete operations',
          },
          count: {
            type: 'number',
            description: 'Number of rows/columns to insert/delete (defaults to 1)',
          },
          worksheets: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                data: {
                  type: 'array',
                  items: {
                    type: 'array',
                    items: {
                      oneOf: [
                        { type: 'string' },
                        { type: 'number' },
                        { type: 'boolean' },
                        { type: 'null' }
                      ]
                    },
                  },
                },
                tabColor: { type: 'string' },
              },
              required: ['name'],
            },
            description: 'Worksheets to create (for create_workbook operation)',
          },
          searchTerm: {
            type: 'string',
            description: 'Search term for search operations',
          },
          replaceWith: {
            type: 'string',
            description: 'Replacement text for find_and_replace operation',
          },
          searchOptions: {
            type: 'object',
            properties: {
              caseSensitive: { type: 'boolean' },
              matchWholeCell: { type: 'boolean' },
              useRegex: { type: 'boolean' },
              searchInFormulas: { type: 'boolean' },
              searchInValues: { type: 'boolean' },
              searchInComments: { type: 'boolean' },
            },
            description: 'Search options for search operations',
          },
          newWorksheetName: {
            type: 'string',
            description: 'New name for the worksheet (for alter_worksheet operation)',
          },
          tabColor: {
            type: 'string',
            description: 'Tab color for the worksheet (for alter_worksheet operation), e.g., "#FF0000" for red',
          },
          activateWorksheet: {
            type: 'boolean',
            description: 'Whether to activate the worksheet after alteration (for alter_worksheet operation)',
          },
        },
        required: ['filePath', 'operation'],
        additionalProperties: false,
      }
    );
  }

  protected createInvocation(params: ExcelToolParams): ToolInvocation<ExcelToolParams, ToolResult> {
    return new ExcelToolInvocation(params, this.config);
  }

  protected override validateToolParamValues(params: ExcelToolParams): string | null {
    const filePath = params.filePath;
    if (!filePath || filePath.trim() === '') {
      return "The 'filePath' parameter must be non-empty.";
    }

    if (!path.isAbsolute(filePath)) {
      return `File path must be absolute, but was relative: ${filePath}. You must provide an absolute path.`;
    }

    const ext = path.extname(filePath).toLowerCase();
    if (!['.xlsx', '.xls'].includes(ext)) {
      return `File must be an Excel file (.xlsx or .xls), got: ${ext}`;
    }

    // Validate operation-specific requirements
    if (params.operation === 'write' && (!params.data || params.data.length === 0)) {
      return "Write operation requires 'data' parameter with non-empty array.";
    }

    if (params.operation === 'format' && !params.formatting) {
      return "Format operation requires 'formatting' parameter.";
    }

    if (['create_worksheet', 'delete_worksheet', 'alter_worksheet'].includes(params.operation) && !params.worksheetName) {
      return `${params.operation} operation requires 'worksheetName' parameter.`;
    }

    if (params.operation === 'alter_worksheet' && !params.newWorksheetName && !params.tabColor) {
      return "alter_worksheet operation requires at least one of 'newWorksheetName' or 'tabColor' parameters.";
    }

    if (params.operation === 'set_formula') {
      if (!params.range) {
        return "Set formula operation requires 'range' parameter.";
      }
      if (!params.formula) {
        return "Set formula operation requires 'formula' parameter.";
      }
    }

    if (params.operation === 'style_cell' && (!params.range || !params.cellStyle)) {
      return "Style cell operation requires 'range' and 'cellStyle' parameters.";
    }

    if (params.operation === 'add_comment' && (!params.range || !params.comment)) {
      return "Add comment operation requires 'range' and 'comment' parameters.";
    }

    if (params.operation === 'merge_cells' && !params.range) {
      return "Merge cells operation requires 'range' parameter.";
    }

    if (['insert_row', 'insert_column', 'delete_row', 'delete_column'].includes(params.operation) && !params.index) {
      return `${params.operation} operation requires 'index' parameter.`;
    }

    if (['search', 'find_and_replace'].includes(params.operation) && !params.searchTerm) {
      return `${params.operation} operation requires 'searchTerm' parameter.`;
    }

    if (params.operation === 'find_and_replace' && params.replaceWith === undefined) {
      return "Find and replace operation requires 'replaceWith' parameter.";
    }

    return null;
  }

}