/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasePythonTool } from './base-python-tool.js';
import type { ToolResult } from './tools.js';
import type { Config } from '../config/config.js';

/**
 * Parameters for xlwings Excel operations
 */
interface XlwingsParams {
  /** Operation type */
  op: 'read' | 'write' | 'create_chart' | 'update_chart' | 'delete_chart' | 'list_charts' | 'format' | 'add_sheet' | 'list_books' | 
  'list_sheets' | 'get_selection' | 'set_selection' | 'formula' | 'clear' | 'copy_paste' | 'find_replace' | 'create_workbook' | 
  'open_workbook' | 'save_workbook' | 'close_workbook' | 'get_last_row' | 'get_used_range' | 'convert_data_types' | 'add_vba_module' | 
  'run_vba_macro' | 'update_vba_code' | 'list_vba_modules' | 'delete_vba_module' | 'insert_image' | 'list_images' | 'delete_image' | 
  'resize_image' | 'move_image' | 'save_range_as_image' | 'save_chart_as_image' | 'search_data' | 'list_apps' | 
  'insert_row' | 'insert_column' | 'delete_row' | 'delete_column';
  
  /** Target workbook name (optional - uses active if not specified) */
  workbook?: string;
  
  /** Target worksheet name (optional - uses active if not specified) */
  worksheet?: string;
  
  /** Cell range (e.g., "A1", "A1:C10", "Sheet1!A1:B5") */
  range?: string;
  
  /** Data to write (for write operations) */
  data?: unknown[][] | unknown[];
  
  /** Chart configuration (for chart operations) */
  chart?: {
    type: 'line' | 'column' | 'bar' | 'pie' | 'scatter' | 'area';
    title?: string;
    x_axis_title?: string;
    y_axis_title?: string;
    data_range?: string;
    categories_range?: string;
    position?: string; // Where to place the chart
  };
  
  /** Chart name/identifier (for chart management operations) */
  chart_name?: string;
  
  /** Formatting options */
  format?: {
    font?: {
      name?: string;
      size?: number;
      bold?: boolean;
      italic?: boolean;
      color?: string;
    };
    fill?: {
      color?: string;
    };
    borders?: boolean;
    number_format?: string;
    alignment?: 'left' | 'center' | 'right';
  };
  
  /** Formula to set (for formula operations) */
  formula?: string;
  
  /** Search and replace options */
  search?: {
    find: string;
    replace: string;
    match_case?: boolean;
    whole_words?: boolean;
  };
  
  /** Copy/paste options */
  copy_paste?: {
    source_range: string;
    destination_range: string;
    values_only?: boolean;
    /** If true, delete the source data after copying (cut operation) */
    cut_mode?: boolean;
  };
  
  /** New sheet name (for add_sheet operations) */
  new_sheet_name?: string;
  
  /** Whether to make Excel visible during operation */
  visible?: boolean;
  
  /** Maximum rows to return for read operations (default: 100 for preview, set higher for complete data) */
  max_rows?: number;
  
  /** Starting row for batch reading (1-based, for pagination) */
  start_row?: number;
  
  /** Provide data summary instead of full data when dataset is large */
  summary_mode?: boolean;
  
  /** File path for create_workbook, open_workbook, save_workbook operations */
  file_path?: string;
  
  /** Whether to save existing changes before closing (for close_workbook) */
  save_before_close?: boolean;
  
  /** VBA module name */
  vba_module?: string;
  
  /** VBA code content */
  vba_code?: string;
  
  /** VBA macro name to run */
  macro_name?: string;
  
  /** Image file path (for insert_image operations) */
  image_path?: string;
  
  /** Image name/identifier (for image management operations) */
  image_name?: string;
  
  /** Image width (for image operations) */
  width?: number;
  
  /** Image height (for image operations) */
  height?: number;
  
  /** Output file path (for export operations) */
  output_path?: string;
  
  /** Search term (for search_data operation) */
  search_term?: string;
  
  /** Search column name or index (for search_data operation, optional - searches all columns if not specified) */
  search_column?: string | number;
  
  /** Search in formulas as well as values (for search_data operation, default: true) */
  search_formulas?: boolean;
  
  /** Auto-select cell if only one match found (for search_data operation, default: true) */
  auto_select?: boolean;
  
  /** Excel application PID or index to connect to (optional, uses active if not specified) */
  app_id?: number;
  
  /** Row or column position/index for insert/delete operations (1-based for rows, A/B/C or 1/2/3 for columns) */
  position?: string | number;
  
  /** Number of rows/columns to insert or delete (default: 1) */
  count?: number;
}

/**
 * Result from xlwings Excel operations
 */
interface XlwingsResult extends ToolResult {
  success: boolean;
  operation: string;
  workbook?: string;
  worksheet?: string;
  range?: string;
  data?: unknown[][];
  books?: string[];
  sheets?: string[];
  selection?: string;
  chart_created?: boolean;
  cells_affected?: number;
  xlwings_error?: string; // Renamed to avoid conflict with ToolResult.error
  file_created?: boolean;
  file_opened?: boolean;
  file_saved?: boolean;
  file_closed?: boolean;
  file_path?: string;
  
  // Image operation results
  image_name?: string;
  image_path?: string;
  image_deleted?: boolean;
  images?: Array<{
    name: string;
    width?: number;
    height?: number;
    left?: number;
    top?: number;
  }>;
  total_images?: number;
  original_width?: number;
  original_height?: number;
  new_width?: number;
  new_height?: number;
  original_left?: number;
  original_top?: number;
  new_position?: string;
  output_path?: string;
  file_size?: number;
  
  // Chart operation results  
  chart_name?: string;
  chart_type?: string;
  position?: string;
  charts?: Array<{
    name: string;
    chart_type: string;
    title?: string;
  }>;
  total_charts?: number;
  updated_properties?: string[];
  chart_deleted?: boolean;
  
  // VBA operation results
  module_name?: string;
  action?: string;
  code_lines?: number;
  macro_name?: string;
  macro_result?: unknown;
  modules?: Array<{
    name: string;
    code_lines: number;
  }>;
  total_modules?: number;
  deleted?: boolean;
  
  // Other operation results
  last_row?: number;
  last_column?: number;
  used_range?: string;
  column?: string;
  formula?: string;
  find_text?: string;
  replace_text?: string;
  source_range?: string;
  destination_range?: string;
  values_only?: boolean;
  source_worksheet?: string;
  destination_worksheet?: string;
  copy_method?: string;
  new_sheet_name?: string;
  total_cells?: number;
  converted_cells?: number;
  
  // Search operation results
  search_term?: string;
  search_formulas?: boolean;
  total_matches?: number;
  matches?: Array<{
    worksheet: string;
    address: string;
    row: number;
    column: number;
    column_name: string;
    matched_value: unknown;
    matched_formula?: string;
    match_type: 'value' | 'formula';
    row_data: Record<string, unknown>;
  }>;
  auto_selected?: string;
  
  // List apps operation results
  total_apps?: number;
  apps?: Array<{
    index: number;
    pid?: number;
    visible?: boolean;
    is_active: boolean;
    books_count: number;
    books: Array<{
      name: string;
      full_name: string;
      saved?: boolean;
      sheets_count: number;
    }>;
    error?: string;
  }>;
  active_app_index?: number;
  message?: string;
}

/**
 * Excel interaction tool using xlwings for real-time Excel manipulation
 */
export class XlwingsTool extends BasePythonTool<XlwingsParams, XlwingsResult> {
  constructor(config: Config) {
    super(
      'xlwings',
      'Excel Live Interaction',
      'Real-time Excel manipulation using xlwings with smart data handling. Can start Excel, create/open files, and perform all Excel operations. Features: BATCH READING (use max_rows, start_row for pagination), PROGRESS TRACKING (shows total/remaining rows), DATA SUMMARY (summary_mode for large datasets). IMPORTANT: Requires xlwings library (pip install xlwings). Can work with existing Excel instances or start new ones. Supports: file creation/opening, data I/O, chart creation, formatting, formulas, sheet management, find/replace, copy/paste operations. Use visible=true to show Excel UI.',
      ['xlwings'], // Python requirements
      {
        type: 'object',
        required: ['op'],
        properties: {
          op: {
            type: 'string',
            enum: ['read', 'write', 'create_chart', 'update_chart', 'delete_chart', 'list_charts', 'format', 'add_sheet', 'list_books', 'list_sheets', 'get_selection', 'set_selection', 'formula', 'clear', 'copy_paste', 'find_replace', 'create_workbook', 'open_workbook', 'save_workbook', 'close_workbook', 'get_last_row', 'get_used_range', 'convert_data_types', 'add_vba_module', 'run_vba_macro', 'update_vba_code', 'list_vba_modules', 'delete_vba_module', 'insert_image', 'list_images', 'delete_image', 'resize_image', 'move_image', 'save_range_as_image', 'save_chart_as_image', 'search_data', 'list_apps', 'insert_row', 'insert_column', 'delete_row', 'delete_column'],
            description: 'Operation to perform'
          },
          workbook: {
            type: 'string',
            description: 'Target workbook name (uses active workbook if not specified)'
          },
          worksheet: {
            type: 'string', 
            description: 'Target worksheet name (uses active worksheet if not specified)'
          },
          range: {
            type: 'string',
            description: 'Cell range (e.g., "A1", "A1:C10", "Sheet1!A1:B5")'
          },
          data: {
            type: 'array',
            description: 'Data to write (2D array for multiple rows/cols, 1D array for single row/col)'
          },
          chart: {
            type: 'object',
            description: 'Chart configuration',
            properties: {
              type: {
                type: 'string',
                enum: ['line', 'column', 'bar', 'pie', 'scatter', 'area'],
                description: 'Chart type'
              },
              title: { type: 'string', description: 'Chart title' },
              x_axis_title: { type: 'string', description: 'X-axis title' },
              y_axis_title: { type: 'string', description: 'Y-axis title' },
              data_range: { type: 'string', description: 'Data range for chart' },
              categories_range: { type: 'string', description: 'Categories range for chart' },
              position: { type: 'string', description: 'Chart position (e.g., "D1")' }
            }
          },
          format: {
            type: 'object', 
            description: 'Formatting options',
            properties: {
              font: { type: 'object', description: 'Font settings' },
              fill: { type: 'object', description: 'Fill color' },
              borders: { type: 'boolean', description: 'Add borders' },
              number_format: { type: 'string', description: 'Number format' },
              alignment: { 
                type: 'string', 
                enum: ['left', 'center', 'right'], 
                description: 'Text alignment' 
              }
            }
          },
          formula: {
            type: 'string',
            description: 'Formula to set (e.g., "=SUM(A1:A10)")'
          },
          search: {
            type: 'object',
            description: 'Search and replace options',
            properties: {
              find: { type: 'string', description: 'Text to find' },
              replace: { type: 'string', description: 'Replacement text' },
              match_case: { type: 'boolean', description: 'Match case' },
              whole_words: { type: 'boolean', description: 'Match whole words only' }
            }
          },
          copy_paste: {
            type: 'object',
            description: 'Copy/paste options',
            properties: {
              source_range: { type: 'string', description: 'Source range' },
              destination_range: { type: 'string', description: 'Destination range' },
              values_only: { type: 'boolean', description: 'Copy values only' },
              cut_mode: { type: 'boolean', description: 'Delete source data after copying (cut operation)' }
            }
          },
          new_sheet_name: {
            type: 'string',
            description: 'Name for new sheet'
          },
          visible: {
            type: 'boolean',
            description: 'Make Excel visible during operation (default: false)'
          },
          max_rows: {
            type: 'number',
            description: 'Maximum rows to return for read operations (default: 100 for preview, increase for more data)'
          },
          start_row: {
            type: 'number',
            description: 'Starting row for batch reading (1-based, for pagination through large datasets)'
          },
          summary_mode: {
            type: 'boolean',
            description: 'Return data summary instead of full data for large datasets (default: false)'
          },
          file_path: {
            type: 'string',
            description: 'File path for create_workbook, open_workbook, save_workbook operations'
          },
          save_before_close: {
            type: 'boolean',
            description: 'Whether to save existing changes before closing (for close_workbook)'
          },
          vba_module: {
            type: 'string',
            description: 'VBA module name (for VBA operations)'
          },
          vba_code: {
            type: 'string',
            description: 'VBA code content (for add_vba_module, update_vba_code operations)'
          },
          macro_name: {
            type: 'string',
            description: 'VBA macro name to run (for run_vba_macro operation)'
          },
          chart_name: {
            type: 'string',
            description: 'Chart name/identifier (for chart management operations)'
          },
          image_path: {
            type: 'string',
            description: 'Image file path (for insert_image operations)'
          },
          image_name: {
            type: 'string', 
            description: 'Image name/identifier (for image management operations)'
          },
          width: {
            type: 'number',
            description: 'Image width in pixels (for image operations)'
          },
          height: {
            type: 'number',
            description: 'Image height in pixels (for image operations)'
          },
          output_path: {
            type: 'string',
            description: 'Output file path (for export operations)'
          },
          search_term: {
            type: 'string',
            description: 'Search term to find in cells (for search_data operation)'
          },
          search_column: {
            description: 'Column name (string) or index (number) to search in (optional, searches all columns if not specified)'
          },
          search_formulas: {
            type: 'boolean',
            description: 'Search in cell formulas as well as values (default: true)'
          },
          auto_select: {
            type: 'boolean',
            description: 'Auto-select cell if only one match found (default: true)'
          },
          app_id: {
            type: 'number',
            description: 'Excel application PID or index to connect to (optional, uses active if not specified)'
          },
          position: {
            description: 'Row or column position for insert/delete operations (1-based for rows, A/B/C or 1/2/3 for columns)'
          },
          count: {
            type: 'number',
            description: 'Number of rows/columns to insert or delete (default: 1)'
          }
        }
      },
      config,
      true,  // isOutputMarkdown
      false  // canUpdateOutput
    );
  }

