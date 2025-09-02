/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import ExcelJS from 'exceljs';
import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse';
import { stringify } from 'csv-stringify';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
} from './tools.js';
import type { ToolResult } from './tools.js';

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

interface ExcelParams {
  /** Excel file path */
  file: string;
  /** Operation type */
  op: 'read' | 'write' | 'create' | 'listSheets' | 'copySheet' | 'style' | 'validate' | 'rows' | 'cols' | 'merge' | 'addSheet' | 'editSheet' | 'deleteSheet' | 'comment' | 'csvRead' | 'csvExport' | 'csvImport';
  // Less common operations (commented to save tokens):
  // | 'format' | 'protect'
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
  /** Password for protection */
  password?: string;
  /** Protection options */
  options?: {
    selectLockedCells?: boolean;
    selectUnlockedCells?: boolean;
    formatCells?: boolean;
    formatColumns?: boolean;
    formatRows?: boolean;
    insertColumns?: boolean;
    insertRows?: boolean;
    insertHyperlinks?: boolean;
    deleteColumns?: boolean;
    deleteRows?: boolean;
    sort?: boolean;
    autoFilter?: boolean;
    pivotTables?: boolean;
  };
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
}

interface ExcelResult extends ToolResult {
  success: boolean;
  file: string;
  op: string;
  sheet?: string;
  sheets?: string[];
  data?: unknown[][];
  rowCount?: number;
  colCount?: number;
  /** Used range information (e.g., "A1:D25") */
  usedRange?: string;
  /** Formula information for cells */
  formulas?: Array<{ cell: string; formula: string; value?: unknown }>;
}

class ExcelInvocation extends BaseToolInvocation<ExcelParams, ExcelResult> {
  constructor(params: ExcelParams) {
    super(params);
  }

  getDescription(): string {
    const { file, op, sheet } = this.params;
    const fileName = file.split(/[/\\]/).pop();
    const sheetInfo = sheet ? ` in sheet "${sheet}"` : '';
    
    const actions = {
      read: 'Reading data from',
      write: 'Writing data to', 
      create: 'Creating',
      listSheets: 'Listing sheets in',
      copySheet: 'Copying sheet in',
      style: 'Styling cells in',
      validate: 'Adding data validation to',
      rows: 'Managing rows in',
      cols: 'Managing columns in', 
      merge: 'Merging cells in',
      addSheet: 'Adding sheet to',
      editSheet: 'Editing sheet in',
      deleteSheet: 'Deleting sheet from',
      comment: 'Adding comment to',
      csvRead: 'Reading CSV file',
      csvExport: 'Exporting Excel to CSV',
      csvImport: 'Importing CSV to Excel'
    };
    
    return `${actions[op] || 'Operating on'} ${fileName}${sheetInfo}`;
  }