  protected generatePythonCode(params: XlwingsParams): string {
    return this.buildPythonScript(params);
  }

  protected parseResult(pythonOutput: string, params: XlwingsParams): XlwingsResult {
    try {
      // Try to parse JSON output from Python script
      const lines = pythonOutput.trim().split('\n');
      const lastLine = lines[lines.length - 1];
      
      if (lastLine.startsWith('{') && lastLine.endsWith('}')) {
        const result = JSON.parse(lastLine);
        
        // Format the result for LLM consumption
        let llmContent = `Excel ${params.op} operation `;
        if (result.success) {
          llmContent += 'completed successfully.';
          
          if (result.data && Array.isArray(result.data)) {
            // Check if data is 2D array (multiple rows) or 1D array (single row)
            const is2DArray = Array.isArray(result.data[0]);
            
            let rowCount;
            let colCount;
            if (is2DArray) {
              // 2D array: [[...], [...], ...]
              rowCount = result.data.length;
              colCount = result.data[0]?.length || 0;
            } else {
              // 1D array: [...] - treat as single row
              rowCount = 1;
              colCount = result.data.length;
            }
            
            llmContent += ` Retrieved ${rowCount} rows × ${colCount} columns of data.\n\n`;
            
            // Add the actual data content for LLM
            if (colCount > 0) {
              llmContent += '**Data Content:**\n';
              
              // Format as markdown table if reasonable size
              if (rowCount <= 50 && colCount <= 20) {
                // Create markdown table headers
                llmContent += '| ';
                for (let col = 0; col < colCount; col++) {
                  llmContent += `Col${col + 1} | `;
                }
                llmContent += '\n| ';
                for (let col = 0; col < colCount; col++) {
                  llmContent += '--- | ';
                }
                llmContent += '\n';
                
                // Add data rows
                for (let row = 0; row < Math.min(rowCount, 50); row++) {
                  llmContent += '| ';
                  for (let col = 0; col < colCount; col++) {
                    let cellValue;
                    if (is2DArray) {
                      cellValue = result.data[row]?.[col] ?? '';
                    } else {
                      // For 1D array (single row), use the column index directly
                      cellValue = result.data[col] ?? '';
                    }
                    llmContent += `${String(cellValue).replace(/\|/g, '\\|')} | `;
                  }
                  llmContent += '\n';
                }
                
                if (rowCount > 50) {
                  llmContent += `\n... (showing first 50 rows of ${rowCount} total rows)`;
                }
              } else {
                // Too large for table, show as text
                llmContent += 'Data preview (first few rows):\n';
                for (let i = 0; i < Math.min(rowCount, 10); i++) {
                  llmContent += `Row ${i + 1}: ${JSON.stringify(result.data[i])}\n`;
                }
                if (rowCount > 10) {
                  llmContent += `... (showing first 10 rows of ${rowCount} total rows)`;
                }
              }
            }
          }
          
          if (result.chart_created) {
            const chartType = result.chart_type || 'chart';
            const position = result.position ? ` at position ${result.position}` : '';
            const chartName = result.chart_name ? ` (${result.chart_name})` : '';
            llmContent += ` ${chartType.charAt(0).toUpperCase() + chartType.slice(1)} chart created successfully${position}${chartName}.`;
          }
          
          if (result.updated_properties && Array.isArray(result.updated_properties)) {
            llmContent += ` Chart "${result.chart_name}" updated. Properties changed: ${result.updated_properties.join(', ')}.`;
          }
          
          if (result.chart_deleted) {
            llmContent += ` Chart "${result.chart_name}" deleted successfully.`;
          }
          
          if (result.charts && Array.isArray(result.charts)) {
            llmContent += ` Found ${result.total_charts} charts in ${result.worksheet}:\\n`;
            for (const chart of result.charts) {
              const title = chart.title ? ` - "${chart.title}"` : '';
              llmContent += ` - ${chart.name} (${chart.chart_type})${title}\\n`;
            }
          }
          
          if (result.cells_affected && !result.find_text && !result.data) {
            // Only show general cells_affected if not already covered by specific operations
            const operation = result.operation;
            if (operation === 'write') {
              llmContent += ` ${result.cells_affected} cells written with data.`;
            } else if (operation === 'format') {
              llmContent += ` Formatting applied to ${result.cells_affected} cells.`;
            } else if (operation === 'clear') {
              llmContent += ` ${result.cells_affected} cells cleared.`;
            } else {
              llmContent += ` ${result.cells_affected} cells affected.`;
            }
          }
          
          if (result.books) {
            llmContent += ` Found ${result.books.length} open workbooks: ${result.books.join(', ')}.`;
          }
          
          if (result.sheets) {
            llmContent += ` Found ${result.sheets.length} worksheets: ${result.sheets.join(', ')}.`;
          }
          
          if (result.file_created) {
            llmContent += ` New workbook created at: ${result.file_path}. File is locked by Excel/xlwings - use close_workbook to release the lock.`;
          }
          
          if (result.file_opened) {
            llmContent += ` Workbook opened from: ${result.file_path}. File is now locked by Excel/xlwings - use close_workbook to release the lock.`;
          }
          
          if (result.file_saved) {
            llmContent += ` Workbook saved to: ${result.file_path}.`;
          }
          
          if (result.file_closed) {
            llmContent += ` Workbook closed successfully. File lock released for other tools to access.`;
          }
          
          if (result.last_row) {
            llmContent += ` Last row with data in column ${result.column} is row ${result.last_row}.`;
          }
          
          if (result.used_range) {
            llmContent += ` Used range is ${result.used_range} (${result.last_row} rows, ${result.last_column} columns).`;
          }
          
          if (result.selection) {
            llmContent += ` Current selection is ${result.selection}.`;
          }
          
          if (result.formula) {
            llmContent += ` Formula set: ${result.formula} in range ${result.range}.`;
          }
          
          if (result.find_text && result.replace_text) {
            llmContent += ` Find & Replace: "${result.find_text}" → "${result.replace_text}" (${result.cells_affected || 0} cells changed).`;
          }
          
          if (result.source_range && result.destination_range) {
            const copyMode = result.values_only ? 'values only' : 'full content';
            const sourceInfo = result.source_worksheet ? `${result.source_worksheet}!${result.source_range.split('!').pop()}` : result.source_range;
            const destInfo = result.destination_worksheet ? `${result.destination_worksheet}!${result.destination_range.split('!').pop()}` : result.destination_range;
            
            if (result.cut_mode) {
              llmContent += ` Cut ${copyMode} from ${sourceInfo} to ${destInfo}`;
              if (result.cut_method) {
                llmContent += ` (${result.cut_method})`;
              }
            } else {
              llmContent += ` Copied ${copyMode} from ${sourceInfo} to ${destInfo}`;
            }
            
            if (result.source_worksheet !== result.destination_worksheet) {
              llmContent += result.cut_mode ? ' (cross-worksheet cut)' : ' (cross-worksheet copy)';
            }
            if (result.copy_method) {
              const methodMap = {
                'values': 'values only',
                'xlwings_copy': 'xlwings method', 
                'com_api': 'Excel COM API',
                'xlwings_fallback': 'xlwings fallback',
                'values_fallback': 'values fallback (format copy failed)',
                'emergency_fallback': 'emergency values fallback'
              };
              const methodDesc = methodMap[result.copy_method as keyof typeof methodMap] || result.copy_method;
              llmContent += ` using ${methodDesc}`;
            }
            llmContent += '.';
          }
          
          if (result.new_sheet_name) {
            llmContent += ` New worksheet "${result.new_sheet_name}" added.`;
          }
          
          if (result.total_cells && result.converted_cells !== undefined) {
            llmContent += ` Data type conversion completed: ${result.converted_cells} out of ${result.total_cells} cells converted to proper numeric types.`;
          }
          
          if (result.module_name && result.action) {
            llmContent += ` VBA module "${result.module_name}" ${result.action} with ${result.code_lines} lines of code.`;
          }
          
          if (result.macro_name && result.operation === 'run_vba_macro') {
            const macroResult = result.macro_result !== null ? ` Result: ${result.macro_result}` : '';
            llmContent += ` VBA macro "${result.macro_name}" executed successfully.${macroResult}`;
          }
          
          if (result.modules && result.total_modules !== undefined) {
            llmContent += ` Found ${result.total_modules} VBA modules:\\n`;
            for (const module of result.modules) {
              llmContent += ` - ${module.name} (${module.code_lines} lines)\\n`;
            }
          }
          
          if (result.deleted && result.module_name) {
            llmContent += ` VBA module "${result.module_name}" deleted successfully.`;
          }
          
          // Image operation results
          if (result.image_name && result.operation === 'insert_image') {
            const position = result.position ? ` at position ${result.position}` : '';
            llmContent += ` Image "${result.image_name}" inserted successfully${position} from ${result.image_path}.`;
          }
          
          if (result.images && Array.isArray(result.images)) {
            llmContent += ` Found ${result.total_images} images in ${result.worksheet}:\n`;
            for (const image of result.images) {
              const size = image.width && image.height ? ` (${image.width}×${image.height})` : '';
              const position = image.left !== undefined && image.top !== undefined ? ` at (${image.left}, ${image.top})` : '';
              llmContent += ` - ${image.name}${size}${position}\n`;
            }
          }
          
          if (result.image_deleted) {
            llmContent += ` Image "${result.image_name}" deleted successfully.`;
          }
          
          if (result.operation === 'resize_image' && result.image_name) {
            const originalSize = result.original_width && result.original_height ? 
              ` Original size: ${result.original_width}×${result.original_height}.` : '';
            const newSize = result.new_width && result.new_height ? 
              ` New size: ${result.new_width}×${result.new_height}.` : '';
            llmContent += ` Image "${result.image_name}" resized successfully.${originalSize}${newSize}`;
          }
          
          if (result.operation === 'move_image' && result.image_name) {
            const originalPos = result.original_left !== undefined && result.original_top !== undefined ? 
              ` Original position: (${result.original_left}, ${result.original_top}).` : '';
            const newPos = result.new_position ? ` New position: ${result.new_position}.` : '';
            llmContent += ` Image "${result.image_name}" moved successfully.${originalPos}${newPos}`;
          }
          
          if (result.operation === 'save_range_as_image' && result.file_created) {
            const fileSize = result.file_size ? ` (${(result.file_size / 1024).toFixed(1)} KB)` : '';
            llmContent += ` Range ${result.range} saved as image to ${result.output_path}${fileSize}.`;
          }
          
          if (result.operation === 'save_chart_as_image' && result.file_created) {
            const fileSize = result.file_size ? ` (${(result.file_size / 1024).toFixed(1)} KB)` : '';
            llmContent += ` Chart "${result.chart_name}" saved as image to ${result.output_path}${fileSize}.`;
          }
          
          // Search operation results
          if (result.operation === 'search_data') {
            llmContent += ` Search for "${result.search_term}" completed.`;
            if (result.total_matches === 0) {
              llmContent += ` No matches found.`;
            } else if (result.total_matches === 1) {
              const match = result.matches[0];
              llmContent += ` Found 1 match in worksheet "${match.worksheet}" at ${match.address}.`;
              if (result.auto_selected) {
                llmContent += ` Automatically switched to worksheet and selected the cell.`;
              }
              llmContent += `\n\n**Match Details:**\n`;
              llmContent += `- Location: ${match.worksheet}!${match.address}\n`;
              llmContent += `- Column: ${match.column_name}\n`;
              llmContent += `- Matched ${match.match_type}: ${match.matched_value}\n`;
              if (match.matched_formula) {
                llmContent += `- Formula: ${match.matched_formula}\n`;
              }
              llmContent += `\n**Complete Row Data:**\n`;
              for (const [key, value] of Object.entries(match.row_data)) {
                llmContent += `- ${key}: ${value}\n`;
              }
            } else {
              llmContent += ` Found ${result.total_matches} matches:`;
              for (const match of result.matches.slice(0, 10)) { // Show first 10 matches
                llmContent += `\n- ${match.worksheet}!${match.address} (${match.column_name}): ${match.matched_value}`;
              }
              if (result.total_matches > 10) {
                llmContent += `\n... and ${result.total_matches - 10} more matches.`;
              }
            }
          }
          
          // List apps operation results
          if (result.operation === 'list_apps') {
            if (result.total_apps === 0) {
              llmContent += ` No Excel applications currently running.`;
            } else {
              llmContent += ` Found ${result.total_apps} Excel application(s):\n`;
              for (const app of result.apps) {
                const activeIndicator = app.is_active ? ' [ACTIVE]' : '';
                const pidInfo = app.pid ? ` (PID: ${app.pid})` : '';
                const visibleInfo = app.visible !== null ? ` - ${app.visible ? 'Visible' : 'Hidden'}` : '';
                llmContent += `\n**App ${app.index}${activeIndicator}**${pidInfo}${visibleInfo}\n`;
                
                if (app.error) {
                  llmContent += `- Error: ${app.error}\n`;
                } else {
                  llmContent += `- ${app.books_count} workbook(s) open:\n`;
                  for (const book of app.books || []) {
                    const savedStatus = book.saved !== null ? (book.saved ? ' ✓' : ' *') : '';
                    llmContent += `  - ${book.name}${savedStatus} (${book.sheets_count} sheets)\n`;
                    if (book.full_name && book.full_name !== book.name) {
                      llmContent += `    Path: ${book.full_name}\n`;
                    }
                  }
                }
              }
              
              if (result.active_app_index !== null) {
                llmContent += `\n**Current active app:** Index ${result.active_app_index}`;
              }
            }
          }
          
          // Row/Column insertion/deletion results
          if (result.operation === 'insert_row' && result.rows_inserted) {
            llmContent += ` ${result.rows_inserted} row(s) inserted at position ${result.position}.`;
          }
          
          if (result.operation === 'insert_column' && result.columns_inserted) {
            llmContent += ` ${result.columns_inserted} column(s) inserted at position ${result.position}.`;
          }
          
          if (result.operation === 'delete_row' && result.rows_deleted) {
            llmContent += ` ${result.rows_deleted} row(s) deleted starting from position ${result.position}.`;
          }
          
          if (result.operation === 'delete_column' && result.columns_deleted) {
            llmContent += ` ${result.columns_deleted} column(s) deleted starting from position ${result.position}.`;
          }
        } else {
          let errorMessage = result.xlwings_error || 'Unknown error';
          // Enhanced error messages for common file locking issues
          if (errorMessage.toLowerCase().includes('permission') || 
              errorMessage.toLowerCase().includes('sharing violation') ||
              errorMessage.toLowerCase().includes('file is already open') ||
              errorMessage.toLowerCase().includes('access denied')) {
            errorMessage += '. This file may be locked by Excel/xlwings or another application. Try using xlwings close_workbook operation to release the lock, or close Excel manually.';
          }
          llmContent += `failed: ${errorMessage}`;
        }

        return {
          ...result,
          llmContent,
          returnDisplay: result.success 
            ? `✅ ${llmContent}` 
            : `❌ ${llmContent}`,
        };
      }
      
      // Fallback: parse non-JSON output
      return {
        success: !pythonOutput.toLowerCase().includes('error'),
        operation: params.op,
        llmContent: `Excel operation output: ${pythonOutput}`,
        returnDisplay: pythonOutput,
      };
      
    } catch (error) {
      return {
        success: false,
        operation: params.op,
        xlwings_error: `Failed to parse Python output: ${error}`,
        llmContent: `Failed to parse Excel operation result: ${error}`,
        returnDisplay: `❌ Failed to parse Excel operation result`,
      };
    }
  }

  private buildPythonScript(params: XlwingsParams): string {
    const imports = [
      'import json',
      'import sys', 
      'import os',
      'from datetime import datetime',
      '',
      'try:',
      '    import xlwings as xw',
      'except ImportError:',
      '    print(json.dumps({"success": False, "operation": "' + params.op + '", "xlwings_error": "xlwings library is not installed. Please install it using: pip install xlwings"}))',
      '    sys.exit(1)',
    ];

    const functions = [
      `
def column_number_to_letter(col_num):
    """Convert column number to Excel column letter (1-based)"""
    if col_num <= 0:
        return ''
    result = ''
    while col_num > 0:
        col_num -= 1
        result = chr(65 + (col_num % 26)) + result
        col_num //= 26
    return result

def safe_convert_data(data):
    """Convert data to JSON-serializable format while preserving data types"""
    if data is None:
        return None
    elif isinstance(data, (list, tuple)):
        return [safe_convert_data(item) for item in data]
    elif hasattr(data, 'value'):  # xlwings Range object
        return safe_convert_data(data.value)
    elif isinstance(data, datetime):
        return data.isoformat()
    elif isinstance(data, (int, float)):
        # Preserve numeric types
        return data
    elif isinstance(data, bool):
        # Preserve boolean type
        return data
    elif isinstance(data, str):
        # Try to convert string numbers back to numeric types if they're pure numbers
        if data.strip() == '':
            return ''
        try:
            # Check if it's an integer
            if data.strip().lstrip('-+').isdigit():
                return int(data)
            # Check if it's a float
            elif data.replace('.', '').replace('-', '').replace('+', '').replace('e', '').replace('E', '').isdigit():
                return float(data)
            else:
                return data
        except (ValueError, AttributeError):
            return data
    else:
        try:
            # Try to identify the actual data type
            if hasattr(data, '__float__') and not isinstance(data, str):
                float_val = float(data)
                # Check if it's actually an integer
                if float_val.is_integer():
                    return int(float_val)
                return float_val
            elif hasattr(data, '__int__') and not isinstance(data, str):
                return int(data)
            else:
                return str(data)
        except (ValueError, TypeError):
            return str(data)

def get_excel_app(app_id=None):
    """Get Excel application by ID or return active app"""
    try:
        if app_id is not None:
            # Try to get app by PID first
            for app in xw.apps:
                if hasattr(app, 'pid') and app.pid == app_id:
                    return app
            # If not found by PID, try by index (0-based)
            if isinstance(app_id, int) and 0 <= app_id < len(xw.apps):
                return list(xw.apps)[app_id]
        # Return active app if no ID specified or ID not found
        return xw.apps.active if xw.apps else None
    except:
        return xw.apps.active if xw.apps else None

def get_workbook(workbook_name=None, app=None):
    """Get workbook by name from specific app or return active workbook"""
    try:
        if app is None:
            app = xw.apps.active
        if workbook_name:
            # Search in the specific app's books
            for book in app.books:
                if book.name == workbook_name:
                    return book
            return None
        else:
            return app.books.active if app.books else None
    except:
        return None

def get_worksheet(wb, worksheet_name=None):
    """Get worksheet by name or return active worksheet"""
    try:
        if worksheet_name:
            return wb.sheets[worksheet_name]
        else:
            return wb.sheets.active
    except:
        return None
`,
    ];

    const mainLogic = this.generateMainLogic(params);

    return [
      ...imports,
      ...functions,
      'def main():',
      '    try:',
      ...mainLogic.split('\n').map(line => `        ${line}`),
      '    except Exception as e:',
      '        result = {',
      `            "success": False,`,
      `            "operation": "${params.op}",`,
      '            "xlwings_error": str(e)',
      '        }',
      '        print(json.dumps(result))',
      '',
      'if __name__ == "__main__":',
      '    main()',
    ].join('\n');
  }

  private generateMainLogic(params: XlwingsParams): string {
    const { op } = params;
    
    switch (op) {
      case 'read':
        return this.generateReadLogic(params);
      case 'write':
        return this.generateWriteLogic(params);
      case 'create_chart':
        return this.generateChartLogic(params);
      case 'update_chart':
        return this.generateUpdateChartLogic(params);
      case 'delete_chart':
        return this.generateDeleteChartLogic(params);
      case 'list_charts':
        return this.generateListChartsLogic(params);
      case 'format':
        return this.generateFormatLogic(params);
      case 'add_sheet':
        return this.generateAddSheetLogic(params);
      case 'list_books':
        return this.generateListBooksLogic();
      case 'list_sheets':
        return this.generateListSheetsLogic(params);
      case 'get_selection':
        return this.generateGetSelectionLogic();
      case 'set_selection':
        return this.generateSetSelectionLogic(params);
      case 'formula':
        return this.generateFormulaLogic(params);
      case 'clear':
        return this.generateClearLogic(params);
      case 'copy_paste':
        return this.generateCopyPasteLogic(params);
      case 'find_replace':
        return this.generateFindReplaceLogic(params);
      case 'create_workbook':
        return this.generateCreateWorkbookLogic(params);
      case 'open_workbook':
        return this.generateOpenWorkbookLogic(params);
      case 'save_workbook':
        return this.generateSaveWorkbookLogic(params);
      case 'close_workbook':
        return this.generateCloseWorkbookLogic(params);
      case 'get_last_row':
        return this.generateGetLastRowLogic(params);
      case 'get_used_range':
        return this.generateGetUsedRangeLogic(params);
      case 'convert_data_types':
        return this.generateConvertDataTypesLogic(params);
      case 'add_vba_module':
        return this.generateAddVbaModuleLogic(params);
      case 'run_vba_macro':
        return this.generateRunVbaMacroLogic(params);
      case 'update_vba_code':
        return this.generateUpdateVbaCodeLogic(params);
      case 'list_vba_modules':
        return this.generateListVbaModulesLogic(params);
      case 'delete_vba_module':
        return this.generateDeleteVbaModuleLogic(params);
      case 'insert_image':
        return this.generateInsertImageLogic(params);
      case 'list_images':
        return this.generateListImagesLogic(params);
      case 'delete_image':
        return this.generateDeleteImageLogic(params);
      case 'resize_image':
        return this.generateResizeImageLogic(params);
      case 'move_image':
        return this.generateMoveImageLogic(params);
      case 'save_range_as_image':
        return this.generateSaveRangeAsImageLogic(params);
      case 'save_chart_as_image':
        return this.generateSaveChartAsImageLogic(params);
      case 'search_data':
        return this.generateSearchDataLogic(params);
      case 'list_apps':
        return this.generateListAppsLogic(params);
      case 'insert_row':
        return this.generateInsertRowLogic(params);
      case 'insert_column':
        return this.generateInsertColumnLogic(params);
      case 'delete_row':
        return this.generateDeleteRowLogic(params);
      case 'delete_column':
        return this.generateDeleteColumnLogic(params);
      default:
        return 'raise ValueError(f"Unsupported operation: {op}")';
    }
  }

  private generateExcelConnectionCode(params: XlwingsParams): string {
    const appId = params.app_id;
    return `
# Connect to Excel
app = get_excel_app(${appId || 'None'})
if not app:
    raise Exception("No Excel application found. Please open Excel first.")

wb = get_workbook("${params.workbook || ''}", app)
if not wb:
    wb = app.books.active if app.books else None
    if not wb:
        raise Exception("No active workbook found in the Excel application")`;
  }