  async execute(): Promise<ExcelResult> {
    const { file, op } = this.params;

    try {
      switch (op) {
        case 'read': return await this.readData();
        case 'write': return await this.writeData();
        case 'create': return await this.createFile();
        case 'listSheets': return await this.listSheets();
        case 'copySheet': return await this.copySheet();
        case 'style': return await this.styleRange();
        case 'validate': return await this.addValidation();
        case 'rows': return await this.manageRows();
        case 'cols': return await this.manageCols();
        case 'merge': return await this.mergeCells();
        case 'addSheet': return await this.addWorksheet();
        case 'editSheet': return await this.editWorksheet();
        case 'deleteSheet': return await this.deleteWorksheet();
        case 'comment': return await this.addComment();
        case 'csvRead': return await this.readCSV();
        case 'csvExport': return await this.csvExport();
        case 'csvImport': return await this.csvImport();
        default: throw new Error(`Unknown operation: ${op}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        file,
        op,
        llmContent: `Excel operation failed: ${message}`,
        returnDisplay: `Excel operation failed: ${message}`,
      };
    }
  }

  private async getWorkbook(): Promise<ExcelJS.Workbook> {
    const workbook = new ExcelJS.Workbook();
    if (existsSync(this.params.file)) {
      await workbook.xlsx.readFile(this.params.file);
    }
    return workbook;
  }

  private getWorksheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet {
    const { sheet } = this.params;
    let worksheet = sheet ? workbook.getWorksheet(sheet) : workbook.worksheets[0];
    
    if (!worksheet) {
      worksheet = workbook.addWorksheet(sheet || 'Sheet1');
    }
    return worksheet;
  }

  private async readData(): Promise<ExcelResult> {
    const { file, range, sheet } = this.params;
    
    // Check if file exists first
    if (!existsSync(file)) {
      return {
        success: false,
        file,
        op: 'read',
        data: [],
        rowCount: 0,
        colCount: 0,
        llmContent: `Excel file "${file}" does not exist. Please check the file path and try again.`,
        returnDisplay: `File not found: ${file}`,
      };
    }
    
    const workbook = await this.getWorkbook();
    
    // Check if workbook loaded successfully (has any worksheets)
    if (workbook.worksheets.length === 0) {
      return {
        success: true,
        file,
        op: 'read',
        sheets: [],
        data: [],
        rowCount: 0,
        colCount: 0,
        llmContent: `The Excel file "${file}" is empty or corrupted. No worksheets could be read from the file.`,
        returnDisplay: 'No worksheets found in file',
      };
    }
    
    // If specific sheet is requested, read only that sheet
    if (sheet) {
      const worksheet = workbook.getWorksheet(sheet);
      if (!worksheet) {
        const availableSheets = workbook.worksheets.map(ws => ws.name).join(', ');
        return {
          success: false,
          file,
          op: 'read',
          data: [],
          rowCount: 0,
          colCount: 0,
          llmContent: `Sheet "${sheet}" not found in Excel file "${file}". Available sheets are: ${availableSheets}`,
          returnDisplay: `Sheet "${sheet}" not found`,
        };
      }
      
      const result = await this.readSingleSheet(worksheet, range);
      const sheetData = result.data;
      const formulas = result.formulas;
      const limitMessage = !range && sheetData.length === 20 ? ' (limited to first 20 rows)' : '';
      
      // Get used range information
      const usedRange = this.getUsedRange(worksheet);
      const actualRowCount = worksheet.actualRowCount || 0;
      const actualColCount = worksheet.actualColumnCount || 0;
      
      // Format data for LLM consumption with clear status and range info  
      const rangeInfo = `Sheet used range: ${usedRange} (${actualRowCount} rows × ${actualColCount} cols total)`;
      
      // Add formula information if any formulas are present
      const formulaInfo = formulas.length > 0 
        ? `\n\nFORMULAS DETECTED (${formulas.length}):\n` +
          formulas.map(f => `${f.cell}: ${f.formula}`).join('\n')
        : '';
      
      // Simplified output to avoid duplications
      const dataPreview = sheetData.length > 3 
        ? sheetData.slice(0, 3).map(row => row.join('\t')).join('\n') + '\n...(truncated for brevity)'
        : sheetData.map(row => row.join('\t')).join('\n');
      
      const dataDisplay = sheetData.length > 0 
        ? `excel(read): ${rangeInfo}${formulaInfo}\nData preview:\n${dataPreview}`
        : `excel(read): ${rangeInfo}${formulaInfo}\nNo data found in sheet "${worksheet.name}"`;

      return {
        success: true,
        file,
        op: 'read',
        sheet: worksheet.name,
        data: sheetData,
        rowCount: sheetData.length,
        colCount: sheetData[0]?.length || 0,
        usedRange,
        formulas: formulas.length > 0 ? formulas : undefined,
        llmContent: dataDisplay,
        returnDisplay: `excel(read): Read ${sheetData.length} rows from ${worksheet.name}${limitMessage}${formulas.length > 0 ? ` (${formulas.length} formulas)` : ''}`,
      };
    }
    
    // If no specific sheet requested, read first 3 sheets
    const worksheets = workbook.worksheets.slice(0, 3);
    
    // Handle case where workbook has no worksheets
    if (worksheets.length === 0) {
      return {
        success: true,
        file,
        op: 'read',
        sheets: [],
        data: [],
        rowCount: 0,
        colCount: 0,
        llmContent: `The Excel file "${file}" contains no worksheets. The file exists but has no sheets to read data from.`,
        returnDisplay: 'No worksheets found in file',
      };
    }
    
    const allData: unknown[][] = [];
    const allFormulas: Array<{ cell: string; formula: string; value?: unknown; sheet: string }> = [];
    const sheetSummaries: string[] = [];
    const sheetDataDetails: string[] = [];
    
    for (const worksheet of worksheets) {
      const result = await this.readSingleSheet(worksheet, range);
      const sheetData = result.data;
      const formulas = result.formulas;
      
      allData.push(...sheetData);
      
      // Add sheet prefix to formula cell addresses
      formulas.forEach(f => {
        allFormulas.push({ ...f, sheet: worksheet.name });
      });
      
      const limitMessage = !range && sheetData.length === 20 ? ' (limited to first 20 rows)' : '';
      const formulaMessage = formulas.length > 0 ? ` (${formulas.length} formulas)` : '';
      sheetSummaries.push(`${worksheet.name}: ${sheetData.length} rows${limitMessage}${formulaMessage}`);
      
      // Add actual data for LLM with clear status
      if (sheetData.length > 0) {
        const dataStr = sheetData.map(row => row.join('\t')).join('\n');
        const formulaStr = formulas.length > 0 
          ? `\n📊 Formulas: ${formulas.map(f => `${f.cell}: ${f.formula}`).join(', ')}\n`
          : '';
        sheetDataDetails.push(`\n=== ${worksheet.name} (${sheetData.length} rows) ===${formulaStr}${dataStr}`);
      } else {
        sheetDataDetails.push(`\n=== ${worksheet.name} ===\nNo data (sheet is empty)`);
      }
    }
    
    const summaryMessage = `excel(read): Read from ${worksheets.length} sheets: ${sheetSummaries.join(', ')}`;
    const llmDataContent = sheetDataDetails.length > 0 
      ? `${summaryMessage}${sheetDataDetails.join('\n')}`
      : `${summaryMessage}\nAll sheets are empty - no data found in any of the ${worksheets.length} sheets.`;
    
    return {
      success: true,
      file,
      op: 'read',
      sheet: worksheets.map(w => w.name).join(', '),
      data: allData,
      rowCount: allData.length,
      colCount: allData[0]?.length || 0,
      formulas: allFormulas.length > 0 ? allFormulas : undefined,
      llmContent: llmDataContent,
      returnDisplay: summaryMessage,
    };
  }

  private async readSingleSheet(worksheet: ExcelJS.Worksheet, range?: string): Promise<{ data: unknown[][]; formulas: Array<{ cell: string; formula: string; value?: unknown }> }> {
    const data: unknown[][] = [];
    const formulas: Array<{ cell: string; formula: string; value?: unknown }> = [];
    
    if (range) {
      const rangeObj = worksheet.getCell(range);
      if (range.includes(':')) {
        const [start, end] = range.split(':');
        const startCell = worksheet.getCell(start);
        const endCell = worksheet.getCell(end);
        
        for (let row = Number(startCell.row); row <= Number(endCell.row); row++) {
          const rowData: unknown[] = [];
          for (let col = Number(startCell.col); col <= Number(endCell.col); col++) {
            const cell = worksheet.getCell(row, col);
            const cellInfo = this.getCellInfo(cell, cell.address);
            rowData.push(cellInfo.value);
            
            if (cellInfo.isFormula) {
              formulas.push({
                cell: cell.address,
                formula: cellInfo.formula!,
                value: cellInfo.calculatedValue
              });
            }
          }
          data.push(rowData);
        }
      } else {
        const cellInfo = this.getCellInfo(rangeObj, rangeObj.address);
        data.push([cellInfo.value]);
        
        if (cellInfo.isFormula) {
          formulas.push({
            cell: rangeObj.address,
            formula: cellInfo.formula!,
            value: cellInfo.calculatedValue
          });
        }
      }
    } else {
      // When no range is specified, limit to first 20 rows for performance
      const MAX_ROWS = 20;
      let processedRows = 0;
      
      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (processedRows >= MAX_ROWS) {
          return false; // Stop iteration
        }
        
        const rowData: unknown[] = [];
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const cellInfo = this.getCellInfo(cell, cell.address);
          rowData.push(cellInfo.value);
          
          if (cellInfo.isFormula) {
            formulas.push({
              cell: cell.address,
              formula: cellInfo.formula!,
              value: cellInfo.calculatedValue
            });
          }
        });
        if (rowData.some(cell => cell !== null && cell !== undefined && cell !== '')) {
          data.push(rowData);
          processedRows++;
        }
        
        return true; // Continue iteration
      });
    }
    
    return { data, formulas };
  }

  private async writeData(): Promise<ExcelResult> {
    const { file, data, range } = this.params;
    const workbook = await this.getWorkbook();
    const worksheet = this.getWorksheet(workbook);
    
    if (!data?.length) {
      throw new Error('No data provided');
    }

    let startRow = 1;
    let startCol = 1;
    
    if (range) {
      const cell = worksheet.getCell(range);
      startRow = Number(cell.row);
      startCol = Number(cell.col);
    }

    data.forEach((rowData, rowIndex) => {
      rowData.forEach((cellValue, colIndex) => {
        const cell = worksheet.getCell(startRow + rowIndex, startCol + colIndex);
        // Check if cellValue is a formula (starts with =)
        if (typeof cellValue === 'string' && cellValue.startsWith('=')) {
          cell.value = { formula: cellValue.substring(1) }; // Remove = prefix
        } else {
          cell.value = cellValue as ExcelJS.CellValue;
        }
      });
    });

    await workbook.xlsx.writeFile(file);

    return {
      success: true,
      file,
      op: 'write',
      sheet: worksheet.name,
      rowCount: data.length,
      colCount: data[0]?.length || 0,
      llmContent: `excel(write): Wrote ${data.length} rows to ${worksheet.name}`,
      returnDisplay: `excel(write): Wrote ${data.length} rows to ${worksheet.name}`,
    };
  }

  private async createFile(): Promise<ExcelResult> {
    const { file, data } = this.params;
    const workbook = new ExcelJS.Workbook();
    const worksheet = this.getWorksheet(workbook);
    
    if (data?.length) {
      data.forEach(rowData => worksheet.addRow(rowData));
    }
    
    await workbook.xlsx.writeFile(file);

    return {
      success: true,
      file,
      op: 'create',
      sheet: worksheet.name,
      sheets: [worksheet.name],
      llmContent: `Created ${file} with sheet: ${worksheet.name}`,
      returnDisplay: `Created ${file} with sheet: ${worksheet.name}`,
    };
  }

  private async listSheets(): Promise<ExcelResult> {
    const { file } = this.params;
    
    if (!existsSync(file)) {
      return {
        success: false,
        file,
        op: 'listSheets',
        sheets: [],
        llmContent: `Excel file "${file}" does not exist`,
        returnDisplay: `File not found: ${file}`,
      };
    }
    
    const workbook = await this.getWorkbook();
    
    if (workbook.worksheets.length === 0) {
      return {
        success: true,
        file,
        op: 'listSheets', 
        sheets: [],
        llmContent: `Excel file "${file}" contains no worksheets`,
        returnDisplay: 'No worksheets found',
      };
    }
    
    const sheetsInfo: string[] = [];
    const sheetNames: string[] = [];
    
    workbook.worksheets.forEach(ws => {
      const usedRange = this.getUsedRange(ws);
      const rowCount = ws.actualRowCount || 0;
      const colCount = ws.actualColumnCount || 0;
      
      sheetNames.push(ws.name);
      sheetsInfo.push(`${ws.name} (${usedRange}, ${rowCount} rows × ${colCount} cols)`);
    });

    const summary = `excel(listSheets): Found ${sheetNames.length} sheets: ${sheetNames.join(', ')}`;
    const detailed = `Sheet details:\n${sheetsInfo.join('\n')}`;

    return {
      success: true,
      file,
      op: 'listSheets',
      sheets: sheetNames,
      llmContent: `${summary}\n\n${detailed}`,
      returnDisplay: summary,
    };
  }


  private async styleRange(): Promise<ExcelResult> {
    const { file, range, style } = this.params;
    const workbook = await this.getWorkbook();
    const worksheet = this.getWorksheet(workbook);
    
    if (!range || !style) {
      throw new Error('Range and style required');
    }

    const applyStyle = (cell: ExcelJS.Cell): void => {
      if (style.font) cell.font = style.font as unknown as ExcelJS.Font;
      if (style.fill) cell.fill = style.fill as ExcelJS.Fill;
      if (style.border) cell.border = style.border as ExcelJS.Borders;
      if (style.numFmt) cell.numFmt = style.numFmt;
      if (style.alignment) cell.alignment = style.alignment as ExcelJS.Alignment;
    };

    if (range.includes(':')) {
      const [start, end] = range.split(':');
      const startCell = worksheet.getCell(start);
      const endCell = worksheet.getCell(end);
      
      for (let row = Number(startCell.row); row <= Number(endCell.row); row++) {
        for (let col = Number(startCell.col); col <= Number(endCell.col); col++) {
          applyStyle(worksheet.getCell(row, col));
        }
      }
    } else {
      applyStyle(worksheet.getCell(range));
    }

    await workbook.xlsx.writeFile(file);

    return {
      success: true,
      file,
      op: 'style',
      sheet: worksheet.name,
      llmContent: `Applied styling to ${range}`,
      returnDisplay: `Applied styling to ${range}`,
    };
  }

  private async addValidation(): Promise<ExcelResult> {
    const { file, range, validation } = this.params;
    const workbook = await this.getWorkbook();
    const worksheet = this.getWorksheet(workbook);
    
    if (!range || !validation) {
      throw new Error('Range and validation required');
    }

    const dataValidation = {
      type: validation.type,
      allowBlank: validation.allowBlank ?? true,
      formulae: validation.formulae,
      error: validation.error,
      prompt: validation.prompt,
    } as ExcelJS.DataValidation;

    if (range.includes(':')) {
      const [start, end] = range.split(':');
      const startCell = worksheet.getCell(start);
      const endCell = worksheet.getCell(end);
      
      for (let row = Number(startCell.row); row <= Number(endCell.row); row++) {
        for (let col = Number(startCell.col); col <= Number(endCell.col); col++) {
          worksheet.getCell(row, col).dataValidation = dataValidation;
        }
      }
    } else {
      worksheet.getCell(range).dataValidation = dataValidation;
    }

    await workbook.xlsx.writeFile(file);

    return {
      success: true,
      file,
      op: 'validate',
      sheet: worksheet.name,
      llmContent: `Added ${validation.type} validation to ${range}`,
      returnDisplay: `Added ${validation.type} validation to ${range}`,
    };
  }

  // private async conditionalFormat(): Promise<ExcelResult> {
  //   const { file, range, format } = this.params;
  //   const workbook = await this.getWorkbook();
  //   const worksheet = this.getWorksheet(workbook);
    
  //   if (!range || !format) {
  //     throw new Error('Range and format type required');
  //   }

  //   // Note: ExcelJS conditional formatting support is limited
  //   // This is a basic implementation - more advanced formatting may require manual XML manipulation

  //   await workbook.xlsx.writeFile(file);

  //   return {
  //     success: true,
  //     file,
  //     op: 'format',
  //     sheet: worksheet.name,
  //     llmContent: `Applied ${format} formatting to ${range}`,
  //     returnDisplay: `Applied ${format} formatting to ${range}`,
  //   };
  // }

  private async manageRows(): Promise<ExcelResult> {
    const { file, action, position, count = 1, size } = this.params;
    const workbook = await this.getWorkbook();
    const worksheet = this.getWorksheet(workbook);
    
    if (!action || !position) {
      throw new Error('Action and position required');
    }

    let result = '';
    
    switch (action) {
      case 'insert':
        worksheet.insertRow(position, []);
        for (let i = 1; i < count; i++) {
          worksheet.insertRow(position + i, []);
        }
        result = `Inserted ${count} rows at position ${position}`;
        break;
        
      case 'delete':
        worksheet.spliceRows(position, count);
        result = `Deleted ${count} rows starting at ${position}`;
        break;
        
      case 'resize':
        if (size) {
          worksheet.getRow(position).height = size;
          result = `Set row ${position} height to ${size}`;
        } else {
          throw new Error('Size required for resize operation');
        }
        break;
        
      default:
        throw new Error(`Unsupported row action: ${action}. Supported actions are: insert, delete, resize`);
    }

    await workbook.xlsx.writeFile(file);

    return {
      success: true,
      file,
      op: 'rows',
      sheet: worksheet.name,
      llmContent: result,
      returnDisplay: result,
    };
  }

  private async manageCols(): Promise<ExcelResult> {
    const { file, action, position, count = 1, size } = this.params;
    const workbook = await this.getWorkbook();
    const worksheet = this.getWorksheet(workbook);
    
    if (!action || !position) {
      throw new Error('Action and position required');
    }

    let result = '';
    
    switch (action) {
      case 'insert':
        // Use spliceColumns to insert empty columns
        worksheet.spliceColumns(position, 0, ...Array(count).fill([]));
        result = `Inserted ${count} columns at position ${position}`;
        break;
        
      case 'delete':
        worksheet.spliceColumns(position, count);
        result = `Deleted ${count} columns starting at ${position}`;
        break;
        
      case 'resize':
        if (size) {
          worksheet.getColumn(position).width = size;
          result = `Set column ${position} width to ${size}`;
        } else {
          throw new Error('Size required for resize operation');
        }
        break;
        
      default:
        throw new Error(`Unsupported column action: ${action}. Supported actions are: insert, delete, resize`);
    }

    await workbook.xlsx.writeFile(file);

    return {
      success: true,
      file,
      op: 'cols',
      sheet: worksheet.name,
      llmContent: result,
      returnDisplay: result,
    };
  }

  private async mergeCells(): Promise<ExcelResult> {
    const { file, range } = this.params;
    const workbook = await this.getWorkbook();
    const worksheet = this.getWorksheet(workbook);
    
    if (!range || !range.includes(':')) {
      throw new Error('Range required (e.g., A1:C3)');
    }

    worksheet.mergeCells(range);
    await workbook.xlsx.writeFile(file);

    return {
      success: true,
      file,
      op: 'merge',
      sheet: worksheet.name,
      llmContent: `Merged cells ${range}`,
      returnDisplay: `Merged cells ${range}`,
    };
  }

  // private async protectSheet(): Promise<ExcelResult> {
  //   const { file, password, options } = this.params;
  //   const workbook = await this.getWorkbook();
  //   const worksheet = this.getWorksheet(workbook);
    
  //   await worksheet.protect(password || '', options || {});
  //   await workbook.xlsx.writeFile(file);

  //   return {
  //     success: true,
  //     file,
  //     op: 'protect',
  //     sheet: worksheet.name,
  //     llmContent: `Protected sheet ${worksheet.name}`,
  //     returnDisplay: `Protected sheet ${worksheet.name}`,
  //   };
  // }


  private getCellInfo(cell: ExcelJS.Cell, address: string): { value: unknown; isFormula: boolean; formula?: string; calculatedValue?: unknown } {
    const isFormula = !!cell.formula;
    
    if (isFormula) {
      // Extract calculated value properly
      let calculatedValue: unknown = undefined;
      if (cell.result !== undefined && cell.result !== null) {
        calculatedValue = typeof cell.result === 'object' && 'result' in cell.result 
          ? (cell.result as any).result 
          : cell.result;
      } else if (cell.value !== undefined && cell.value !== null) {
        calculatedValue = typeof cell.value === 'object' && 'result' in cell.value 
          ? (cell.value as any).result 
          : cell.value;
      }
      
      return {
        value: `=${cell.formula}`,
        isFormula: true,
        formula: cell.formula,
        calculatedValue
      };
    }
    
    return {
      value: cell.value === null || cell.value === undefined ? null : cell.value,
      isFormula: false
    };
  }

  private getUsedRange(worksheet: ExcelJS.Worksheet): string {
    // Get worksheet dimensions
    const rowCount = worksheet.actualRowCount || 0;
    const columnCount = worksheet.actualColumnCount || 0;
    
    if (rowCount === 0 || columnCount === 0) {
      return 'A1:A1'; // Empty sheet
    }
    
    // Convert column number to letter
    const getColumnLetter = (col: number): string => {
      let result = '';
      while (col > 0) {
        col--;
        result = String.fromCharCode(65 + (col % 26)) + result;
        col = Math.floor(col / 26);
      }
      return result;
    };
    
    const endColumn = getColumnLetter(columnCount);
    return `A1:${endColumn}${rowCount}`;
  }

  private async addWorksheet(): Promise<ExcelResult> {
    const { file, newSheet, tabColor } = this.params;
    const workbook = await this.getWorkbook();
    
    if (!newSheet) {
      throw new Error('New sheet name required');
    }

    // Check if sheet already exists
    if (workbook.getWorksheet(newSheet)) {
      throw new Error(`Sheet "${newSheet}" already exists`);
    }

    const worksheet = workbook.addWorksheet(newSheet);
    
    // Set tab color if provided
    if (tabColor) {
      worksheet.properties.tabColor = { argb: tabColor.replace('#', 'FF') };
    }

    await workbook.xlsx.writeFile(file);

    return {
      success: true,
      file,
      op: 'addSheet',
      sheet: newSheet,
      sheets: workbook.worksheets.map(ws => ws.name),
      llmContent: `Added sheet "${newSheet}"`,
      returnDisplay: `Added sheet "${newSheet}"`,
    };
  }

  private async editWorksheet(): Promise<ExcelResult> {
    const { file, sheet, newSheet, tabColor } = this.params;
    const workbook = await this.getWorkbook();
    
    if (!sheet) {
      throw new Error('Sheet name required');
    }

    const worksheet = workbook.getWorksheet(sheet);
    if (!worksheet) {
      throw new Error(`Sheet "${sheet}" not found`);
    }

    const changes: string[] = [];

    // Rename sheet if new name provided
    if (newSheet && newSheet !== sheet) {
      // Check if new name already exists
      if (workbook.getWorksheet(newSheet)) {
        throw new Error(`Sheet "${newSheet}" already exists`);
      }
      worksheet.name = newSheet;
      changes.push(`Renamed to "${newSheet}"`);
    }

    // Set tab color if provided
    if (tabColor) {
      worksheet.properties.tabColor = { argb: tabColor.replace('#', 'FF') };
      changes.push(`Set tab color to ${tabColor}`);
    }

    if (changes.length === 0) {
      throw new Error('No changes specified (provide newSheet or tabColor)');
    }

    await workbook.xlsx.writeFile(file);

    return {
      success: true,
      file,
      op: 'editSheet',
      sheet: newSheet || sheet,
      sheets: workbook.worksheets.map(ws => ws.name),
      llmContent: `Sheet "${sheet}" updated: ${changes.join(', ')}`,
      returnDisplay: `Sheet "${sheet}" updated: ${changes.join(', ')}`,
    };
  }

  private async deleteWorksheet(): Promise<ExcelResult> {
    const { file, sheet } = this.params;
    const workbook = await this.getWorkbook();
    
    if (!sheet) {
      throw new Error('Sheet name required');
    }

    const worksheet = workbook.getWorksheet(sheet);
    if (!worksheet) {
      throw new Error(`Sheet "${sheet}" not found`);
    }

    // Prevent deleting the last sheet
    if (workbook.worksheets.length <= 1) {
      throw new Error('Cannot delete the last remaining sheet');
    }

    workbook.removeWorksheet(worksheet.id);
    await workbook.xlsx.writeFile(file);

    return {
      success: true,
      file,
      op: 'deleteSheet',
      sheets: workbook.worksheets.map(ws => ws.name),
      llmContent: `Deleted sheet "${sheet}"`,
      returnDisplay: `Deleted sheet "${sheet}"`,
    };
  }

  private async copySheet(): Promise<ExcelResult> {
    const { sourceFile, targetFile, sourceSheet, targetSheet } = this.params;
    
    if (!sourceFile || !targetFile || !sourceSheet || !targetSheet) {
      throw new Error('copySheet requires: sourceFile, targetFile, sourceSheet, targetSheet');
    }
    
    // Load source workbook
    const sourceWorkbook = new ExcelJS.Workbook();
    if (!existsSync(sourceFile)) {
      throw new Error(`Source file "${sourceFile}" does not exist`);
    }
    await sourceWorkbook.xlsx.readFile(sourceFile);
    
    const srcWorksheet = sourceWorkbook.getWorksheet(sourceSheet);
    if (!srcWorksheet) {
      const availableSheets = sourceWorkbook.worksheets.map(ws => ws.name).join(', ');
      throw new Error(`Source sheet "${sourceSheet}" not found. Available sheets: ${availableSheets}`);
    }
    
    // Load or create target workbook
    const targetWorkbook = new ExcelJS.Workbook();
    if (existsSync(targetFile)) {
      await targetWorkbook.xlsx.readFile(targetFile);
    }
    
    // Check if target sheet already exists
    if (targetWorkbook.getWorksheet(targetSheet)) {
      throw new Error(`Target sheet "${targetSheet}" already exists in "${targetFile}"`);
    }
    
    // Get used range of source sheet
    const usedRange = this.getUsedRange(srcWorksheet);
    let copiedRows = 0;
    
    // Create target worksheet
    const targetWorksheet = targetWorkbook.addWorksheet(targetSheet);
    
    // Copy all data from source to target
    srcWorksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const targetRow = targetWorksheet.getRow(rowNumber);
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const targetCell = targetRow.getCell(colNumber);
        
        // Copy cell value
        targetCell.value = cell.value;
        
        // Copy cell formatting (basic)
        if (cell.style) {
          targetCell.style = cell.style;
        }
      });
      copiedRows++;
    });
    
    // Save target workbook
    await targetWorkbook.xlsx.writeFile(targetFile);
    
    return {
      success: true,
      file: targetFile,
      op: 'copySheet',
      sheet: targetSheet,
      usedRange,
      rowCount: copiedRows,
      llmContent: `Successfully copied sheet "${sourceSheet}" from "${sourceFile}" to "${targetSheet}" in "${targetFile}". Copied ${copiedRows} rows. Source used range: ${usedRange}`,
      returnDisplay: `Copied sheet "${sourceSheet}" to "${targetSheet}" (${copiedRows} rows)`,
    };
  }

  private async addComment(): Promise<ExcelResult> {
    const { file, range, comment, author } = this.params;
    const workbook = await this.getWorkbook();
    const worksheet = this.getWorksheet(workbook);
    
    if (!range) {
      throw new Error('Range required for comment');
    }
    
    if (!comment) {
      throw new Error('Comment content required');
    }

    const addCommentToCell = (cell: ExcelJS.Cell): void => {
      cell.note = {
        texts: [{ text: comment }],
        ...(author && { author })
      };
    };

    let cellCount = 0;
    
    if (range.includes(':')) {
      const [start, end] = range.split(':');
      const startCell = worksheet.getCell(start);
      const endCell = worksheet.getCell(end);
      
      for (let row = Number(startCell.row); row <= Number(endCell.row); row++) {
        for (let col = Number(startCell.col); col <= Number(endCell.col); col++) {
          addCommentToCell(worksheet.getCell(row, col));
          cellCount++;
        }
      }
    } else {
      addCommentToCell(worksheet.getCell(range));
      cellCount = 1;
    }

    await workbook.xlsx.writeFile(file);

    const authorInfo = author ? ` by ${author}` : '';
    return {
      success: true,
      file,
      op: 'comment',
      sheet: worksheet.name,
      llmContent: `Added comment to ${cellCount} cell(s) in ${range}${authorInfo}`,
      returnDisplay: `Added comment to ${cellCount} cell(s) in ${range}${authorInfo}`,
    };
  }

  private async readCSV(): Promise<ExcelResult> {
    const { file, delimiter = ',', encoding = 'utf8' } = this.params;
    
    if (!existsSync(file)) {
      return {
        success: false,
        file,
        op: 'csvRead',
        data: [],
        rowCount: 0,
        colCount: 0,
        llmContent: `excel(csvRead): CSV file "${file}" does not exist. Please check the file path and try again.`,
        returnDisplay: `excel(csvRead): File not found: ${file}`,
      };
    }
    
    try {
      const csvContent = await fs.readFile(file, { encoding });
      
      // Use callback-based parse function wrapped in Promise
      const records = await new Promise<unknown[][]>((resolve, reject) => {
        parse(csvContent, {
          delimiter,
          skip_empty_lines: true,
          trim: true,
          columns: false, // Return as array of arrays
        }, (err, data) => {
          if (err) {
            reject(err);
          } else {
            resolve(data as unknown[][]);
          }
        });
      });
      
      const rowCount = records.length;
      const colCount = records.length > 0 ? Math.max(...records.map(row => row.length)) : 0;
      
      // Create preview for LLM
      const dataPreview = records.length > 3 
        ? records.slice(0, 3).map(row => row.join('\t')).join('\n') + '\n...(truncated for brevity)'
        : records.map(row => row.join('\t')).join('\n');
      
      const dataDisplay = records.length > 0 
        ? `excel(csvRead): Read ${rowCount} rows × ${colCount} columns\nData preview:\n${dataPreview}`
        : `excel(csvRead): CSV file "${file}" is empty`;

      return {
        success: true,
        file,
        op: 'csvRead',
        data: records,
        rowCount,
        colCount,
        llmContent: dataDisplay,
        returnDisplay: `excel(csvRead): Read ${rowCount} rows from ${file.split(/[/\\]/).pop()}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        file,
        op: 'csvRead',
        data: [],
        rowCount: 0,
        colCount: 0,
        llmContent: `excel(csvRead): Failed to read CSV file "${file}": ${message}`,
        returnDisplay: `excel(csvRead): Failed to read CSV: ${message}`,
      };
    }
  }

  private async csvExport(): Promise<ExcelResult> {
    const { file, data, delimiter = ',', headers = true, quote = '"', encoding = 'utf8', sheet, range } = this.params;
    
    let csvData = data;
    let csvFilePath: string;
    let actualSheetName = sheet;
    
    // If no data provided, read from Excel file
    if (!csvData?.length) {
      if (!existsSync(file)) {
        throw new Error(`Excel file "${file}" does not exist.`);
      }
      
      // Read data from Excel file
      const readResult = await this.readExcelForCSVExport(file, sheet, range);
      if (!readResult.success) {
        return {
          success: false,
          file,
          op: 'csvExport',
          llmContent: `Failed to read data from Excel file "${file}": ${readResult.error}`,
          returnDisplay: `CSV export failed: ${readResult.error}`,
        };
      }
      csvData = readResult.data;
      actualSheetName = readResult.sheetName;
      
      if (!csvData?.length) {
        return {
          success: false,
          file,
          op: 'csvExport',
          llmContent: `excel(csvExport): No data found in Excel file "${file}"${actualSheetName ? ` sheet "${actualSheetName}"` : ''}${range ? ` range "${range}"` : ''}`,
          returnDisplay: 'excel(csvExport): Failed to export CSV: No data to export',
        };
      }
    }
    
    // Generate CSV file path
    if (actualSheetName) {
      // Use sheet name + Excel file directory
      const excelDir = path.dirname(file);
      const sanitizedSheetName = actualSheetName.replace(/[<>:"/\\|?*]/g, '_'); // Sanitize filename
      csvFilePath = path.join(excelDir, `${sanitizedSheetName}.csv`);
      
      // Handle duplicate names
      let counter = 1;
      const basePath = csvFilePath;
      while (existsSync(csvFilePath)) {
        const parsed = path.parse(basePath);
        csvFilePath = path.join(parsed.dir, `${parsed.name}_${counter}${parsed.ext}`);
        counter++;
      }
    } else {
      // Fallback: use Excel file name with .csv extension
      csvFilePath = file.replace(/\.(xlsx?|xls)$/i, '.csv');
    }
    
    try {
      // Convert array format to csv-stringify compatible format
      let processedData: any[];
      
      if (headers && csvData.length > 0) {
        // First row contains headers, convert to object format
        const headerRow = csvData[0] as any[];
        const dataRows = csvData.slice(1);
        
        processedData = dataRows.map(row => {
          const obj: any = {};
          headerRow.forEach((header, index) => {
            obj[header || `Column${index + 1}`] = row[index] || '';
          });
          return obj;
        });
      } else {
        // No headers, use array format
        processedData = csvData as any[];
      }
      
      // Use callback-based stringify function wrapped in Promise
      const csvContent = await new Promise<string>((resolve, reject) => {
        stringify(processedData, {
          delimiter,
          header: headers,
          quoted: true,
          quote,
        }, (err, output) => {
          if (err) {
            reject(err);
          } else {
            resolve(output);
          }
        });
      });
      
      await fs.writeFile(csvFilePath, csvContent, { encoding });
      
      return {
        success: true,
        file: csvFilePath,
        op: 'csvExport',
        rowCount: csvData.length,
        colCount: csvData[0]?.length || 0,
        llmContent: `excel(csvRead): Exported ${csvData.length} rows from Excel "${file}"${actualSheetName ? ` sheet "${actualSheetName}"` : ''}${range ? ` range "${range}"` : ''} to CSV "${csvFilePath}"`,
        returnDisplay: `excel(csvRead): Exported ${csvData.length} rows to ${path.basename(csvFilePath)}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        file: csvFilePath || file,
        op: 'csvExport',
        llmContent: `excel(csvRead):Failed to write CSV file "${csvFilePath || file}": ${message}`,
        returnDisplay: `excel(csvRead): Failed to export CSV: ${message}`,
      };
    }
  }

  private async csvImport(): Promise<ExcelResult> {
    const { file, sourceFile, sheet, range, delimiter = ',', encoding = 'utf8' } = this.params;
    
    if (!sourceFile) {
      throw new Error('sourceFile parameter is required for CSV import operation');
    }
    
    if (!existsSync(sourceFile)) {
      throw new Error(`Source CSV file "${sourceFile}" does not exist`);
    }
    
    try {
      // Read CSV data
      const csvContent = await fs.readFile(sourceFile, { encoding });
      const records = await new Promise<unknown[][]>((resolve, reject) => {
        parse(csvContent, {
          delimiter,
          skip_empty_lines: true,
          trim: true,
          columns: false, // Return as array of arrays
        }, (err, data) => {
          if (err) {
            reject(err);
          } else {
            resolve(data as unknown[][]);
          }
        });
      });
      
      if (!records?.length) {
        return {
          success: false,
          file,
          op: 'csvImport',
          llmContent: `excel(csvImport): CSV file "${sourceFile}" is empty or contains no data`,
          returnDisplay: 'excel(csvImport): Failed to import CSV: No data to import',
        };
      }
      
      // Import to Excel
      const workbook = await this.getWorkbook();
      const worksheet = this.getWorksheet(workbook);
      
      let startRow = 1;
      let startCol = 1;
      
      if (range) {
        const cell = worksheet.getCell(range);
        startRow = Number(cell.row);
        startCol = Number(cell.col);
      }
      
      // Write CSV data to Excel
      records.forEach((rowData, rowIndex) => {
        rowData.forEach((cellValue, colIndex) => {
          const cell = worksheet.getCell(startRow + rowIndex, startCol + colIndex);
          cell.value = cellValue as ExcelJS.CellValue;
        });
      });
      
      await workbook.xlsx.writeFile(file);
      
      return {
        success: true,
        file,
        op: 'csvImport',
        sheet: worksheet.name,
        rowCount: records.length,
        colCount: records[0]?.length || 0,
        llmContent: `excel(csvImport): Imported ${records.length} rows from CSV "${sourceFile}" to Excel "${file}"${sheet ? ` sheet "${sheet}"` : ''}${range ? ` starting at "${range}"` : ''}`,
        returnDisplay: `excel(csvImport): Imported ${records.length} rows from ${path.basename(sourceFile)} to ${worksheet.name}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        file,
        op: 'csvImport',
        llmContent: `excel(csvImport): Failed to import CSV file "${sourceFile}": ${message}`,
        returnDisplay: `excel(csvImport): CSV import failed: ${message}`,
      };
    }
  }

  private async readExcelForCSVExport(excelFile: string, sheetName?: string, range?: string): Promise<{ success: boolean; data?: unknown[][]; error?: string; sheetName?: string }> {
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(excelFile);
      
      if (workbook.worksheets.length === 0) {
        return { success: false, error: 'Excel file contains no worksheets' };
      }
      
      let worksheet: ExcelJS.Worksheet;
      if (sheetName) {
        const foundWorksheet = workbook.getWorksheet(sheetName);
        if (!foundWorksheet) {
          const availableSheets = workbook.worksheets.map(ws => ws.name).join(', ');
          return { success: false, error: `Sheet "${sheetName}" not found. Available sheets: ${availableSheets}` };
        }
        worksheet = foundWorksheet;
      } else {
        worksheet = workbook.worksheets[0];
      }
      
      const result = await this.readSingleSheet(worksheet, range);
      return { success: true, data: result.data, sheetName: worksheet.name };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }
}

export class ExcelTool extends BaseDeclarativeTool<ExcelParams, ExcelResult> {
  constructor() {
    super(
      'excel',
      'Excel & CSV Operations', 
      'Excel/CSV file management: read/write Excel/CSV data & formulas, styling, validation, row/col operations, merge cells, sheets. CSV operations: csvRead (file=csv_path), csvExport (IMPORTANT: file=source_excel_path, sheet=sheet_name, automatically generates CSV filename), csvImport (file=target_excel_path, sourceFile=csv_path)',
      Kind.Other,
      {
        type: 'object',
        required: ['file', 'op'],
        properties: {
          file: { type: 'string', description: 'File path: Excel file for most operations (including csvExport), CSV file ONLY for csvRead' },
          op: { 
            type: 'string', 
            enum: ['read', 'write', 'create', 'listSheets', 'copySheet', 'style', 'validate', 'rows', 'cols', 'merge', 'addSheet', 'editSheet', 'deleteSheet', 'comment', 'csvRead', 'csvExport', 'csvImport'],
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
          password: { type: 'string', description: 'Protection password' },
          options: { type: 'object', description: 'Protection options' },
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
          quote: { type: 'string', description: 'CSV quote character (default: ")' }
        }
      }
    );
  }

  protected createInvocation(params: ExcelParams): ExcelInvocation {
    return new ExcelInvocation(params);
  }
}

export const excelTool = new ExcelTool();