  private generateReadLogic(params: XlwingsParams): string {
    const maxRows = params.max_rows || 100;
    const startRow = params.start_row || 1;
    const summaryMode = params.summary_mode || false;
    
    return `${this.generateExcelConnectionCode(params)}

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    ws = wb.sheets.active

# First, determine the full data range to get total statistics
range_str = "${params.range || ''}"
if range_str:
    if ':' in range_str and range_str.count(':') == 1 and not any(c.isdigit() for c in range_str):
        # Full column range like A:A
        col = range_str.split(':')[0]
        try:
            total_last_row = ws.range(f"{col}1048576").end('up').row
            full_range_obj = ws.range(f"{col}1:{col}{total_last_row}")
        except:
            total_last_row = 1
            full_range_obj = ws.range(f"{col}1")
    elif ':' in range_str and all(c.isdigit() or c == ':' for c in range_str):
        # Full row range like 1:1
        row = range_str.split(':')[0]
        try:
            last_col = ws.range(f"XFD{row}").end('left').column
            col_letter = column_number_to_letter(last_col)
            full_range_obj = ws.range(f"A{row}:{col_letter}{row}")
            total_last_row = int(row)
        except:
            full_range_obj = ws.range(f"A{row}:Z{row}")
            total_last_row = int(row)
    else:
        # Normal range
        full_range_obj = ws.range(range_str)
        total_last_row = full_range_obj.last_cell.row
else:
    # Use current region of active cell or A1
    try:
        full_range_obj = ws.range('A1').current_region
        total_last_row = full_range_obj.last_cell.row
    except:
        full_range_obj = ws.range('A1')
        total_last_row = 1

# Calculate total data statistics
total_rows = full_range_obj.rows.count if hasattr(full_range_obj, 'rows') else 1
total_cols = full_range_obj.columns.count if hasattr(full_range_obj, 'columns') else 1
total_cells = total_rows * total_cols

# Determine reading strategy
start_row_actual = max(${startRow}, 1)
end_row_actual = min(start_row_actual + ${maxRows} - 1, total_last_row)
rows_to_read = end_row_actual - start_row_actual + 1

# Build the actual reading range
if range_str and ':' not in range_str:
    # Single cell
    read_range_obj = ws.range(range_str)
    actual_range = range_str
elif range_str and ':' in range_str and range_str.count(':') == 1 and not any(c.isdigit() for c in range_str):
    # Full column
    col = range_str.split(':')[0]
    actual_range = f"{col}{start_row_actual}:{col}{end_row_actual}"
    read_range_obj = ws.range(actual_range)
elif range_str and ':' in range_str and all(c.isdigit() or c == ':' for c in range_str):
    # Full row - read specified row only
    read_range_obj = full_range_obj
    actual_range = full_range_obj.address
else:
    # Build range based on original range but with row limits
    start_col = full_range_obj.column
    end_col = full_range_obj.last_cell.column
    start_col_letter = column_number_to_letter(start_col)
    end_col_letter = column_number_to_letter(end_col)
    actual_range = f"{start_col_letter}{start_row_actual}:{end_col_letter}{end_row_actual}"
    read_range_obj = ws.range(actual_range)

# Read the data
raw_data = read_range_obj.value
data = safe_convert_data(raw_data)

# Prepare progress information
progress_info = {
    "total_rows": total_rows,
    "total_columns": total_cols,
    "total_cells": total_cells,
    "rows_read": rows_to_read,
    "start_row": start_row_actual,
    "end_row": end_row_actual,
    "has_more_data": end_row_actual < total_last_row,
    "remaining_rows": max(0, total_last_row - end_row_actual),
    "completion_percentage": round((end_row_actual / total_last_row * 100), 1) if total_last_row > 0 else 100
}

# Provide data summary if in summary mode or if dataset is large
data_summary = None
if ${summaryMode} or total_rows > ${maxRows * 2}:
    if isinstance(data, list):
        if len(data) > 0 and isinstance(data[0], list):
            # 2D data
            data_summary = {
                "sample_rows": data[:3] if len(data) >= 3 else data,
                "data_types": [type(cell).__name__ for cell in data[0]] if len(data) > 0 else [],
                "row_count": len(data),
                "column_count": len(data[0]) if len(data) > 0 else 0
            }
        else:
            # 1D data
            data_summary = {
                "sample_values": data[:10] if len(data) >= 10 else data,
                "data_type": type(data[0]).__name__ if len(data) > 0 else "empty",
                "value_count": len(data)
            }

result = {
    "success": True,
    "operation": "read",
    "workbook": wb.name,
    "worksheet": ws.name,
    "range": actual_range,
    "full_range": full_range_obj.address,
    "data": data if not ${summaryMode} or total_rows <= ${maxRows * 2} else None,
    "data_summary": data_summary,
    "progress": progress_info,
    "message": f"Read {rows_to_read} rows (rows {start_row_actual}-{end_row_actual}) out of {total_rows} total rows. {progress_info['remaining_rows']} rows remaining." if progress_info['has_more_data'] else f"Read all {rows_to_read} rows of data."
}
print(json.dumps(result))`;
  }

  private generateWriteLogic(params: XlwingsParams): string {
    return `
# Connect to Excel
app = xw.apps.active if xw.apps else None
if not app:
    raise Exception("No active Excel application found. Please open Excel first.")

wb = get_workbook("${params.workbook || ''}")
if not wb:
    raise Exception("Could not find the specified workbook")

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    raise Exception("Could not find the specified worksheet")

# Write data
data = ${JSON.stringify(params.data || [])}
range_str = "${params.range || 'A1'}"

if data:
    # Get the target range dimensions
    range_obj = ws.range(range_str)
    rows_count = range_obj.rows.count
    cols_count = range_obj.columns.count
    
    # Prepare data to fill the entire range
    if isinstance(data, list):
        # Check if data is 2D or 1D
        if len(data) > 0 and isinstance(data[0], list):
            # 2D data - expand to fill the range
            target_data = []
            for row in range(rows_count):
                target_row = []
                for col in range(cols_count):
                    if row < len(data) and col < len(data[row]):
                        target_row.append(data[row][col])
                    elif row < len(data) and len(data[row]) > 0:
                        # Repeat last value in row if row exists but is shorter
                        target_row.append(data[row][-1])
                    elif len(data) > 0 and isinstance(data[0], list) and len(data[0]) > 0:
                        # Use first row's data if we run out of rows
                        target_row.append(data[0][col % len(data[0])])
                    else:
                        target_row.append("")
                target_data.append(target_row)
        else:
            # 1D data - expand to fill the range
            target_data = []
            for row in range(rows_count):
                target_row = []
                for col in range(cols_count):
                    if len(data) == 1:
                        # Single value - fill entire range with same value
                        target_row.append(data[0])
                    elif row < len(data):
                        # Use corresponding data element
                        target_row.append(data[row])
                    elif len(data) > 0:
                        # Repeat last value if we run out of data
                        target_row.append(data[-1])
                    else:
                        target_row.append("")
                target_data.append(target_row)
    else:
        # Single value - fill entire range
        target_data = [[data] * cols_count for _ in range(rows_count)]
    
    # Write the expanded data to the range
    ws.range(range_str).value = target_data
    cells_count = rows_count * cols_count
else:
    cells_count = 0

result = {
    "success": True,
    "operation": "write",
    "workbook": wb.name,
    "worksheet": ws.name,
    "range": range_str,
    "cells_affected": cells_count,
    "data_expanded": True if data else False
}
print(json.dumps(result))`;
  }

  private generateChartLogic(params: XlwingsParams): string {
    const chartConfig = params.chart;
    if (!chartConfig) {
      return 'raise ValueError("Chart configuration is required for create_chart operation")';
    }

    return `
# Connect to Excel
app = xw.apps.active if xw.apps else None
if not app:
    raise Exception("No active Excel application found. Please open Excel first.")

wb = get_workbook("${params.workbook || ''}")
if not wb:
    raise Exception("Could not find the specified workbook")

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    raise Exception("Could not find the specified worksheet")

# Create chart
chart_type = "${chartConfig.type || 'column'}"
data_range = "${chartConfig.data_range || 'A1:B10'}"
position = "${chartConfig.position || 'D1'}"
chart_name = "${params.chart_name || ''}"

chart = ws.charts.add()
chart.set_source_data(ws.range(data_range))

# Set chart type mapping
chart_types = {
    'column': 'column_clustered',
    'line': 'line',
    'bar': 'bar_clustered', 
    'pie': 'pie',
    'scatter': 'xy_scatter',
    'area': 'area'
}
chart.chart_type = chart_types.get(chart_type, 'column_clustered')

# Set chart position
chart.left = ws.range(position).left
chart.top = ws.range(position).top

# Set chart name if provided, or generate one
if chart_name:
    try:
        chart.name = chart_name
        final_chart_name = chart_name
    except:
        # Name might be taken, use default
        final_chart_name = chart.name
else:
    final_chart_name = chart.name

# Set chart properties using Excel API
try:
    if "${chartConfig.title || ''}":
        # Use the Excel API directly for chart title
        chart.api.ChartTitle.Text = "${chartConfig.title}"
        chart.api.HasTitle = True
    
    # Set axis titles if provided
    if "${chartConfig.x_axis_title || ''}":
        chart.api.Axes(1).HasTitle = True
        chart.api.Axes(1).AxisTitle.Text = "${chartConfig.x_axis_title}"
    
    if "${chartConfig.y_axis_title || ''}":
        chart.api.Axes(2).HasTitle = True  
        chart.api.Axes(2).AxisTitle.Text = "${chartConfig.y_axis_title}"
except Exception as title_error:
    # Continue even if title setting fails
    pass

result = {
    "success": True,
    "operation": "create_chart",
    "workbook": wb.name,
    "worksheet": ws.name,
    "chart_created": True,
    "chart_name": final_chart_name,
    "chart_type": chart_type,
    "position": position
}
print(json.dumps(result))`;
  }

  private generateFormatLogic(params: XlwingsParams): string {
    return `
# Connect to Excel
app = xw.apps.active if xw.apps else None
if not app:
    raise Exception("No active Excel application found. Please open Excel first.")

wb = get_workbook("${params.workbook || ''}")
if not wb:
    raise Exception("Could not find the specified workbook")

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    raise Exception("Could not find the specified worksheet")

# Apply formatting
range_str = "${params.range || 'A1'}"
range_obj = ws.range(range_str)

format_config = ${JSON.stringify(params.format || {})}

if format_config.get('font'):
    font = format_config['font']
    if font.get('bold'):
        range_obj.font.bold = font['bold']
    if font.get('italic'):
        range_obj.font.italic = font['italic']
    if font.get('size'):
        range_obj.font.size = font['size']
    if font.get('color'):
        range_obj.font.color = font['color']

if format_config.get('fill', {}).get('color'):
    range_obj.color = format_config['fill']['color']

if format_config.get('number_format'):
    range_obj.number_format = format_config['number_format']

cells_affected = range_obj.rows.count * range_obj.columns.count

result = {
    "success": True,
    "operation": "format",
    "workbook": wb.name,
    "worksheet": ws.name,
    "range": range_str,
    "cells_affected": cells_affected
}
print(json.dumps(result))`;
  }

  private generateListBooksLogic(): string {
    return `
# List all open workbooks
books = [book.name for book in xw.books]

result = {
    "success": True,
    "operation": "list_books",
    "books": books
}
print(json.dumps(result))`;
  }

  private generateListSheetsLogic(params: XlwingsParams): string {
    return `
# Connect to Excel
app = xw.apps.active if xw.apps else None
if not app:
    raise Exception("No active Excel application found. Please open Excel first.")

wb = get_workbook("${params.workbook || ''}")
if not wb:
    raise Exception("Could not find the specified workbook")

sheets = [sheet.name for sheet in wb.sheets]

result = {
    "success": True,
    "operation": "list_sheets",
    "workbook": wb.name,
    "sheets": sheets
}
print(json.dumps(result))`;
  }

  private generateGetSelectionLogic(): string {
    return `
# Get current selection
app = xw.apps.active if xw.apps else None
if not app:
    raise Exception("No active Excel application found. Please open Excel first.")

selection = app.selection
wb = xw.books.active
ws = wb.sheets.active

result = {
    "success": True,
    "operation": "get_selection",
    "workbook": wb.name,
    "worksheet": ws.name,
    "selection": selection.address
}
print(json.dumps(result))`;
  }

  private generateSetSelectionLogic(params: XlwingsParams): string {
    return `
# Set selection
app = xw.apps.active if xw.apps else None
if not app:
    raise Exception("No active Excel application found. Please open Excel first.")

wb = get_workbook("${params.workbook || ''}")
if not wb:
    wb = xw.books.active

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    ws = wb.sheets.active

range_str = "${params.range || 'A1'}"
ws.range(range_str).select()

result = {
    "success": True,
    "operation": "set_selection",
    "workbook": wb.name,
    "worksheet": ws.name,
    "selection": range_str
}
print(json.dumps(result))`;
  }

  private generateFormulaLogic(params: XlwingsParams): string {
    return `
# Set formula
app = xw.apps.active if xw.apps else None
if not app:
    raise Exception("No active Excel application found. Please open Excel first.")

wb = get_workbook("${params.workbook || ''}")
if not wb:
    raise Exception("Could not find the specified workbook")

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    raise Exception("Could not find the specified worksheet")

range_str = "${params.range || 'A1'}"
formula = "${params.formula || ''}"

if not formula:
    raise ValueError("Formula is required for formula operation")

ws.range(range_str).formula = formula

result = {
    "success": True,
    "operation": "formula",
    "workbook": wb.name,
    "worksheet": ws.name,
    "range": range_str,
    "formula": formula
}
print(json.dumps(result))`;
  }

  private generateClearLogic(params: XlwingsParams): string {
    return `
# Clear range
app = xw.apps.active if xw.apps else None
if not app:
    raise Exception("No active Excel application found. Please open Excel first.")

wb = get_workbook("${params.workbook || ''}")
if not wb:
    raise Exception("Could not find the specified workbook")

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    raise Exception("Could not find the specified worksheet")

range_str = "${params.range || 'A1'}"
range_obj = ws.range(range_str)
range_obj.clear()

cells_affected = range_obj.rows.count * range_obj.columns.count

result = {
    "success": True,
    "operation": "clear",
    "workbook": wb.name,
    "worksheet": ws.name,
    "range": range_str,
    "cells_affected": cells_affected
}
print(json.dumps(result))`;
  }

  private generateCopyPasteLogic(params: XlwingsParams): string {
    if (!params.copy_paste) {
      return 'raise ValueError("Copy/paste configuration is required")';
    }

    const valuesOnly = params.copy_paste.values_only || false;
    const cutMode = params.copy_paste.cut_mode || false;
    const valuesOnlyPython = valuesOnly ? 'True' : 'False';
    const cutModePython = cutMode ? 'True' : 'False';

    return `${this.generateExcelConnectionCode(params)}

source_range = "${params.copy_paste.source_range}"
dest_range = "${params.copy_paste.destination_range}"
values_only = ${valuesOnlyPython}
cut_mode = ${cutModePython}

# Parse source range to handle cross-worksheet references
try:
    if '!' in source_range:
        # Cross-worksheet reference like "Sheet1!A1:H1"
        source_sheet_name, source_cell_range = source_range.split('!', 1)
        try:
            source_ws = wb.sheets[source_sheet_name]
        except KeyError:
            raise Exception(f"Source worksheet '{source_sheet_name}' not found. Available sheets: {[sheet.name for sheet in wb.sheets]}")
        source = source_ws.range(source_cell_range)
    else:
        # Same worksheet reference
        ws = get_worksheet(wb, "${params.worksheet || ''}")
        if not ws:
            ws = wb.sheets.active
        source = ws.range(source_range)
except Exception as source_error:
    raise Exception(f"Error accessing source range '{source_range}': {str(source_error)}")

# Parse destination range to handle cross-worksheet references
try:
    if '!' in dest_range:
        # Cross-worksheet reference like "Sheet2!A1"
        dest_sheet_name, dest_cell_range = dest_range.split('!', 1)
        try:
            dest_ws = wb.sheets[dest_sheet_name]
        except KeyError:
            raise Exception(f"Destination worksheet '{dest_sheet_name}' not found. Available sheets: {[sheet.name for sheet in wb.sheets]}")
        dest = dest_ws.range(dest_cell_range)
    else:
        # Same worksheet reference - use target worksheet or active
        dest_ws = get_worksheet(wb, "${params.worksheet || ''}")
        if not dest_ws:
            dest_ws = wb.sheets.active
        dest = dest_ws.range(dest_range)
except Exception as dest_error:
    raise Exception(f"Error accessing destination range '{dest_range}': {str(dest_error)}")

# Perform copy/paste operation - use simple xlwings copy method
if values_only:
    dest.value = source.value
else:
    source.copy(dest)

# If cut_mode is enabled, clear/delete the source after copying
if cut_mode:
    try:
        # Check if we're dealing with entire rows or columns for more efficient deletion
        if ':' in source_range and source_range.count(':') == 1:
            range_parts = source_range.split(':')
            start_part = range_parts[0].strip()
            end_part = range_parts[1].strip()
            
            # Check if it's a full row range (like "2:2" or "2:5")
            if start_part.isdigit() and end_part.isdigit():
                # Full row range - use row deletion
                start_row = int(start_part)
                end_row = int(end_part)
                row_count = end_row - start_row + 1
                source.sheet.api.Rows(f"{start_row}:{end_row}").Delete()
                cut_method = f"deleted {row_count} row(s)"
            # Check if it's a full column range (like "A:A" or "A:C")
            elif start_part.isalpha() and end_part.isalpha() and len(start_part) <= 3 and len(end_part) <= 3:
                # Full column range - use column deletion
                source.sheet.api.Columns(f"{start_part.upper()}:{end_part.upper()}").Delete()
                cut_method = f"deleted column(s) {start_part.upper()}:{end_part.upper()}"
            else:
                # Regular cell range - just clear the content
                source.clear()
                cut_method = "cleared source range"
        else:
            # Single cell or irregular range - just clear
            source.clear()
            cut_method = "cleared source range"
    except Exception as cut_error:
        # If deletion fails, at least try to clear the content
        try:
            source.clear()
            cut_method = "cleared source range (deletion failed)"
        except:
            cut_method = "cut operation failed"
else:
    cut_method = None

# Get worksheet names for result
source_ws_name = source.sheet.name
dest_ws_name = dest.sheet.name

result = {
    "success": True,
    "operation": "copy_paste",
    "workbook": wb.name,
    "source_worksheet": source_ws_name,
    "destination_worksheet": dest_ws_name,
    "source_range": source_range,
    "destination_range": dest_range,
    "values_only": values_only,
    "cut_mode": cut_mode,
    "cut_method": cut_method,
    "cells_affected": source.rows.count * source.columns.count
}
print(json.dumps(result))`;
  }

  private generateFindReplaceLogic(params: XlwingsParams): string {
    if (!params.search) {
      return 'raise ValueError("Search configuration is required")';
    }

    return `
# Find and replace
app = xw.apps.active if xw.apps else None
if not app:
    raise Exception("No active Excel application found. Please open Excel first.")

wb = get_workbook("${params.workbook || ''}")
if not wb:
    raise Exception("Could not find the specified workbook")

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    raise Exception("Could not find the specified worksheet")

find_text = "${params.search.find}"
replace_text = "${params.search.replace}"
range_str = "${params.range || ''}"

if range_str:
    search_range = ws.range(range_str)
else:
    search_range = ws.used_range

# Use Excel's built-in find/replace
# This is a simplified version - xlwings doesn't directly expose Find/Replace
# We'll iterate through cells (not optimal for large ranges)
cells_changed = 0
for cell in search_range:
    if cell.value and str(cell.value) == find_text:
        cell.value = replace_text
        cells_changed += 1

result = {
    "success": True,
    "operation": "find_replace",
    "workbook": wb.name,
    "worksheet": ws.name,
    "find_text": find_text,
    "replace_text": replace_text,
    "cells_affected": cells_changed
}
print(json.dumps(result))`;
  }

  private generateAddSheetLogic(params: XlwingsParams): string {
    return `
# Add new sheet
app = xw.apps.active if xw.apps else None
if not app:
    raise Exception("No active Excel application found. Please open Excel first.")

wb = get_workbook("${params.workbook || ''}")
if not wb:
    raise Exception("Could not find the specified workbook")

sheet_name = "${params.new_sheet_name || 'NewSheet'}"

# Check if sheet already exists
existing_names = [sheet.name for sheet in wb.sheets]
if sheet_name in existing_names:
    # Generate unique name
    counter = 1
    while f"{sheet_name}_{counter}" in existing_names:
        counter += 1
    sheet_name = f"{sheet_name}_{counter}"

new_sheet = wb.sheets.add(sheet_name)

result = {
    "success": True,
    "operation": "add_sheet",
    "workbook": wb.name,
    "new_sheet_name": sheet_name
}
print(json.dumps(result))`;
  }

  private generateCreateWorkbookLogic(params: XlwingsParams): string {
    const visible = params.visible !== undefined ? params.visible : false;
    const filePath = params.file_path || '';
    const visiblePython = visible ? 'True' : 'False';

    return `
# Create new workbook using xlwings best practices
file_path = r"${filePath}"

if file_path:
    # Create workbook and save to specified path
    wb = xw.Book()
    wb.save(file_path)
    saved_path = file_path
else:
    # Create new workbook (will be temporary)
    wb = xw.Book()
    saved_path = wb.fullname

# Set Excel visibility if requested
if ${visiblePython}:
    wb.app.visible = True

result = {
    "success": True,
    "operation": "create_workbook", 
    "workbook": wb.name,
    "file_created": True,
    "file_path": saved_path
}
print(json.dumps(result))`;
  }

  private generateOpenWorkbookLogic(params: XlwingsParams): string {
    const filePath = params.file_path || '';
    const visible = params.visible !== undefined ? params.visible : false;
    const visiblePython = visible ? 'True' : 'False';

    if (!filePath) {
      return 'raise ValueError("file_path is required for open_workbook operation")';
    }


    return `
# Open workbook using xlwings best practices
file_path = r"${filePath}"
if not os.path.exists(file_path):
    raise FileNotFoundError(f"File not found: {file_path}")

# Open the workbook directly
wb = xw.Book(file_path)

# Set Excel visibility if requested
if ${visiblePython}:
    wb.app.visible = True

result = {
    "success": True,
    "operation": "open_workbook",
    "workbook": wb.name,
    "file_opened": True,
    "file_path": file_path
}
print(json.dumps(result))`;
  }

  private generateSaveWorkbookLogic(params: XlwingsParams): string {
    const filePath = params.file_path || '';

    return `
# Save workbook
app = xw.apps.active if xw.apps else None
if not app:
    raise Exception("No active Excel application found. Please open Excel first.")

wb = get_workbook("${params.workbook || ''}")
if not wb:
    wb = xw.books.active

file_path = r"${filePath}"
if file_path:
    wb.save(file_path)
    saved_path = file_path
else:
    wb.save()
    saved_path = wb.fullname

result = {
    "success": True,
    "operation": "save_workbook",
    "workbook": wb.name,
    "file_saved": True,
    "file_path": saved_path
}
print(json.dumps(result))`;
  }

  private generateCloseWorkbookLogic(params: XlwingsParams): string {
    const saveBeforeClose = params.save_before_close !== undefined ? params.save_before_close : true;
    const saveBeforeClosePython = saveBeforeClose ? 'True' : 'False';

    return `
# Close workbook
app = xw.apps.active if xw.apps else None
if not app:
    raise Exception("No active Excel application found. Please open Excel first.")

wb = get_workbook("${params.workbook || ''}")
if not wb:
    wb = xw.books.active

workbook_name = wb.name

# Save before closing if requested
if ${saveBeforeClosePython}:
    try:
        wb.save()
    except:
        pass  # Ignore save errors when closing

# Close the workbook
wb.close()

result = {
    "success": True,
    "operation": "close_workbook",
    "workbook": workbook_name,
    "file_closed": True
}
print(json.dumps(result))`;
  }

  private generateGetLastRowLogic(params: XlwingsParams): string {
    return `
# Connect to Excel
app = xw.apps.active if xw.apps else None
if not app:
    raise Exception("No active Excel application found. Please open Excel first.")

wb = get_workbook("${params.workbook || ''}")
if not wb:
    wb = xw.books.active

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    ws = wb.sheets.active

# Get last row with data
column = "${params.range || 'A'}"  # Default to column A if no range specified
if ':' in column:
    column = column.split(':')[0]  # Take first part if range like A:A

try:
    # Find last row with data in specified column
    last_row = ws.range(f"{column}1048576").end('up').row
    if last_row < 1:
        last_row = 1
except:
    # Fallback: use used range
    try:
        last_row = ws.used_range.last_cell.row
    except:
        last_row = 1

result = {
    "success": True,
    "operation": "get_last_row",
    "workbook": wb.name,
    "worksheet": ws.name,
    "column": column,
    "last_row": last_row
}
print(json.dumps(result))`;
  }

  private generateGetUsedRangeLogic(params: XlwingsParams): string {
    return `
# Connect to Excel
app = xw.apps.active if xw.apps else None
if not app:
    raise Exception("No active Excel application found. Please open Excel first.")

wb = get_workbook("${params.workbook || ''}")
if not wb:
    wb = xw.books.active

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    ws = wb.sheets.active

try:
    # Get the used range of the worksheet
    used_range = ws.used_range
    if used_range:
        range_address = used_range.address
        last_row = used_range.last_cell.row
        last_col = used_range.last_cell.column
        last_col_letter = column_number_to_letter(last_col)
    else:
        range_address = "A1"
        last_row = 1
        last_col = 1
        last_col_letter = "A"
except:
    # Fallback values
    range_address = "A1"
    last_row = 1
    last_col = 1
    last_col_letter = "A"

result = {
    "success": True,
    "operation": "get_used_range",
    "workbook": wb.name,
    "worksheet": ws.name,
    "used_range": range_address,
    "last_row": last_row,
    "last_column": last_col,
    "last_column_letter": last_col_letter
}
print(json.dumps(result))`;
  }

  private generateConvertDataTypesLogic(params: XlwingsParams): string {
    return `
# Connect to Excel
app = xw.apps.active if xw.apps else None
if not app:
    raise Exception("No active Excel application found. Please open Excel first.")

wb = get_workbook("${params.workbook || ''}")
if not wb:
    wb = xw.books.active

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    ws = wb.sheets.active

# Get range to convert
range_str = "${params.range || ''}"
if range_str:
    range_obj = ws.range(range_str)
else:
    # Use current region of active cell or A1
    range_obj = ws.range('A1').current_region

# Convert data types in the range
converted_cells = 0
total_cells = 0

for cell in range_obj:
    total_cells += 1
    value = cell.value
    original_value = value
    
    if value is not None and isinstance(value, str) and value.strip() != '':
        try:
            # Try to convert to number if it looks like a number
            stripped = value.strip()
            if stripped.lstrip('-+').replace('.', '').replace('e', '').replace('E', '').isdigit():
                if '.' in stripped or 'e' in stripped.lower():
                    # Float
                    new_value = float(stripped)
                else:
                    # Integer
                    new_value = int(stripped)
                cell.value = new_value
                converted_cells += 1
        except (ValueError, TypeError):
            # Keep original value if conversion fails
            pass

result = {
    "success": True,
    "operation": "convert_data_types",
    "workbook": wb.name,
    "worksheet": ws.name,
    "range": range_obj.address,
    "total_cells": total_cells,
    "converted_cells": converted_cells
}
print(json.dumps(result))`;
  }

  private generateAddVbaModuleLogic(params: XlwingsParams): string {
    const moduleName = params.vba_module || 'Module1';
    const vbaCode = params.vba_code || '';
    
    return `
# Connect to Excel
app = xw.apps.active if xw.apps else None
if not app:
    raise Exception("No active Excel application found. Please open Excel first.")

wb = get_workbook("${params.workbook || ''}")
if not wb:
    wb = xw.books.active

try:
    # Access VBA project
    vba_project = wb.api.VBProject
    
    # Check if module already exists
    module_exists = False
    try:
        vba_module = vba_project.VBComponents("${moduleName}")
        module_exists = True
    except:
        pass
    
    if module_exists:
        # Update existing module
        vba_module.CodeModule.DeleteLines(1, vba_module.CodeModule.CountOfLines)
        if "${vbaCode}":
            vba_module.CodeModule.AddFromString("""${vbaCode}""")
        action = "updated"
    else:
        # Create new module
        vba_module = vba_project.VBComponents.Add(1)  # 1 = vbext_ct_StdModule
        vba_module.Name = "${moduleName}"
        if "${vbaCode}":
            vba_module.CodeModule.AddFromString("""${vbaCode}""")
        action = "created"
    
    result = {
        "success": True,
        "operation": "add_vba_module",
        "workbook": wb.name,
        "module_name": "${moduleName}",
        "action": action,
        "code_lines": vba_module.CodeModule.CountOfLines
    }
    print(json.dumps(result))
    
except Exception as e:
    if "Programmatic access to Visual Basic Project is not trusted" in str(e):
        error_msg = "VBA access not enabled. Enable 'Trust access to the VBA project object model' in Excel Trust Center settings."
    else:
        error_msg = str(e)
    result = {
        "success": False,
        "operation": "add_vba_module",
        "xlwings_error": error_msg
    }
    print(json.dumps(result))`;
  }

  private generateRunVbaMacroLogic(params: XlwingsParams): string {
    const macroName = params.macro_name || '';
    
    return `
# Connect to Excel
app = xw.apps.active if xw.apps else None
if not app:
    raise Exception("No active Excel application found. Please open Excel first.")

wb = get_workbook("${params.workbook || ''}")
if not wb:
    wb = xw.books.active

try:
    if not "${macroName}":
        raise ValueError("macro_name is required for run_vba_macro operation")
    
    # Run the macro
    try:
        # Method 1: Use xlwings macro method
        result_value = wb.macro("${macroName}").run()
    except:
        # Method 2: Use Application.Run
        result_value = wb.app.api.Application.Run("${macroName}")
    
    result = {
        "success": True,
        "operation": "run_vba_macro",
        "workbook": wb.name,
        "macro_name": "${macroName}",
        "macro_result": safe_convert_data(result_value) if result_value is not None else None
    }
    print(json.dumps(result))
    
except Exception as e:
    result = {
        "success": False,
        "operation": "run_vba_macro",
        "xlwings_error": str(e)
    }
    print(json.dumps(result))`;
  }

  private generateUpdateVbaCodeLogic(params: XlwingsParams): string {
    const moduleName = params.vba_module || 'Module1';
    const vbaCode = params.vba_code || '';
    
    return `
# Connect to Excel
app = xw.apps.active if xw.apps else None
if not app:
    raise Exception("No active Excel application found. Please open Excel first.")

wb = get_workbook("${params.workbook || ''}")
if not wb:
    wb = xw.books.active

try:
    # Access VBA project
    vba_project = wb.api.VBProject
    
    # Find the module
    try:
        vba_module = vba_project.VBComponents("${moduleName}")
    except:
        raise Exception(f"VBA module '${moduleName}' not found")
    
    # Clear existing code
    vba_module.CodeModule.DeleteLines(1, vba_module.CodeModule.CountOfLines)
    
    # Add new code
    if "${vbaCode}":
        vba_module.CodeModule.AddFromString("""${vbaCode}""")
    
    result = {
        "success": True,
        "operation": "update_vba_code",
        "workbook": wb.name,
        "module_name": "${moduleName}",
        "code_lines": vba_module.CodeModule.CountOfLines
    }
    print(json.dumps(result))
    
except Exception as e:
    if "Programmatic access to Visual Basic Project is not trusted" in str(e):
        error_msg = "VBA access not enabled. Enable 'Trust access to the VBA project object model' in Excel Trust Center settings."
    else:
        error_msg = str(e)
    result = {
        "success": False,
        "operation": "update_vba_code",
        "xlwings_error": error_msg
    }
    print(json.dumps(result))`;
  }

  private generateListVbaModulesLogic(params: XlwingsParams): string {
    return `
# Connect to Excel
app = xw.apps.active if xw.apps else None
if not app:
    raise Exception("No active Excel application found. Please open Excel first.")

wb = get_workbook("${params.workbook || ''}")
if not wb:
    wb = xw.books.active

try:
    # Access VBA project
    vba_project = wb.api.VBProject
    
    modules = []
    for component in vba_project.VBComponents:
        module_info = {
            "name": component.Name,
            "type": component.Type,
            "code_lines": component.CodeModule.CountOfLines
        }
        modules.append(module_info)
    
    result = {
        "success": True,
        "operation": "list_vba_modules",
        "workbook": wb.name,
        "modules": modules,
        "total_modules": len(modules)
    }
    print(json.dumps(result))
    
except Exception as e:
    if "Programmatic access to Visual Basic Project is not trusted" in str(e):
        error_msg = "VBA access not enabled. Enable 'Trust access to the VBA project object model' in Excel Trust Center settings."
    else:
        error_msg = str(e)
    result = {
        "success": False,
        "operation": "list_vba_modules",
        "xlwings_error": error_msg
    }
    print(json.dumps(result))`;
  }

  private generateDeleteVbaModuleLogic(params: XlwingsParams): string {
    const moduleName = params.vba_module || '';
    
    return `
# Connect to Excel
app = xw.apps.active if xw.apps else None
if not app:
    raise Exception("No active Excel application found. Please open Excel first.")

wb = get_workbook("${params.workbook || ''}")
if not wb:
    wb = xw.books.active

try:
    if not "${moduleName}":
        raise ValueError("vba_module is required for delete_vba_module operation")
    
    # Access VBA project
    vba_project = wb.api.VBProject
    
    # Find and delete the module
    try:
        vba_module = vba_project.VBComponents("${moduleName}")
        vba_project.VBComponents.Remove(vba_module)
        
        result = {
            "success": True,
            "operation": "delete_vba_module",
            "workbook": wb.name,
            "module_name": "${moduleName}",
            "deleted": True
        }
        print(json.dumps(result))
    except:
        raise Exception(f"VBA module '${moduleName}' not found")
    
except Exception as e:
    if "Programmatic access to Visual Basic Project is not trusted" in str(e):
        error_msg = "VBA access not enabled. Enable 'Trust access to the VBA project object model' in Excel Trust Center settings."
    else:
        error_msg = str(e)
    result = {
        "success": False,
        "operation": "delete_vba_module",
        "xlwings_error": error_msg
    }
    print(json.dumps(result))`;
  }

  private generateUpdateChartLogic(params: XlwingsParams): string {
    const chartConfig = params.chart;
    const chartName = params.chart_name || '';
    
    if (!chartName) {
      return 'raise ValueError("chart_name is required for update_chart operation")';
    }
    
    return `
# Connect to Excel
app = xw.apps.active if xw.apps else None
if not app:
    raise Exception("No active Excel application found. Please open Excel first.")

wb = get_workbook("${params.workbook || ''}")
if not wb:
    wb = xw.books.active

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    ws = wb.sheets.active

try:
    # Find the chart by name
    chart = None
    for c in ws.charts:
        if c.name == "${chartName}":
            chart = c
            break
    
    if not chart:
        raise Exception(f"Chart '${chartName}' not found")
    
    # Update chart properties
    updated_properties = []
    
    ${chartConfig?.type ? `
    # Update chart type
    chart_type = "${chartConfig.type}"
    chart_types = {
        'column': 'column_clustered',
        'line': 'line',
        'bar': 'bar_clustered', 
        'pie': 'pie',
        'scatter': 'xy_scatter',
        'area': 'area'
    }
    chart.chart_type = chart_types.get(chart_type, 'column_clustered')
    updated_properties.append("type")
    ` : ''}
    
    ${chartConfig?.data_range ? `
    # Update data range
    chart.set_source_data(ws.range("${chartConfig.data_range}"))
    updated_properties.append("data_range")
    ` : ''}
    
    ${chartConfig?.position ? `
    # Update position
    chart.left = ws.range("${chartConfig.position}").left
    chart.top = ws.range("${chartConfig.position}").top
    updated_properties.append("position")
    ` : ''}
    
    # Update titles using Excel API
    try:
        ${chartConfig?.title ? `
        chart.api.ChartTitle.Text = "${chartConfig.title}"
        chart.api.HasTitle = True
        updated_properties.append("title")
        ` : ''}
        
        ${chartConfig?.x_axis_title ? `
        chart.api.Axes(1).HasTitle = True
        chart.api.Axes(1).AxisTitle.Text = "${chartConfig.x_axis_title}"
        updated_properties.append("x_axis_title")
        ` : ''}
        
        ${chartConfig?.y_axis_title ? `
        chart.api.Axes(2).HasTitle = True
        chart.api.Axes(2).AxisTitle.Text = "${chartConfig.y_axis_title}"
        updated_properties.append("y_axis_title")
        ` : ''}
    except Exception as title_error:
        pass
    
    result = {
        "success": True,
        "operation": "update_chart",
        "workbook": wb.name,
        "worksheet": ws.name,
        "chart_name": "${chartName}",
        "updated_properties": updated_properties
    }
    print(json.dumps(result))
    
except Exception as e:
    result = {
        "success": False,
        "operation": "update_chart",
        "xlwings_error": str(e)
    }
    print(json.dumps(result))`;
  }

  private generateDeleteChartLogic(params: XlwingsParams): string {
    const chartName = params.chart_name || '';
    
    if (!chartName) {
      return 'raise ValueError("chart_name is required for delete_chart operation")';
    }
    
    return `
# Connect to Excel
app = xw.apps.active if xw.apps else None
if not app:
    raise Exception("No active Excel application found. Please open Excel first.")

wb = get_workbook("${params.workbook || ''}")
if not wb:
    wb = xw.books.active

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    ws = wb.sheets.active

try:
    # Find and delete the chart
    chart = None
    for c in ws.charts:
        if c.name == "${chartName}":
            chart = c
            break
    
    if not chart:
        raise Exception(f"Chart '${chartName}' not found")
    
    # Delete the chart
    chart.delete()
    
    result = {
        "success": True,
        "operation": "delete_chart",
        "workbook": wb.name,
        "worksheet": ws.name,
        "chart_name": "${chartName}",
        "chart_deleted": True
    }
    print(json.dumps(result))
    
except Exception as e:
    result = {
        "success": False,
        "operation": "delete_chart",
        "xlwings_error": str(e)
    }
    print(json.dumps(result))`;
  }

  private generateListChartsLogic(params: XlwingsParams): string {
    return `
# Connect to Excel
app = xw.apps.active if xw.apps else None
if not app:
    raise Exception("No active Excel application found. Please open Excel first.")

wb = get_workbook("${params.workbook || ''}")
if not wb:
    wb = xw.books.active

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    ws = wb.sheets.active

try:
    # Get all charts in the worksheet
    charts = []
    for chart in ws.charts:
        chart_info = {
            "name": chart.name,
            "chart_type": str(chart.chart_type),
            "left": chart.left,
            "top": chart.top,
            "width": chart.width,
            "height": chart.height
        }
        
        # Try to get chart title
        try:
            if hasattr(chart.api, 'HasTitle') and chart.api.HasTitle:
                chart_info["title"] = chart.api.ChartTitle.Text
            else:
                chart_info["title"] = None
        except:
            chart_info["title"] = None
        
        charts.append(chart_info)
    
    result = {
        "success": True,
        "operation": "list_charts",
        "workbook": wb.name,
        "worksheet": ws.name,
        "charts": charts,
        "total_charts": len(charts)
    }
    print(json.dumps(result))
    
except Exception as e:
    result = {
        "success": False,
        "operation": "list_charts",
        "xlwings_error": str(e)
    }
    print(json.dumps(result))`;
  }

  private generateInsertImageLogic(params: XlwingsParams): string {
    const imagePath = params.image_path || '';
    const range = params.range || 'A1';
    const width = params.width;
    const height = params.height;
    const imageName = params.image_name;
    
    if (!imagePath) {
      return 'raise ValueError("image_path is required for insert_image operation")';
    }
    
    return `
# Connect to Excel
app = xw.apps.active if xw.apps else None
if not app:
    raise Exception("No active Excel application found. Please open Excel first.")

wb = get_workbook("${params.workbook || ''}")
if not wb:
    wb = xw.books.active

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    ws = wb.sheets.active

try:
    import os
    image_path = r"${imagePath}"
    
    # Check if image file exists
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image file not found: {image_path}")
    
    # Get target cell position
    target_range = ws.range("${range}")
    left = target_range.left
    top = target_range.top
    
    # Add the picture
    picture = ws.pictures.add(image_path, left=left, top=top)
    
    # Set custom name if provided
    ${imageName ? `
    try:
        picture.name = "${imageName}"
        final_name = "${imageName}"
    except:
        final_name = picture.name
    ` : `
    final_name = picture.name
    `}
    
    # Resize if dimensions provided
    ${width || height ? `
    original_width = picture.width
    original_height = picture.height
    ${width ? `picture.width = ${width}` : ''}
    ${height ? `picture.height = ${height}` : ''}
    ` : ''}
    
    result = {
        "success": True,
        "operation": "insert_image",
        "workbook": wb.name,
        "worksheet": ws.name,
        "image_name": final_name,
        "image_path": image_path,
        "position": "${range}",
        "width": picture.width,
        "height": picture.height
    }
    print(json.dumps(result))
    
except Exception as e:
    result = {
        "success": False,
        "operation": "insert_image",
        "xlwings_error": str(e)
    }
    print(json.dumps(result))`;
  }

  private generateListImagesLogic(params: XlwingsParams): string {
    return `
# Connect to Excel
app = xw.apps.active if xw.apps else None
if not app:
    raise Exception("No active Excel application found. Please open Excel first.")

wb = get_workbook("${params.workbook || ''}")
if not wb:
    wb = xw.books.active

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    ws = wb.sheets.active

try:
    # Get all pictures in the worksheet
    images = []
    for picture in ws.pictures:
        image_info = {
            "name": picture.name,
            "left": picture.left,
            "top": picture.top,
            "width": picture.width,
            "height": picture.height
        }
        
        # Try to get the cell position
        try:
            # Find the cell that contains this image
            for row in range(1, 1000):  # Check reasonable range
                for col in range(1, 100):
                    cell = ws.range((row, col))
                    if (abs(cell.left - picture.left) < 10 and 
                        abs(cell.top - picture.top) < 10):
                        image_info["cell_position"] = cell.address
                        break
                else:
                    continue
                break
        except:
            image_info["cell_position"] = None
        
        images.append(image_info)
    
    result = {
        "success": True,
        "operation": "list_images",
        "workbook": wb.name,
        "worksheet": ws.name,
        "images": images,
        "total_images": len(images)
    }
    print(json.dumps(result))
    
except Exception as e:
    result = {
        "success": False,
        "operation": "list_images",
        "xlwings_error": str(e)
    }
    print(json.dumps(result))`;
  }

  private generateDeleteImageLogic(params: XlwingsParams): string {
    const imageName = params.image_name || '';
    
    if (!imageName) {
      return 'raise ValueError("image_name is required for delete_image operation")';
    }
    
    return `
# Connect to Excel
app = xw.apps.active if xw.apps else None
if not app:
    raise Exception("No active Excel application found. Please open Excel first.")

wb = get_workbook("${params.workbook || ''}")
if not wb:
    wb = xw.books.active

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    ws = wb.sheets.active

try:
    # Find and delete the image
    picture = None
    for p in ws.pictures:
        if p.name == "${imageName}":
            picture = p
            break
    
    if not picture:
        raise Exception(f"Image '${imageName}' not found")
    
    # Delete the picture
    picture.delete()
    
    result = {
        "success": True,
        "operation": "delete_image",
        "workbook": wb.name,
        "worksheet": ws.name,
        "image_name": "${imageName}",
        "image_deleted": True
    }
    print(json.dumps(result))
    
except Exception as e:
    result = {
        "success": False,
        "operation": "delete_image",
        "xlwings_error": str(e)
    }
    print(json.dumps(result))`;
  }

  private generateResizeImageLogic(params: XlwingsParams): string {
    const imageName = params.image_name || '';
    const width = params.width;
    const height = params.height;
    
    if (!imageName) {
      return 'raise ValueError("image_name is required for resize_image operation")';
    }
    
    return `
# Connect to Excel
app = xw.apps.active if xw.apps else None
if not app:
    raise Exception("No active Excel application found. Please open Excel first.")

wb = get_workbook("${params.workbook || ''}")
if not wb:
    wb = xw.books.active

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    ws = wb.sheets.active

try:
    # Find the image
    picture = None
    for p in ws.pictures:
        if p.name == "${imageName}":
            picture = p
            break
    
    if not picture:
        raise Exception(f"Image '${imageName}' not found")
    
    # Store original dimensions
    original_width = picture.width
    original_height = picture.height
    
    # Resize image
    ${width ? `picture.width = ${width}` : ''}
    ${height ? `picture.height = ${height}` : ''}
    
    result = {
        "success": True,
        "operation": "resize_image",
        "workbook": wb.name,
        "worksheet": ws.name,
        "image_name": "${imageName}",
        "original_width": original_width,
        "original_height": original_height,
        "new_width": picture.width,
        "new_height": picture.height
    }
    print(json.dumps(result))
    
except Exception as e:
    result = {
        "success": False,
        "operation": "resize_image",
        "xlwings_error": str(e)
    }
    print(json.dumps(result))`;
  }

  private generateMoveImageLogic(params: XlwingsParams): string {
    const imageName = params.image_name || '';
    const range = params.range || '';
    
    if (!imageName) {
      return 'raise ValueError("image_name is required for move_image operation")';
    }
    
    if (!range) {
      return 'raise ValueError("range is required for move_image operation")';
    }
    
    return `
# Connect to Excel
app = xw.apps.active if xw.apps else None
if not app:
    raise Exception("No active Excel application found. Please open Excel first.")

wb = get_workbook("${params.workbook || ''}")
if not wb:
    wb = xw.books.active

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    ws = wb.sheets.active

try:
    # Find the image
    picture = None
    for p in ws.pictures:
        if p.name == "${imageName}":
            picture = p
            break
    
    if not picture:
        raise Exception(f"Image '${imageName}' not found")
    
    # Get new position
    target_range = ws.range("${range}")
    original_left = picture.left
    original_top = picture.top
    
    # Move image
    picture.left = target_range.left
    picture.top = target_range.top
    
    result = {
        "success": True,
        "operation": "move_image",
        "workbook": wb.name,
        "worksheet": ws.name,
        "image_name": "${imageName}",
        "new_position": "${range}",
        "original_left": original_left,
        "original_top": original_top,
        "new_left": picture.left,
        "new_top": picture.top
    }
    print(json.dumps(result))
    
except Exception as e:
    result = {
        "success": False,
        "operation": "move_image",
        "xlwings_error": str(e)
    }
    print(json.dumps(result))`;
  }

  private generateSaveRangeAsImageLogic(params: XlwingsParams): string {
    const range = params.range || 'A1:E10';
    const outputPath = params.output_path || '';
    
    if (!outputPath) {
      return 'raise ValueError("output_path is required for save_range_as_image operation")';
    }
    
    return `
# Connect to Excel
app = xw.apps.active if xw.apps else None
if not app:
    raise Exception("No active Excel application found. Please open Excel first.")

wb = get_workbook("${params.workbook || ''}")
if not wb:
    wb = xw.books.active

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    ws = wb.sheets.active

try:
    import os
    output_path = r"${outputPath}"
    
    # Ensure output directory exists
    output_dir = os.path.dirname(output_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir)
    
    # Get the range
    range_obj = ws.range("${range}")
    
    # Copy range to clipboard and paste as picture
    range_obj.copy()
    
    # Use Excel API to save range as image
    try:
        # Method 1: Export range as image
        chart = ws.api.ChartObjects().Add(0, 0, range_obj.width, range_obj.height)
        chart.Chart.Paste()
        chart.Chart.Export(output_path)
        chart.Delete()
    except:
        # Method 2: Alternative approach using pictures
        temp_pic = ws.pictures.add(output_path, 0, 0)  # This will fail but we can catch
        
    # Clear clipboard
    try:
        wb.app.api.Application.CutCopyMode = False
    except:
        pass
    
    # Check if file was created
    file_created = os.path.exists(output_path)
    file_size = os.path.getsize(output_path) if file_created else 0
    
    result = {
        "success": file_created,
        "operation": "save_range_as_image",
        "workbook": wb.name,
        "worksheet": ws.name,
        "range": "${range}",
        "output_path": output_path,
        "file_created": file_created,
        "file_size": file_size
    }
    print(json.dumps(result))
    
except Exception as e:
    result = {
        "success": False,
        "operation": "save_range_as_image",
        "xlwings_error": str(e)
    }
    print(json.dumps(result))`;
  }

  private generateSaveChartAsImageLogic(params: XlwingsParams): string {
    const chartName = params.chart_name || '';
    const outputPath = params.output_path || '';
    
    if (!chartName) {
      return 'raise ValueError("chart_name is required for save_chart_as_image operation")';
    }
    
    if (!outputPath) {
      return 'raise ValueError("output_path is required for save_chart_as_image operation")';
    }
    
    return `
# Connect to Excel
app = xw.apps.active if xw.apps else None
if not app:
    raise Exception("No active Excel application found. Please open Excel first.")

wb = get_workbook("${params.workbook || ''}")
if not wb:
    wb = xw.books.active

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    ws = wb.sheets.active

try:
    import os
    output_path = r"${outputPath}"
    
    # Ensure output directory exists
    output_dir = os.path.dirname(output_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir)
    
    # Find the chart
    chart = None
    for c in ws.charts:
        if c.name == "${chartName}":
            chart = c
            break
    
    if not chart:
        raise Exception(f"Chart '${chartName}' not found")
    
    # Export chart as image
    chart.api.Export(output_path)
    
    # Check if file was created
    file_created = os.path.exists(output_path)
    file_size = os.path.getsize(output_path) if file_created else 0
    
    result = {
        "success": file_created,
        "operation": "save_chart_as_image",
        "workbook": wb.name,
        "worksheet": ws.name,
        "chart_name": "${chartName}",
        "output_path": output_path,
        "file_created": file_created,
        "file_size": file_size
    }
    print(json.dumps(result))
    
except Exception as e:
    result = {
        "success": False,
        "operation": "save_chart_as_image",
        "xlwings_error": str(e)
    }
    print(json.dumps(result))`;
  }

  private generateSearchDataLogic(params: XlwingsParams): string {
    const searchTerm = params.search_term || '';
    const searchColumn = params.search_column;
    const searchFormulas = params.search_formulas !== false; // Default true
    const autoSelect = params.auto_select !== false; // Default true
    const targetWorksheet = params.worksheet || '';
    
    if (!searchTerm) {
      return 'raise ValueError("search_term is required for search_data operation")';
    }
    
    return `
# Connect to Excel
app = xw.apps.active if xw.apps else None
if not app:
    raise Exception("No active Excel application found. Please open Excel first.")

wb = get_workbook("${params.workbook || ''}")
if not wb:
    wb = xw.books.active

search_term = "${searchTerm}"
search_column = ${searchColumn ? (typeof searchColumn === 'string' ? `"${searchColumn}"` : searchColumn) : 'None'}
search_formulas = ${searchFormulas ? 'True' : 'False'}
auto_select = ${autoSelect ? 'True' : 'False'}
target_worksheet = "${targetWorksheet}"

matches = []

try:
    # Determine which worksheets to search
    worksheets_to_search = []
    if target_worksheet:
        # Search specific worksheet
        try:
            ws = wb.sheets[target_worksheet]
            worksheets_to_search = [ws]
        except:
            raise Exception(f"Worksheet '{target_worksheet}' not found")
    else:
        # Search all worksheets
        worksheets_to_search = wb.sheets
    
    # Search through worksheets
    for ws in worksheets_to_search:
        try:
            # Get used range
            used_range = ws.used_range
            if not used_range:
                continue
                
            # Get data and formulas
            data = used_range.value
            formulas = used_range.formula
            
            # Ensure data is 2D
            if not isinstance(data, list):
                data = [[data]]
            elif data and not isinstance(data[0], list):
                data = [data]
                
            # Ensure formulas is 2D  
            if not isinstance(formulas, list):
                formulas = [[formulas]]
            elif formulas and not isinstance(formulas[0], list):
                formulas = [formulas]
            
            # Get column headers (first row) for reference
            headers = data[0] if data else []
            
            # Determine search columns
            search_cols = []
            if search_column is not None:
                if isinstance(search_column, str):
                    # Search by column name
                    try:
                        col_index = headers.index(search_column)
                        search_cols = [col_index]
                    except ValueError:
                        # Column name not found, skip this worksheet
                        continue
                else:
                    # Search by column index
                    if 0 <= search_column < len(headers):
                        search_cols = [search_column]
            else:
                # Search all columns
                search_cols = list(range(len(headers))) if headers else []
            
            # Search through data
            for row_idx, row_data in enumerate(data):
                if not isinstance(row_data, list):
                    row_data = [row_data]
                    
                formula_row = formulas[row_idx] if row_idx < len(formulas) else [None] * len(row_data)
                if not isinstance(formula_row, list):
                    formula_row = [formula_row]
                
                for col_idx in search_cols:
                    if col_idx >= len(row_data):
                        continue
                        
                    cell_value = str(row_data[col_idx] or "").lower()
                    cell_formula = str(formula_row[col_idx] or "").lower() if col_idx < len(formula_row) else ""
                    search_lower = search_term.lower()
                    
                    # Check if search term matches value or formula
                    value_match = search_lower in cell_value
                    formula_match = search_formulas and search_lower in cell_formula
                    
                    if value_match or formula_match:
                        # Calculate Excel address
                        excel_row = row_idx + used_range.row
                        excel_col = col_idx + used_range.column
                        
                        # Convert to Excel address (A1 notation)
                        col_letter = ''
                        temp_col = excel_col
                        while temp_col > 0:
                            temp_col -= 1
                            col_letter = chr(65 + temp_col % 26) + col_letter
                            temp_col //= 26
                        
                        address = f"{col_letter}{excel_row}"
                        
                        # Get the entire row data for context
                        row_context = {}
                        for i, header in enumerate(headers):
                            if i < len(row_data):
                                row_context[header or f"Col{i+1}"] = row_data[i]
                        
                        match_info = {
                            "worksheet": ws.name,
                            "address": address,
                            "row": excel_row,
                            "column": excel_col,
                            "column_name": headers[col_idx] if col_idx < len(headers) else f"Col{col_idx+1}",
                            "matched_value": row_data[col_idx],
                            "matched_formula": formula_row[col_idx] if col_idx < len(formula_row) else None,
                            "match_type": "formula" if formula_match else "value",
                            "row_data": row_context
                        }
                        matches.append(match_info)
        
        except Exception as ws_error:
            # Continue with next worksheet if current one fails
            continue
    
    # Auto-select if only one match and auto_select is True
    selected_address = None
    if auto_select and len(matches) == 1:
        match = matches[0]
        # Switch to the worksheet
        target_ws = wb.sheets[match["worksheet"]]
        target_ws.activate()
        
        # Select the cell
        target_ws.range(match["address"]).select()
        selected_address = f"{match['worksheet']}!{match['address']}"
    
    result = {
        "success": True,
        "operation": "search_data",
        "workbook": wb.name,
        "search_term": search_term,
        "search_formulas": search_formulas,
        "total_matches": len(matches),
        "matches": matches,
        "auto_selected": selected_address if auto_select and len(matches) == 1 else None
    }
    print(json.dumps(result))
    
except Exception as e:
    result = {
        "success": False,
        "operation": "search_data",
        "xlwings_error": str(e)
    }
    print(json.dumps(result))`;
  }

  private generateListAppsLogic(_params: XlwingsParams): string {
    return `
# List all Excel applications
try:
    apps_info = []
    
    if not xw.apps:
        result = {
            "success": True,
            "operation": "list_apps",
            "total_apps": 0,
            "apps": [],
            "message": "No Excel applications currently running"
        }
    else:
        for i, app in enumerate(xw.apps):
            try:
                # Get app information
                app_info = {
                    "index": i,
                    "pid": getattr(app, 'pid', None),
                    "visible": getattr(app, 'visible', None),
                    "is_active": app == xw.apps.active,
                    "books": []
                }
                
                # Get books information
                try:
                    for book in app.books:
                        book_info = {
                            "name": book.name,
                            "full_name": getattr(book, 'fullname', ''),
                            "saved": getattr(book, 'saved', None),
                            "sheets_count": len(book.sheets) if book.sheets else 0
                        }
                        app_info["books"].append(book_info)
                    
                    app_info["books_count"] = len(app_info["books"])
                except:
                    app_info["books_count"] = 0
                    app_info["error"] = "Could not access books"
                
                apps_info.append(app_info)
                
            except Exception as app_error:
                # Continue with next app if current one fails
                apps_info.append({
                    "index": i,
                    "error": f"Could not access app: {str(app_error)}"
                })
                continue
        
        result = {
            "success": True,
            "operation": "list_apps",
            "total_apps": len(apps_info),
            "apps": apps_info,
            "active_app_index": next((i for i, app in enumerate(apps_info) if app.get("is_active")), None)
        }
    
    print(json.dumps(result))
    
except Exception as e:
    result = {
        "success": False,
        "operation": "list_apps",
        "xlwings_error": str(e)
    }
    print(json.dumps(result))`;
  }

  private generateInsertRowLogic(params: XlwingsParams): string {
    const position = params.position || 1;
    const count = params.count || 1;
    
    return `${this.generateExcelConnectionCode(params)}

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    ws = wb.sheets.active

position = ${position}
count = ${count}

# Insert rows using Excel API
try:
    # Convert position to proper row reference
    if isinstance(position, str):
        position = int(position)
    
    if position < 1:
        raise ValueError(f"Row position must be >= 1, got {position}")
    
    # Insert the specified number of rows
    for i in range(count):
        ws.api.Rows(f"{position}:{position}").Insert()
    
    result = {
        "success": True,
        "operation": "insert_row",
        "workbook": wb.name,
        "worksheet": ws.name,
        "position": position,
        "count": count,
        "rows_inserted": count
    }
    print(json.dumps(result))
    
except Exception as e:
    result = {
        "success": False,
        "operation": "insert_row",
        "xlwings_error": str(e)
    }
    print(json.dumps(result))`;
  }

  private generateInsertColumnLogic(params: XlwingsParams): string {
    const position = params.position || 'A';
    const count = params.count || 1;
    
    return `${this.generateExcelConnectionCode(params)}

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    ws = wb.sheets.active

position = "${position}"
count = ${count}

# Insert columns using Excel API
try:
    # Convert position to column letter if it's a number
    if isinstance(position, int) or (isinstance(position, str) and position.isdigit()):
        col_num = int(position)
        if col_num < 1:
            raise ValueError(f"Column position must be >= 1, got {col_num}")
        # Convert number to column letter
        position = column_number_to_letter(col_num)
    elif isinstance(position, str):
        position = position.upper()
        if not position.isalpha():
            raise ValueError(f"Invalid column position: {position}")
    
    # Insert the specified number of columns
    for i in range(count):
        ws.api.Columns(f"{position}:{position}").Insert()
    
    result = {
        "success": True,
        "operation": "insert_column",
        "workbook": wb.name,
        "worksheet": ws.name,
        "position": position,
        "count": count,
        "columns_inserted": count
    }
    print(json.dumps(result))
    
except Exception as e:
    result = {
        "success": False,
        "operation": "insert_column",
        "xlwings_error": str(e)
    }
    print(json.dumps(result))`;
  }

  private generateDeleteRowLogic(params: XlwingsParams): string {
    const position = params.position || 1;
    const count = params.count || 1;
    
    return `${this.generateExcelConnectionCode(params)}

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    ws = wb.sheets.active

position = ${position}
count = ${count}

# Delete rows using Excel API
try:
    if isinstance(position, str):
        position = int(position)
    
    if position < 1:
        raise ValueError(f"Row position must be >= 1, got {position}")
    
    # Delete the specified range of rows
    end_row = position + count - 1
    ws.api.Rows(f"{position}:{end_row}").Delete()
    
    result = {
        "success": True,
        "operation": "delete_row",
        "workbook": wb.name,
        "worksheet": ws.name,
        "position": position,
        "count": count,
        "rows_deleted": count
    }
    print(json.dumps(result))
    
except Exception as e:
    result = {
        "success": False,
        "operation": "delete_row",
        "xlwings_error": str(e)
    }
    print(json.dumps(result))`;
  }

  private generateDeleteColumnLogic(params: XlwingsParams): string {
    const position = params.position || 'A';
    const count = params.count || 1;
    
    return `${this.generateExcelConnectionCode(params)}

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    ws = wb.sheets.active

position = "${position}"
count = ${count}

# Delete columns using Excel API
try:
    # Convert position to column letter if it's a number
    if isinstance(position, int) or (isinstance(position, str) and position.isdigit()):
        col_num = int(position)
        if col_num < 1:
            raise ValueError(f"Column position must be >= 1, got {col_num}")
        start_col = column_number_to_letter(col_num)
        end_col = column_number_to_letter(col_num + count - 1)
    elif isinstance(position, str):
        position = position.upper()
        if not position.isalpha():
            raise ValueError(f"Invalid column position: {position}")
        start_col = position
        col_num = ws.range(f"{position}1").column
        end_col = column_number_to_letter(col_num + count - 1)
    
    # Delete the specified range of columns
    if count == 1:
        ws.api.Columns(f"{start_col}:{start_col}").Delete()
    else:
        ws.api.Columns(f"{start_col}:{end_col}").Delete()
    
    result = {
        "success": True,
        "operation": "delete_column",
        "workbook": wb.name,
        "worksheet": ws.name,
        "position": position,
        "count": count,
        "columns_deleted": count
    }
    print(json.dumps(result))
    
except Exception as e:
    result = {
        "success": False,
        "operation": "delete_column",
        "xlwings_error": str(e)
    }
    print(json.dumps(result))`;
  }
}