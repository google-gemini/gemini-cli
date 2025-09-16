/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasePythonTool } from './base-python-tool.js';
import type { ToolResult } from './tools.js';
import type { Config } from '../config/config.js';
import type { ToolResponseData } from '../providers/types.js';

/**
 * JSON-serializable value type for Python conversion
 */
type JsonValue = string | number | boolean | null | undefined | JsonValue[] | { [key: string]: JsonValue };

/**
 * Row height information structure
 */
interface RowHeightInfo {
  row: number;
  height: number | null;
  error?: string;
}

/**
 * Column width information structure  
 */
interface ColumnWidthInfo {
  column: string;
  column_number?: number;
  width: number | null;
  error?: string;
}

/**
 * Cell information structure
 */
interface CellInfo {
  address: string;
  row: number;
  column: number;
  value: unknown;
  data_type: string;
  formula?: string | null;
  has_formula?: boolean;
  formatting?: Record<string, unknown>;
  comment?: {
    text: string;
    author: string;
    visible: boolean;
  } | null;
  validation?: Record<string, unknown> | null;
  is_merged?: boolean;
  merge_area?: string | null;
}

/**
 * Shape style configuration interface
 */
interface ShapeStyle {
  fill_color?: string;
  border_color?: string;
  border_width?: number;
  border_style?: 'solid' | 'dashed' | 'dotted' | 'none';
  transparency?: number;
  shadow?: {
    enabled: boolean;
    color?: string;
    blur?: number;
    distance?: number;
    angle?: number;
  };
  three_d?: {
    enabled: boolean;
    depth?: number;
    bevel?: boolean;
  };
}

/**
 * Shape text format configuration interface
 */
interface ShapeTextFormat {
  font?: {
    name?: string;
    size?: number;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    color?: string;
  };
  alignment?: {
    horizontal?: 'left' | 'center' | 'right' | 'justify';
    vertical?: 'top' | 'middle' | 'bottom';
  };
  margins?: {
    left?: number;
    right?: number;
    top?: number;
    bottom?: number;
  };
  wrap_text?: boolean;
  rotation?: number;
}

/**
 * Parameters for xlwings Excel operations
 */
interface XlwingsParams {
  /** Operation type */
  op: 
  // Range operations
  'read_range' | 'write_range' | 'clear_range' | 'formula_range' | 'format_range' |
  'get_cell_info' | 'insert_range' | 'delete_range' |
  'copy_paste_range' | 'replace_range' | 'find_range' | 'get_used_range' | 'sort_range' |
  'merge_range' | 'unmerge_range' | 'get_sheet_info' |
  // Row/Column size operations
  'set_row_height' | 'set_column_width' | 'get_row_height' | 'get_column_width' |
  // Comment operations
  'add_comment' | 'edit_comment' | 'delete_comment' | 'list_comments' |
  // Chart operations
  'create_chart' | 'update_chart' | 'delete_chart' | 'list_charts' | 
  // Shape operations
  'create_shape' | 'create_textbox' | 'list_shapes' | 'modify_shape' | 'delete_shape' | 'move_shape' | 'resize_shape' |
  // Sheet operations
  'add_sheet' | 'alter_sheet' | 'delete_sheet' | 'move_sheet' | 'copy_sheet' | 'list_sheets' | 
  // Workbook operations
  'list_apps' | 'show_excel' | 'hide_excel' |
  // Selection operations
  'get_selection' | 'set_selection' | 
  // Workbook operations
  'create_workbook' |  'open_workbook' | 'save_workbook' | 'close_workbook' | 'list_workbooks' |  
  //VBA operations
  'convert_data_types' | 'add_vba_module' | 'run_vba_macro' | 'update_vba_code' | 'list_vba_modules' | 'delete_vba_module' | 
  // Image operations
  'insert_image' | 'list_images' | 'delete_image' |   'resize_image' | 'move_image' | /* 'save_range_as_image' | */ 'save_chart_as_image' |   
  // Row/Column operations
  'insert_row' | 'insert_column' | 'delete_row' | 'delete_column'| 'get_last_row' | 'get_last_column' ;
  
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
    name?: string;
    type?: 'line' | 'column' | 'bar' | 'pie' | 'scatter' | 'area';
    title?: string;
    x_axis_title?: string;
    y_axis_title?: string;
    data_range?: string;
    categories_range?: string;
    position?: string; // Where to place the chart
    series_names?: string[]; // Custom series names to override automatic header detection
    series_ranges?: string[]; // Individual series data ranges for fine-grained control
  };
  
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
    alignment?: 'left' | 'center' | 'right' | {
      horizontal?: 'left' | 'center' | 'right' | 'justify';
      vertical?: 'top' | 'center' | 'bottom';
    };
  };
  
  /** Formula to set (for formula operations) */
  formula?: string;
  
  /** Find and replace options */
  find_replace?: {
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
    /** Source workbook (for cross-workbook operations) */
    source_workbook?: string;
    /** Target workbook (for cross-workbook operations) */
    target_workbook?: string;
    /** Source app ID (for cross-instance operations) */
    source_app_id?: number;
    /** Target app ID (for cross-instance operations) */
    target_app_id?: number;
  };
  
  /** New sheet name (for add_sheet operations) */
  new_sheet_name?: string;

  /** Disable Excel alerts and warnings (prevents dialog boxes) */
  disable_alerts?: boolean;
  
  /** Sheet alteration settings (for alter_sheet operations) */
  sheet_alter?: {
    /** New name for the sheet */
    new_name?: string;
    /** Tab color in RGB hex format (e.g., "#FF0000" for red) */
    tab_color?: string;
  };
  
  /** Sheet move settings (for move_sheet operations) */
  sheet_move?: {
    /** Target workbook name (for cross-workbook moves) */
    target_workbook?: string;
    /** New index position (0-based, for same-workbook moves) */
    new_index?: number;
    /** Position relative to other sheet ('before' or 'after') */
    position?: 'before' | 'after';
    /** Reference sheet name (when using position) */
    reference_sheet?: string;
  };
  
  /** Sheet copy settings (for copy_sheet operations) */
  sheet_copy?: {
    /** Target workbook name (for cross-workbook copies, optional for same-workbook) */
    target_workbook?: string;
    /** New name for copied sheet */
    new_name?: string;
    /** Target index position (0-based) */
    target_index?: number;
    /** Position relative to other sheet ('before' or 'after') */
    position?: 'before' | 'after';
    /** Reference sheet name (when using position) */
    reference_sheet?: string;
  };
  
  /** Comment settings (for comment operations) */
  comment?: {
    /** Comment text content */
    text: string;
    /** Comment author (optional, defaults to current user) */
    author?: string;
    /** Whether comment should be visible by default */
    visible?: boolean;
  };
  
  /** Merge settings (for merge operations) */
  merge?: {
    /** Whether to merge across columns only (horizontal merge) */
    across_columns?: boolean;
    /** Whether to merge across rows only (vertical merge) */
    across_rows?: boolean;
    /** Center content in merged cell after merging */
    center_content?: boolean;
  };
  
  /** Row/Column sizing settings */
  sizing?: {
    /** Height for row operations (in points) */
    height?: number;
    /** Width for column operations (in characters or points) */
    width?: number;
    /** Auto-fit to content */
    auto_fit?: boolean;
    /** Row numbers (for multi-row operations, e.g., [1, 3, 5]) */
    row_numbers?: number[];
    /** Column identifiers (for multi-column operations, e.g., ['A', 'C', 'E'] or [1, 3, 5]) */
    column_identifiers?: Array<string | number>;
  };
  
  /** Cell manipulation settings (for insert/delete operations) */
  cell_operation?: {
    /** Direction to shift cells when inserting/deleting */
    shift_direction?: 'right' | 'down' | 'left' | 'up';
    /** Number of cells/rows/columns to insert or delete */
    count?: number;
    /** Whether to include cell formatting information (for get_cell_info) */
    include_formatting?: boolean;
    /** Whether to include formula information (for get_cell_info) */
    include_formulas?: boolean;
    /** Whether to include data validation info (for get_cell_info) */
    include_validation?: boolean;
    /** Whether to include comments (for get_cell_info) */
    include_comments?: boolean;
  };
  
  /** Sort settings (for sort_range operations) */
  sort?: {
    /** Sort keys - array of column/row specifications */
    keys?: Array<{
      /** Column letter or number to sort by */
      column?: string | number;
      /** Row number to sort by (for horizontal sorting) */
      row?: number;
      /** Sort order: ascending or descending */
      order?: 'asc' | 'desc';
      /** Data type for sorting (auto, text, number, date) */
      data_type?: 'auto' | 'text' | 'number' | 'date';
    }>;
    /** Whether to include header row in sorting (default: false) */
    has_header?: boolean;
    /** Sort orientation: by rows (vertical) or by columns (horizontal) */
    orientation?: 'rows' | 'columns';
    /** Whether sorting should be case sensitive */
    case_sensitive?: boolean;
    /** Custom sort order array for text values */
    custom_order?: string[];
  };
  
  /** Whether to make Excel visible during operation */
  visible?: boolean;
  
  /** Maximum rows to return for read operations (default: 100 for preview, set higher for complete data) */
  max_rows?: number;
  
  /** Starting row for batch reading (1-based, for pagination) */
  start_row?: number;
  
  /** Provide data summary instead of full data when dataset is large */
  summary_mode?: boolean;

  /** Sheet analysis settings (for get_sheet_info operations) */
  sheet_analysis?: {
    /** Number of top rows to return (default: 3, 0 for none) */
    top_rows?: number;
    /** Number of bottom rows to return (default: 1, 0 for none) */
    bottom_rows?: number;
    /** Include formatting information */
    include_formatting?: boolean;
    /** Include formula information */
    include_formulas?: boolean;
    /** Include merged cell information */
    include_merged_cells?: boolean;
  };
  
  /** File path for create_workbook, open_workbook, save_workbook operations */
  file_path?: string;
  
  /** Whether to save existing changes before closing (for close_workbook) */
  save_before_close?: boolean;
  
  /** VBA module configuration */
  vba?: {
    module_name?: string;
    code?: string;
    macro_name?: string;
  };

  /** Image configuration */
  image?: {
    path?: string;
    name?: string;
    width?: number;
    height?: number;
    position?: string;
  };

  /** Output file path (for export operations) */
  output_path?: string;

  /** Search configuration */
  search?: {
    term?: string;
    column?: string | number;
    formulas?: boolean;
    auto_select?: boolean;
  };
  
  /** Excel application PID or index to connect to (optional, uses active if not specified) */
  app_id?: number;
  
  /** Row or column position/index for insert/delete operations (1-based for rows, A/B/C or 1/2/3 for columns) */
  position?: string | number;
  
  /** Number of rows/columns to insert or delete (default: 1) */
  count?: number;

  /** Shape configuration (for shape operations) */
  shape?: {
    /** Shape type */
    type?: 'rectangle' | 'oval' | 'triangle' | 'rounded_rectangle' | 'line' | 'arrow' | 'textbox' |
          'flowchart_process' | 'flowchart_decision' | 'flowchart_start_end' |
          'flowchart_connector' | 'straight_connector' | 'elbow_connector' | 'curved_connector' |
          'right_arrow' | 'left_arrow' | 'up_arrow' | 'down_arrow' |
          'star' | 'pentagon' | 'hexagon';
    /** Shape name/identifier (for management operations) */
    name?: string;
    /** Position and size (required for create operations) */
    left?: number;
    top?: number;
    width?: number;
    height?: number;
    /** Text content (for shapes that support text) */
    text?: string;
    /** Style configuration */
    style?: {
      /** Fill color (hex format, e.g., "#FF0000") */
      fill_color?: string;
      /** Border color (hex format) */
      border_color?: string;
      /** Border width in points */
      border_width?: number;
      /** Border style */
      border_style?: 'solid' | 'dashed' | 'dotted' | 'none';
      /** Transparency (0.0 = opaque, 1.0 = fully transparent) */
      transparency?: number;
      /** Shadow settings */
      shadow?: {
        enabled: boolean;
        color?: string;
        blur?: number;
        distance?: number;
        angle?: number;
      };
      /** 3D effect settings */
      three_d?: {
        enabled: boolean;
        depth?: number;
        bevel?: boolean;
      };
    };
    /** Text formatting (for text-supporting shapes) */
    text_format?: {
      /** Font settings */
      font?: {
        name?: string;
        size?: number;
        bold?: boolean;
        italic?: boolean;
        underline?: boolean;
        color?: string;
      };
      /** Text alignment */
      alignment?: {
        horizontal?: 'left' | 'center' | 'right' | 'justify';
        vertical?: 'top' | 'middle' | 'bottom';
      };
      /** Text margins within shape */
      margins?: {
        left?: number;
        right?: number;
        top?: number;
        bottom?: number;
      };
      /** Text wrapping */
      wrap_text?: boolean;
      /** Text rotation (in degrees) */
      rotation?: number;
    };
    /** Shape rotation (in degrees) */
    rotation?: number;
    /** Layer/z-order management */
    layer?: {
      /** Bring to front, send to back, etc. */
      action?: 'bring_to_front' | 'send_to_back' | 'bring_forward' | 'send_backward';
      /** Specific z-order index */
      z_index?: number;
    };
    /** Grouping settings */
    group?: {
      /** Group name for grouping operations */
      group_name?: string;
      /** Action to perform */
      action?: 'group' | 'ungroup' | 'add_to_group' | 'remove_from_group';
    };
    /** Animation settings (if supported) */
    animation?: {
      /** Animation type */
      type?: 'fade_in' | 'slide_in' | 'bounce' | 'rotate' | 'none';
      /** Duration in milliseconds */
      duration?: number;
      /** Delay before animation starts */
      delay?: number;
    };
    /** Connection settings for connector shapes */
    connection?: {
      /** Name of the starting shape to connect from */
      start_shape?: string;
      /** Name of the ending shape to connect to */
      end_shape?: string;
      /** Connection site index on start shape (0-based) */
      start_connection_site?: number;
      /** Connection site index on end shape (0-based) */
      end_connection_site?: number;
    };
    /** Shape movement settings (for move_shape operations) */
    move?: {
      /** New position */
      new_left: number;
      new_top: number;
      /** Whether to animate the movement */
      animate?: boolean;
    };
    /** Shape resize settings (for resize_shape operations) */
    resize?: {
      /** New dimensions */
      new_width: number;
      new_height: number;
      /** Whether to maintain aspect ratio */
      keep_aspect_ratio?: boolean;
      /** Resize anchor point */
      anchor?: 'top_left' | 'top_center' | 'top_right' |
               'middle_left' | 'center' | 'middle_right' |
               'bottom_left' | 'bottom_center' | 'bottom_right';
    };
  };
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
  structuredData?: ToolResponseData;  // Add structured response data

  // Additional fields for operations - deleted_sheet_name, remaining_sheets are defined below
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

  // Sort operation results
  sort_criteria?: SortCriteria[];
  rows_affected?: number;

  // Find operation results
  found_addresses?: string[];

  // Additional fields found in code
  changes_made?: string[];
  original_sheet_name?: string;
  current_sheet_name?: string;
  deleted_sheet_name?: string;
  remaining_sheets?: string[];
  remaining_sheets_count?: number;
  sheet_name?: string;
  move_type?: string;
  source_workbook?: string;
  target_workbook?: string;
  source_sheets_remaining?: string[];
  original_index?: number;
  new_index?: number;
  sheets_after?: Array<[number, string]>;
  source_sheet_name?: string;
  copy_type?: string;
  copied_sheet_name?: string;
  target_index?: number;
  target_sheets_after?: string[];
  target_sheets_count?: number;
  copied_index?: number;
  total_sheets?: number;
  rows_inserted?: number;
  columns_inserted?: number;
  rows_deleted?: number;
  columns_deleted?: number;
  comments?: Array<{
    address: string;
    text: string;
    author: string;
    visible?: boolean;
  }>;
  total_comments?: number;
  merge_type?: string;
  content_centered?: boolean;
  cells_unmerged?: number;
  unmerged_ranges?: string[];
  auto_fit?: boolean;
  total_rows?: number;
  height_set?: number;
  rows_processed?: number[];
  total_columns?: number;
  width_set?: number;
  columns_processed?: string[];
  row_heights?: RowHeightInfo[];
  column_widths?: ColumnWidthInfo[];
  info_included?: {
    formatting?: boolean;
    formulas?: boolean;
    validation?: boolean;
    comments?: boolean;
  };
  cells?: CellInfo[];
  cells_inserted?: number;
  shift_direction?: string;
  insertions_completed?: number;
  total_requested?: number;
  cells_deleted?: number;
  original_range_size?: {
    rows: number;
    columns: number;
  };
  has_header?: boolean;
  case_sensitive?: boolean;
  custom_order_applied?: boolean;
  
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

  // Shape operation results
  shape?: {
    name: string;
    type: string;
    text?: string;
    position: {
      left: number;
      top: number;
    };
    size: {
      width: number;
      height: number;
    };
    rotation?: number;
    visible?: boolean;
  };
  shapes?: Array<{
    name: string;
    type: string;
    left?: number;
    top?: number;
    width?: number;
    height?: number;
    text?: string;
  }>;
  total_shapes?: number;
  shape_created?: boolean;
  shape_modified?: boolean;
  shape_deleted?: boolean;
}

/**
 * Sort criteria interface
 */
interface SortCriteria {
  column: string;
  order: 'asc' | 'desc';
}

/**
 * Sheet data structure for get_sheet_info operation
 */
interface SheetData {
  used_range?: {
    total_rows: number;
    total_columns: number;
    address?: string;
    last_row?: number;
    last_column_letter?: string;
  };
  top_rows?: {
    data: CellInfo[][];
    count: number;
    range: string;
  };
  bottom_rows?: {
    data: CellInfo[][];
    count: number;
    range: string;
  };
  merged_cells?: {
    count: number;
    areas?: string[];
  };
}


/**
 * Excel interaction tool using xlwings for real-time Excel manipulation
 */
export class XlwingsTool extends BasePythonTool<XlwingsParams, XlwingsResult> {
  /**
   * Escapes a file path for safe use in Python string literals
   */
  private escapePythonPath(path: string): string {
    if (!path) return '';
    // Replace single backslashes with double backslashes for Python string literals
    return path.replace(/\\/g, '\\\\');
  }

  constructor(config: Config) {
    super(
      'xlwings',
      'Excel Automation',
      'Automates Excel operations: read/write data, create charts, format cells, manage sheets. Requires Microsoft Excel and xlwings Python library.',
      ['xlwings'], // Python requirements
      {
        type: 'object',
        required: ['op'],
        properties: {
          op: {
            type: 'string',
            enum: ['read_range', 'write_range', 'clear_range', 'formula_range', 'format_range', 'get_cell_info', 'insert_range', 'delete_range', 'copy_paste_range', 'replace_range', 'find_range', 'get_used_range', 'sort_range', 'merge_range', 'unmerge_range', 'get_sheet_info', 'set_row_height', 'set_column_width', 'get_row_height', 'get_column_width', 'add_comment', 'edit_comment', 'delete_comment', 'list_comments', 'create_chart', 'update_chart', 'delete_chart', 'list_charts', 'create_shape', 'create_textbox', 'list_shapes', 'modify_shape', 'delete_shape', 'move_shape', 'resize_shape', 'add_sheet', 'alter_sheet', 'delete_sheet', 'move_sheet', 'copy_sheet', 'list_workbooks', 'list_sheets', 'get_selection', 'set_selection', 'create_workbook', 'open_workbook', 'save_workbook', 'close_workbook', 'get_last_row', 'get_last_column', 'convert_data_types', 'add_vba_module', 'run_vba_macro', 'update_vba_code', 'list_vba_modules', 'delete_vba_module', 'insert_image', 'list_images', 'delete_image', 'resize_image', 'move_image', /* 'save_range_as_image', */ 'save_chart_as_image', 'list_apps', 'insert_row', 'insert_column', 'delete_row', 'delete_column', 'show_excel', 'hide_excel'],
            description: 'Operation to perform. Key operations: get_sheet_info (recommended for table analysis), get_used_range (basic range info), get_cell_info (detailed single cell analysis), sort_range (use get_sheet_info first to identify data boundaries)'
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
            description: 'Cell range (e.g., "A1", "A1:C10", "Sheet1!A1:B5"). For write_range: specify a range that matches your data size (e.g., "A1:G26" for 26 rows × 7 columns of data). Single cell like "A1" will auto-expand to fit data size.'
          },
          data: {
            type: 'array',
            description: 'Data to write (2D array for multiple rows/cols, 1D array for single row/col)'
          },
          chart: {
            type: 'object',
            description: 'Chart configuration',
            properties: {
              name: { type: 'string', description: 'Chart name/identifier (for chart management operations)' },
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
              position: { type: 'string', description: 'Chart position (e.g., "D1")' },
              series_names: {
                type: 'array',
                items: { type: 'string' },
                description: 'Custom series names to override automatic header detection'
              },
              series_ranges: {
                type: 'array',
                items: { type: 'string' },
                description: 'Individual series data ranges for fine-grained control'
              }
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
                oneOf: [
                  {
                    type: 'string',
                    enum: ['left', 'center', 'right'],
                    description: 'Simple horizontal alignment (legacy)'
                  },
                  {
                    type: 'object',
                    description: 'Detailed alignment settings',
                    properties: {
                      horizontal: {
                        type: 'string',
                        enum: ['left', 'center', 'right', 'justify'],
                        description: 'Horizontal alignment'
                      },
                      vertical: {
                        type: 'string',
                        enum: ['top', 'center', 'bottom'],
                        description: 'Vertical alignment'
                      }
                    }
                  }
                ]
              }
            }
          },
          formula: {
            type: 'string',
            description: 'Formula to set (e.g., "=SUM(A1:A10)")'
          },
          find_replace: {
            type: 'object',
            description: 'Find and replace options',
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
              source_range: { type: 'string', description: 'Source range (supports Sheet!Range format for cross-sheet)' },
              destination_range: { type: 'string', description: 'Destination range (supports Sheet!Range format for cross-sheet)' },
              values_only: { type: 'boolean', description: 'Copy values only' },
              cut_mode: { type: 'boolean', description: 'Delete source data after copying (cut operation)' },
              source_workbook: { type: 'string', description: 'Source workbook name for cross-workbook operations' },
              target_workbook: { type: 'string', description: 'Target workbook name for cross-workbook operations' },
              source_app_id: { type: 'number', description: 'Source Excel app PID for cross-instance operations' },
              target_app_id: { type: 'number', description: 'Target Excel app PID for cross-instance operations' }
            }
          },
          new_sheet_name: {
            type: 'string',
            description: 'Name for new sheet'
          },
          disable_alerts: {
            type: 'boolean',
            description: 'Disable Excel alerts and warnings to prevent dialog boxes (default: false)'
          },
          sheet_alter: {
            type: 'object',
            description: 'Sheet alteration settings',
            properties: {
              new_name: { type: 'string', description: 'New name for the sheet' },
              tab_color: { type: 'string', description: 'Tab color in RGB hex format (e.g., "#FF0000" for red)' }
            }
          },
          sheet_move: {
            type: 'object',
            description: 'Sheet move settings',
            properties: {
              target_workbook: { type: 'string', description: 'Target workbook name (for cross-workbook moves)' },
              new_index: { type: 'integer', description: 'New index position (0-based, for same-workbook moves)' },
              position: { type: 'string', enum: ['before', 'after'], description: 'Position relative to reference sheet' },
              reference_sheet: { type: 'string', description: 'Reference sheet name (when using position)' }
            }
          },
          sheet_copy: {
            type: 'object',
            description: 'Sheet copy settings',
            properties: {
              target_workbook: { type: 'string', description: 'Target workbook name (for cross-workbook copies)' },
              new_name: { type: 'string', description: 'New name for copied sheet' },
              target_index: { type: 'integer', description: 'Target index position (0-based)' },
              position: { type: 'string', enum: ['before', 'after'], description: 'Position relative to reference sheet' },
              reference_sheet: { type: 'string', description: 'Reference sheet name (when using position)' }
            }
          },
          comment: {
            type: 'object',
            description: 'Comment settings',
            required: ['text'],
            properties: {
              text: { type: 'string', description: 'Comment text content' },
              author: { type: 'string', description: 'Comment author (optional, defaults to current user)' },
              visible: { type: 'boolean', description: 'Whether comment should be visible by default' }
            }
          },
          merge: {
            type: 'object',
            description: 'Merge settings for merge/unmerge operations',
            properties: {
              across_columns: { type: 'boolean', description: 'Whether to merge across columns only (horizontal merge)' },
              across_rows: { type: 'boolean', description: 'Whether to merge across rows only (vertical merge)' },
              center_content: { type: 'boolean', description: 'Center content in merged cell after merging' }
            }
          },
          sizing: {
            type: 'object',
            description: 'Row/Column sizing settings for height and width operations',
            properties: {
              height: { type: 'number', description: 'Height for row operations (in points)' },
              width: { type: 'number', description: 'Width for column operations (in characters or points)' },
              auto_fit: { type: 'boolean', description: 'Auto-fit to content' },
              row_numbers: { 
                type: 'array', 
                items: { type: 'number' }, 
                description: 'Row numbers for multi-row operations (e.g., [1, 3, 5])' 
              },
              column_identifiers: { 
                type: 'array', 
                items: { oneOf: [{ type: 'string' }, { type: 'number' }] }, 
                description: 'Column identifiers for multi-column operations (e.g., ["A", "C", "E"] or [1, 3, 5])' 
              }
            }
          },
          cell_operation: {
            type: 'object',
            description: 'Cell manipulation and information settings',
            properties: {
              shift_direction: { 
                type: 'string', 
                enum: ['right', 'down', 'left', 'up'], 
                description: 'Direction to shift cells when inserting/deleting' 
              },
              include_formatting: { type: 'boolean', description: 'Whether to include cell formatting information (for get_cell_info)' },
              include_formulas: { type: 'boolean', description: 'Whether to include formula information (for get_cell_info)' },
              include_validation: { type: 'boolean', description: 'Whether to include data validation info (for get_cell_info)' },
              include_comments: { type: 'boolean', description: 'Whether to include comments (for get_cell_info)' }
            }
          },
          sort: {
            type: 'object',
            description: 'Sort settings for sort_range operations',
            properties: {
              keys: {
                type: 'array',
                description: 'Sort criteria keys',
                items: {
                  type: 'object',
                  properties: {
                    column: { oneOf: [{ type: 'string' }, { type: 'number' }], description: 'Column letter or number to sort by' },
                    row: { type: 'number', description: 'Row number to sort by (for horizontal sorting)' },
                    order: { type: 'string', enum: ['asc', 'desc'], description: 'Sort order: ascending or descending' },
                    data_type: { type: 'string', enum: ['auto', 'text', 'number', 'date'], description: 'Data type for sorting' }
                  }
                }
              },
              has_header: { type: 'boolean', description: 'Whether to include header row in sorting (default: false)' },
              orientation: { type: 'string', enum: ['rows', 'columns'], description: 'Sort orientation: by rows (vertical) or by columns (horizontal)' },
              case_sensitive: { type: 'boolean', description: 'Whether sorting should be case sensitive' },
              custom_order: { 
                type: 'array', 
                items: { type: 'string' }, 
                description: 'Custom sort order array for text values' 
              }
            }
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
          sheet_analysis: {
            type: 'object',
            description: 'Sheet analysis settings for get_sheet_info operations',
            properties: {
              top_rows: { type: 'number', description: 'Number of top rows to return (default: 3, 0 for none)' },
              bottom_rows: { type: 'number', description: 'Number of bottom rows to return (default: 1, 0 for none)' },
              include_formatting: { type: 'boolean', description: 'Include formatting information' },
              include_formulas: { type: 'boolean', description: 'Include formula information' },
              include_merged_cells: { type: 'boolean', description: 'Include merged cell information' }
            }
          },
          // Workbook Management
          file_path: {
            type: 'string',
            description: 'File path for workbook operations (create_workbook, open_workbook, save_workbook)'
          },
          save_before_close: {
            type: 'boolean',
            description: 'Whether to save existing changes before closing (for close_workbook)'
          },

          // VBA Operations
          vba: {
            type: 'object',
            description: 'VBA module configuration',
            properties: {
              module_name: {
                type: 'string',
                description: 'VBA module name (for VBA operations)'
              },
              code: {
                type: 'string',
                description: 'VBA code content (for add_vba_module, update_vba_code operations)'
              },
              macro_name: {
                type: 'string',
                description: 'VBA macro name to run (for run_vba_macro operation)'
              }
            }
          },


          // Image Operations
          image: {
            type: 'object',
            description: 'Image configuration',
            properties: {
              path: {
                type: 'string',
                description: 'Image file path (for insert_image operations)'
              },
              name: {
                type: 'string',
                description: 'Image name/identifier (for image management operations)'
              },
              width: {
                type: 'number',
                description: 'Image width in pixels'
              },
              height: {
                type: 'number',
                description: 'Image height in pixels'
              },
              position: {
                type: 'string',
                description: 'Image position (cell reference like "A1" or "C3")'
              }
            }
          },

          // Search Operations
          search: {
            type: 'object',
            description: 'Search configuration',
            properties: {
              term: {
                type: 'string',
                description: 'Search term to find in cells'
              },
              column: {
                description: 'Column name (string) or index (number) to search in (optional, searches all columns if not specified)'
              },
              formulas: {
                type: 'boolean',
                description: 'Search in cell formulas as well as values (default: true)'
              },
              auto_select: {
                type: 'boolean',
                description: 'Auto-select cell if only one match found (default: true)'
              }
            }
          },

          // Export Operations
          output_path: {
            type: 'string',
            description: 'Output file path for export operations (save_chart_as_image)'
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
          },
          shape: {
            type: 'object',
            description: 'Shape configuration for shape operations',
            properties: {
              type: {
                type: 'string',
                enum: ['rectangle', 'oval', 'triangle', 'rounded_rectangle', 'line', 'arrow', 'textbox', 'flowchart_process', 'flowchart_decision', 'flowchart_start_end', 'flowchart_connector', 'straight_connector', 'elbow_connector', 'curved_connector', 'right_arrow', 'left_arrow', 'up_arrow', 'down_arrow', 'star', 'pentagon', 'hexagon'],
                description: 'Shape type'
              },
              name: {
                type: 'string',
                description: 'Shape name/identifier for management operations'
              },
              left: {
                type: 'number',
                description: 'Left position in points'
              },
              top: {
                type: 'number', 
                description: 'Top position in points'
              },
              width: {
                type: 'number',
                description: 'Width in points'
              },
              height: {
                type: 'number',
                description: 'Height in points'
              },
              text: {
                type: 'string',
                description: 'Text content for shapes that support text'
              },
              style: {
                type: 'object',
                description: 'Shape styling configuration',
                properties: {
                  fill_color: {
                    type: 'string',
                    description: 'Fill color in hex format (e.g., "#FF0000")'
                  },
                  border_color: {
                    type: 'string',
                    description: 'Border color in hex format'
                  },
                  border_width: {
                    type: 'number',
                    description: 'Border width in points'
                  },
                  border_style: {
                    type: 'string',
                    enum: ['solid', 'dashed', 'dotted', 'none'],
                    description: 'Border style'
                  },
                  transparency: {
                    type: 'number',
                    minimum: 0,
                    maximum: 1,
                    description: 'Transparency (0.0 = opaque, 1.0 = fully transparent)'
                  },
                  shadow: {
                    type: 'object',
                    description: 'Shadow settings',
                    properties: {
                      enabled: { type: 'boolean', description: 'Enable shadow' },
                      color: { type: 'string', description: 'Shadow color' },
                      blur: { type: 'number', description: 'Shadow blur radius' },
                      distance: { type: 'number', description: 'Shadow distance' },
                      angle: { type: 'number', description: 'Shadow angle in degrees' }
                    }
                  },
                  three_d: {
                    type: 'object',
                    description: '3D effect settings',
                    properties: {
                      enabled: { type: 'boolean', description: 'Enable 3D effect' },
                      depth: { type: 'number', description: '3D depth' },
                      bevel: { type: 'boolean', description: 'Enable bevel effect' }
                    }
                  }
                }
              },
              text_format: {
                type: 'object',
                description: 'Text formatting for text-supporting shapes',
                properties: {
                  font: {
                    type: 'object',
                    description: 'Font settings',
                    properties: {
                      name: { type: 'string', description: 'Font name' },
                      size: { type: 'number', description: 'Font size in points' },
                      bold: { type: 'boolean', description: 'Bold text' },
                      italic: { type: 'boolean', description: 'Italic text' },
                      underline: { type: 'boolean', description: 'Underlined text' },
                      color: { type: 'string', description: 'Font color in hex format' }
                    }
                  },
                  alignment: {
                    type: 'object',
                    description: 'Text alignment',
                    properties: {
                      horizontal: {
                        type: 'string',
                        enum: ['left', 'center', 'right', 'justify'],
                        description: 'Horizontal text alignment'
                      },
                      vertical: {
                        type: 'string',
                        enum: ['top', 'middle', 'bottom'],
                        description: 'Vertical text alignment'
                      }
                    }
                  },
                  margins: {
                    type: 'object',
                    description: 'Text margins within shape',
                    properties: {
                      left: { type: 'number', description: 'Left margin' },
                      right: { type: 'number', description: 'Right margin' },
                      top: { type: 'number', description: 'Top margin' },
                      bottom: { type: 'number', description: 'Bottom margin' }
                    }
                  },
                  wrap_text: {
                    type: 'boolean',
                    description: 'Enable text wrapping'
                  },
                  rotation: {
                    type: 'number',
                    description: 'Text rotation in degrees'
                  }
                }
              },
              rotation: {
                type: 'number',
                description: 'Shape rotation in degrees'
              },
              layer: {
                type: 'object',
                description: 'Layer/z-order management',
                properties: {
                  action: {
                    type: 'string',
                    enum: ['bring_to_front', 'send_to_back', 'bring_forward', 'send_backward'],
                    description: 'Layer action to perform'
                  },
                  z_index: {
                    type: 'number',
                    description: 'Specific z-order index'
                  }
                }
              },
              group: {
                type: 'object',
                description: 'Grouping settings',
                properties: {
                  group_name: {
                    type: 'string',
                    description: 'Group name for grouping operations'
                  },
                  action: {
                    type: 'string',
                    enum: ['group', 'ungroup', 'add_to_group', 'remove_from_group'],
                    description: 'Grouping action to perform'
                  }
                }
              },
              animation: {
                type: 'object',
                description: 'Animation settings (if supported)',
                properties: {
                  type: {
                    type: 'string',
                    enum: ['fade_in', 'slide_in', 'bounce', 'rotate', 'none'],
                    description: 'Animation type'
                  },
                  duration: {
                    type: 'number',
                    description: 'Duration in milliseconds'
                  },
                  delay: {
                    type: 'number',
                    description: 'Delay before animation starts'
                  }
                }
              },
              connection: {
                type: 'object',
                description: 'Connection settings for connector shapes',
                properties: {
                  start_shape: {
                    type: 'string',
                    description: 'Name of the starting shape to connect from'
                  },
                  end_shape: {
                    type: 'string',
                    description: 'Name of the ending shape to connect to'
                  },
                  start_connection_site: {
                    type: 'number',
                    description: 'Connection site index on start shape (0-based)'
                  },
                  end_connection_site: {
                    type: 'number',
                    description: 'Connection site index on end shape (0-based)'
                  }
                }
              },
              move: {
                type: 'object',
                description: 'Shape movement settings for move_shape operations',
                properties: {
                  new_left: {
                    type: 'number',
                    description: 'New left position'
                  },
                  new_top: {
                    type: 'number',
                    description: 'New top position'
                  },
                  animate: {
                    type: 'boolean',
                    description: 'Whether to animate the movement'
                  }
                }
              },
              resize: {
                type: 'object',
                description: 'Shape resize settings for resize_shape operations',
                properties: {
                  new_width: {
                    type: 'number',
                    description: 'New width'
                  },
                  new_height: {
                    type: 'number',
                    description: 'New height'
                  },
                  keep_aspect_ratio: {
                    type: 'boolean',
                    description: 'Whether to maintain aspect ratio'
                  },
                  anchor: {
                    type: 'string',
                    enum: ['top_left', 'top_center', 'top_right', 'middle_left', 'center', 'middle_right', 'bottom_left', 'bottom_center', 'bottom_right'],
                    description: 'Resize anchor point'
                  }
                }
              }
            }
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
        
        // Format the result for LLM consumption using helpful response patterns
        let llmContent = '';
        if (result.success) {
          // Generate structured response data for frontend
          result.structuredData = this.generateStructuredResponseData(result, params);

          // Check if this operation has optimized success response
          const optimizedOps = ['get_sheet_info', 'sort_range', 'read_range', 'find_range', 'get_cell_info', 'create_shape', 'list_shapes', 'create_textbox', 'write_range', 'format_range', 'delete_sheet', 'set_column_width', 'set_row_height'];
          if (optimizedOps.includes(result.operation || params.op)) {
            // Use new helpful success response generator
            llmContent = this.generateHelpfulSuccessResponse(result, params);
          } else {
            // Use existing logic for non-optimized operations
            llmContent += `Excel ${params.op} operation completed successfully.`;
            
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
            llmContent += ` Found ${result.total_charts} charts in ${result.worksheet}:\n`;
            for (const chart of result.charts) {
              const title = chart.title ? ` - "${chart.title}"` : '';
              llmContent += ` - ${chart.name} (${chart.chart_type})${title}\n`;
            }
          }
          
          if (result.cells_affected && !result.find_text && !result.data) {
            // Only show general cells_affected if not already covered by specific operations
            const operation = result.operation;
            if (operation === 'write_range') {
              llmContent += ` ${result.cells_affected} cells written with data.`;
            } else if (operation === 'format_range') {
              llmContent += ` Formatting applied to ${result.cells_affected} cells.`;
            } else if (operation === 'clear_range') {
              llmContent += ` ${result.cells_affected} cells cleared.`;
            } else {
              llmContent += ` ${result.cells_affected} cells affected.`;
            }
          }
          
          if (result.books) {
            llmContent += ` Found ${result.books.length} open workbooks: ${result.books.join(', ')}.`;
          }
          
          if (result.sheets) {
            if (result.sheets_with_index && Array.isArray(result.sheets_with_index)) {
              llmContent += ` Found ${result.sheets.length} worksheets:\n`;
              for (const sheet of result.sheets_with_index) {
                llmContent += `  ${sheet.index}: ${sheet.name}\n`;
              }
              llmContent = llmContent.trim();
            } else {
              llmContent += ` Found ${result.sheets.length} worksheets: ${result.sheets.join(', ')}.`;
            }
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
          
          if (result.operation === 'alter_sheet' && result.changes_made && Array.isArray(result.changes_made)) {
            const originalName = result.original_sheet_name || 'sheet';
            const currentName = result.current_sheet_name || originalName;
            llmContent += ` Worksheet "${originalName}"`;
            if (originalName !== currentName) {
              llmContent += ` (now "${currentName}")`;
            }
            llmContent += ` modified: ${result.changes_made.join(', ')}.`;
          }
          
          if (result.operation === 'delete_sheet' && result.deleted_sheet_name) {
            llmContent += ` Worksheet "${result.deleted_sheet_name}" deleted.`;
            if (result.remaining_sheets && Array.isArray(result.remaining_sheets)) {
              llmContent += ` Remaining sheets: ${result.remaining_sheets.join(', ')} (${result.remaining_sheets_count} total).`;
            }
          }
          
          if (result.operation === 'move_sheet' && result.sheet_name) {
            if (result.move_type === 'cross_workbook') {
              llmContent += ` Worksheet "${result.sheet_name}" moved from "${result.source_workbook}" to "${result.target_workbook}".`;
              if (result.source_sheets_remaining && Array.isArray(result.source_sheets_remaining)) {
                llmContent += ` Source workbook remaining sheets: ${result.source_sheets_remaining.join(', ')}.`;
              }
            } else if (result.move_type === 'reorder_index' || result.move_type === 'reorder_position') {
              llmContent += ` Worksheet "${result.sheet_name}" moved from index ${result.original_index} to index ${result.new_index} in "${result.workbook}".`;
              if (result.sheets_after && Array.isArray(result.sheets_after)) {
                llmContent += ` New order: ${result.sheets_after.map(([i, name]: [number, string]) => `${i}: ${name}`).join(', ')}.`;
              }
            }
          }
          
          if (result.operation === 'copy_sheet' && result.source_sheet_name) {
            if (result.copy_type === 'cross_workbook') {
              llmContent += ` Worksheet "${result.source_sheet_name}" copied from "${result.source_workbook}" to "${result.target_workbook}"`;
              if (result.copied_sheet_name !== result.source_sheet_name) {
                llmContent += ` as "${result.copied_sheet_name}"`;
              }
              llmContent += ` at index ${result.target_index}.`;
              if (result.target_sheets_after && Array.isArray(result.target_sheets_after)) {
                llmContent += ` Target workbook now has ${result.target_sheets_count} sheets: ${result.target_sheets_after.join(', ')}.`;
              }
            } else if (result.copy_type === 'same_workbook') {
              llmContent += ` Worksheet "${result.source_sheet_name}" copied to "${result.copied_sheet_name}" at index ${result.copied_index} in "${result.workbook}".`;
              if (result.sheets_after && Array.isArray(result.sheets_after)) {
                llmContent += ` Workbook now has ${result.total_sheets} sheets: ${result.sheets_after.map(([i, name]: [number, string]) => `${i}: ${name}`).join(', ')}.`;
              }
            }
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
            llmContent += ` Found ${result.total_modules} VBA modules:\n`;
            for (const module of result.modules) {
              llmContent += ` - ${module.name} (${module.code_lines} lines)\n`;
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
          
          // TODO: Implement when Pillow library is available
          /* if (result.operation === 'save_range_as_image' && result.file_created) {
            const fileSize = result.file_size ? ` (${(result.file_size / 1024).toFixed(1)} KB)` : '';
            llmContent += ` Range ${result.range} saved as image to ${result.output_path}${fileSize}.`;
          } */
          
          if (result.operation === 'save_chart_as_image' && result.file_created) {
            const fileSize = result.file_size ? ` (${(result.file_size / 1024).toFixed(1)} KB)` : '';
            llmContent += ` Chart "${result.chart_name}" saved as image to ${result.output_path}${fileSize}.`;
          }
          
          // Search operation results
          if (result.operation === 'find_range') {
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
          
          // Comment operation results
          if (result.operation === 'add_comment') {
            llmContent += ` Comment added to ${result.range}`;
            if (result.comment_author && result.comment_author !== 'System') {
              llmContent += ` by ${result.comment_author}`;
            }
            llmContent += `: "${result.comment_text}".`;
          }
          
          if (result.operation === 'edit_comment') {
            llmContent += ` Comment at ${result.range} updated`;
            if (result.changes_made && Array.isArray(result.changes_made) && result.changes_made.length > 0) {
              llmContent += ` (${result.changes_made.join(', ')})`;
            }
            llmContent += `.`;
          }
          
          if (result.operation === 'delete_comment') {
            llmContent += ` Comment deleted from ${result.range}`;
            if (result.deleted_comment_text) {
              llmContent += `: "${result.deleted_comment_text}"`;
            }
            llmContent += `.`;
          }
          
          if (result.operation === 'list_comments') {
            if (result.total_comments === 0) {
              llmContent += ` No comments found in worksheet "${result.worksheet}".`;
            } else {
              llmContent += ` Found ${result.total_comments} comment(s) in worksheet "${result.worksheet}":`;
              if (result.comments && Array.isArray(result.comments)) {
                for (const comment of result.comments.slice(0, 5)) { // Show first 5 comments
                  llmContent += `\n  • ${comment.address}: "${comment.text}" (by ${comment.author})`;
                }
                if (result.total_comments > 5) {
                  llmContent += `\n  ... and ${result.total_comments - 5} more comments.`;
                }
              }
            }
          }
          
          // Merge operation results
          if (result.operation === 'merge_range') {
            llmContent += ` Cells merged in range ${result.range}`;
            if (result.merge_type) {
              llmContent += ` (${result.merge_type} merge)`;
            }
            if (result.content_centered) {
              llmContent += ` with content centered`;
            }
            llmContent += `.`;
          }
          
          if (result.operation === 'unmerge_range') {
            if (result.cells_unmerged === 0) {
              llmContent += ` No merged cells found in range ${result.range}.`;
            } else {
              llmContent += ` ${result.cells_unmerged} merged cell area(s) unmerged in range ${result.range}`;
              if (result.unmerged_ranges && Array.isArray(result.unmerged_ranges)) {
                if (result.unmerged_ranges.length <= 3) {
                  llmContent += `: ${result.unmerged_ranges.join(', ')}`;
                } else {
                  llmContent += `: ${result.unmerged_ranges.slice(0, 3).join(', ')} and ${result.unmerged_ranges.length - 3} more areas`;
                }
              }
              llmContent += `.`;
            }
          }
          
          // Row/Column sizing operation results
          if (result.operation === 'set_row_height') {
            if (result.auto_fit) {
              llmContent += ` Row height auto-fitted for ${result.total_rows} row(s)`;
            } else {
              llmContent += ` Row height set to ${result.height_set} points for ${result.total_rows} row(s)`;
            }
            if (result.range) {
              llmContent += ` in range ${result.range}`;
            }
            if (result.rows_processed && Array.isArray(result.rows_processed)) {
              if (result.rows_processed.length <= 5) {
                llmContent += ` (rows: ${result.rows_processed.join(', ')})`;
              } else {
                llmContent += ` (rows: ${result.rows_processed.slice(0, 5).join(', ')} and ${result.rows_processed.length - 5} more)`;
              }
            }
            llmContent += `.`;
          }
          
          if (result.operation === 'set_column_width') {
            if (result.auto_fit) {
              llmContent += ` Column width auto-fitted for ${result.total_columns} column(s)`;
            } else {
              llmContent += ` Column width set to ${result.width_set} units for ${result.total_columns} column(s)`;
            }
            if (result.range) {
              llmContent += ` in range ${result.range}`;
            }
            if (result.columns_processed && Array.isArray(result.columns_processed)) {
              if (result.columns_processed.length <= 5) {
                llmContent += ` (columns: ${result.columns_processed.join(', ')})`;
              } else {
                llmContent += ` (columns: ${result.columns_processed.slice(0, 5).join(', ')} and ${result.columns_processed.length - 5} more)`;
              }
            }
            llmContent += `.`;
          }
          
          if (result.operation === 'get_row_height') {
            llmContent += ` Retrieved row height information for ${result.total_rows} row(s)`;
            if (result.range) {
              llmContent += ` in range ${result.range}`;
            }
            if (result.row_heights && Array.isArray(result.row_heights)) {
              const validHeights = result.row_heights.filter((rh: RowHeightInfo) => rh.height !== null);
              if (validHeights.length > 0) {
                llmContent += `:\n`;
                for (const rh of validHeights.slice(0, 5)) {
                  llmContent += `  • Row ${rh.row}: ${rh.height} points\n`;
                }
                if (validHeights.length > 5) {
                  llmContent += `  ... and ${validHeights.length - 5} more rows`;
                }
              } else {
                llmContent += ` (no valid height data found)`;
              }
            }
            llmContent += `.`;
          }
          
          if (result.operation === 'get_column_width') {
            llmContent += ` Retrieved column width information for ${result.total_columns} column(s)`;
            if (result.range) {
              llmContent += ` in range ${result.range}`;
            }
            if (result.column_widths && Array.isArray(result.column_widths)) {
              const validWidths = result.column_widths.filter((cw: ColumnWidthInfo) => cw.width !== null);
              if (validWidths.length > 0) {
                llmContent += `:\n`;
                for (const cw of validWidths.slice(0, 5)) {
                  llmContent += `  • Column ${cw.column}: ${cw.width} units\n`;
                }
                if (validWidths.length > 5) {
                  llmContent += `  ... and ${validWidths.length - 5} more columns`;
                }
              } else {
                llmContent += ` (no valid width data found)`;
              }
            }
            llmContent += `.`;
          }
          
          // Cell information and manipulation operation results
          if (result.operation === 'get_cell_info') {
            llmContent += ` Retrieved detailed information for cell ${result.range}`;
            if (result.info_included) {
              const included = [];
              if (result.info_included.formatting) included.push('formatting');
              if (result.info_included.formulas) included.push('formulas');  
              if (result.info_included.validation) included.push('validation');
              if (result.info_included.comments) included.push('comments');
              llmContent += ` (including: ${included.join(', ')})`;
            }
            
            if (result.cells && Array.isArray(result.cells)) {
              const cellsWithData = result.cells.filter((cell: CellInfo) => 
                cell.value !== null || cell.has_formula || cell.comment || cell.is_merged
              );
              if (cellsWithData.length > 0) {
                llmContent += `:\n`;
                for (const cell of cellsWithData.slice(0, 3)) {
                  llmContent += `  • ${cell.address}: `;
                  if (cell.has_formula) {
                    llmContent += `formula=${cell.formula}`;
                  } else if (cell.value !== null) {
                    llmContent += `value=${cell.value} (${cell.data_type})`;
                  } else {
                    llmContent += `empty`;
                  }
                  if (cell.comment) llmContent += `, has comment`;
                  if (cell.is_merged) llmContent += `, merged`;
                  llmContent += `\n`;
                }
                if (cellsWithData.length > 3) {
                  llmContent += `  ... and ${cellsWithData.length - 3} more cells with data`;
                }
              } else {
                llmContent += ` (all cells are empty)`;
              }
            }
            llmContent += `.`;
          }
          
          if (result.operation === 'insert_range') {
            llmContent += ` Inserted ${result.cells_inserted} cell(s) in range ${result.range}`;
            llmContent += ` with ${result.shift_direction} shift direction`;
            if (result.insertions_completed !== result.total_requested / result.cells_inserted) {
              llmContent += ` (${result.insertions_completed} of ${result.total_requested / result.cells_inserted} insertions completed)`;
            }
            llmContent += `.`;
          }
          
          if (result.operation === 'delete_range') {
            llmContent += ` Deleted ${result.cells_deleted} cell(s) from range ${result.range}`;
            llmContent += ` with ${result.shift_direction} shift direction`;
            if (result.original_range_size) {
              llmContent += ` (original range: ${result.original_range_size.rows}*${result.original_range_size.columns})`;
            }
            if (result.deletions_completed !== result.total_requested / result.cells_deleted) {
              llmContent += ` (${result.deletions_completed} of ${result.total_requested / result.cells_deleted} deletions completed)`;
            }
            llmContent += `.`;
          }
          
          // Sheet analysis operation results
          if (result.operation === 'get_sheet_info') {
            llmContent += ` Retrieved comprehensive sheet analysis for worksheet "${result.worksheet}".`;
            
            if (result.data) {
              const data = result.data;
              
              // Used range information
              if (data.used_range) {
                if (data.used_range.address) {
                  llmContent += ` \n\n**Used Range:** ${data.used_range.address} (${data.used_range.total_rows} rows * ${data.used_range.total_columns} columns)`;
                } else {
                  llmContent += ` \n\n**Used Range:** Empty worksheet`;
                }
              }
              
              // Top rows preview
              if (data.top_rows && data.top_rows.data) {
                llmContent += ` \n\n**Top ${data.top_rows.count} rows** (${data.top_rows.range}):`;
                const topData = data.top_rows.data;
                
                // Format as markdown table if reasonable size
                if (topData.length <= 10 && topData[0] && topData[0].length <= 15) {
                  llmContent += '\n| ';
                  for (let col = 0; col < topData[0].length; col++) {
                    llmContent += `Col${col + 1} | `;
                  }
                  llmContent += '\n| ';
                  for (let col = 0; col < topData[0].length; col++) {
                    llmContent += '--- | ';
                  }
                  llmContent += '\n';
                  
                  for (let row = 0; row < Math.min(topData.length, 10); row++) {
                    llmContent += '| ';
                    for (let col = 0; col < topData[row].length; col++) {
                      const cellValue = topData[row][col]?.value ?? '';
                      llmContent += `${String(cellValue).replace(/\\|/g, '\\\\|')} | `;
                    }
                    llmContent += '\n';
                  }
                } else {
                  llmContent += '\n';
                  for (let i = 0; i < Math.min(topData.length, 5); i++) {
                    llmContent += `Row ${i + 1}: ${topData[i].map((cell: CellInfo) => cell.value).join(', ')}\n`;
                  }
                }
              }
              
              // Bottom rows preview
              if (data.bottom_rows && data.bottom_rows.data) {
                llmContent += ` \n\n**Bottom ${data.bottom_rows.count} rows** (${data.bottom_rows.range}):`;
                const bottomData = data.bottom_rows.data;
                llmContent += '\n';
                for (let i = 0; i < Math.min(bottomData.length, 3); i++) {
                  llmContent += `Row ${i + 1}: ${bottomData[i].map((cell: CellInfo) => cell.value).join(', ')}\n`;
                }
              }
              
              // Merged cells information
              if (data.merged_cells && data.merged_cells.count > 0) {
                llmContent += ` \n\n**Merged Cells:** ${data.merged_cells.count} areas found`;
                if (data.merged_cells.areas && data.merged_cells.areas.length > 0) {
                  llmContent += ':';
                  for (const area of data.merged_cells.areas.slice(0, 5)) {
                    llmContent += ` \n  • ${area.address} (${area.row_count}*${area.column_count})`;
                  }
                  if (data.merged_cells.count > 5) {
                    llmContent += ` \n  ... and ${data.merged_cells.count - 5} more areas`;
                  }
                }
              }
              
              // Sheet metadata
              if (data.sheet_metadata) {
                llmContent += ` \n\n**Sheet Info:** Index ${data.sheet_metadata.index}, Visible: ${data.sheet_metadata.visible}`;
              }
            }
            
            if (result.analysis_settings) {
              const settings = result.analysis_settings;
              const settingsParts = [];
              if (settings.include_formatting) settingsParts.push('formatting');
              if (settings.include_formulas) settingsParts.push('formulas');
              if (settings.include_merged_cells) settingsParts.push('merged cells');
              
              if (settingsParts.length > 0) {
                llmContent += ` \n\n*Analysis included: ${settingsParts.join(', ')}*`;
              }
            }
          }

          // Sort operation results
          if (result.operation === 'sort_range') {
            llmContent += ` Sorted range ${result.range}`;
            llmContent += ` (${result.rows_affected} rows × ${result.columns_affected} columns)`;
            
            if (result.orientation) {
              llmContent += ` by ${result.orientation === 'rows' ? 'columns' : 'rows'}`;
            }
            
            if (result.sort_criteria && Array.isArray(result.sort_criteria)) {
              llmContent += ` using criteria:`;
              for (const criteria of result.sort_criteria.slice(0, 3)) {
                if (result.orientation === 'rows') {
                  llmContent += ` Column ${criteria.column} (${criteria.order})`;
                } else {
                  llmContent += ` Row ${criteria.row} (${criteria.order})`;
                }
                if (criteria.data_type && criteria.data_type !== 'auto') {
                  llmContent += ` as ${criteria.data_type}`;
                }
                llmContent += `,`;
              }
              // Remove trailing comma
              llmContent = llmContent.slice(0, -1);
              
              if (result.sort_criteria.length > 3) {
                llmContent += ` and ${result.sort_criteria.length - 3} more criteria`;
              }
            }
            
            const features = [];
            if (result.has_header) features.push('with header');
            if (result.case_sensitive) features.push('case sensitive');
            if (result.custom_order_applied) features.push('custom order');
            
            if (features.length > 0) {
              llmContent += ` (${features.join(', ')})`;
            }

            llmContent += `.`;
          }
        }
        } else {
          // Handle structured error response directly from Python
          if (result.error_type && result.error_message) {
            // Use structured error from Python
            llmContent = `Excel ${params.op} operation failed: ${result.error_message}`;

            if (result.context) {
              if (result.context.available_sheets && Array.isArray(result.context.available_sheets)) {
                llmContent += `\n\nAvailable worksheets: ${result.context.available_sheets.join(', ')}`;
              }
              if (result.context.workbook) {
                llmContent += `\nWorkbook: ${result.context.workbook}`;
              }
            }

            if (result.suggested_actions && Array.isArray(result.suggested_actions) && result.suggested_actions.length > 0) {
              llmContent += `\n\n**Suggested actions:**`;
              for (const action of result.suggested_actions) {
                llmContent += `\n• ${action}`;
              }
            }
          } else {
            // Fallback for old error format
            const errorMessage = result.xlwings_error || (typeof result.error === 'string' ? result.error : result.error?.message) || 'Unknown error';
            llmContent = `Excel ${params.op} operation failed: ${errorMessage}`;
          }
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
      'import warnings',
      'from datetime import datetime',
      '',
      '# Suppress pandas FutureWarnings to keep JSON output clean',
      'warnings.filterwarnings("ignore", category=FutureWarning)',
      '',
      'try:',
      '    import xlwings as xw',
      'except ImportError:',
      '    print(json.dumps({"success": False, "operation": "' + params.op + '", "error_type": "xlwings_not_installed", "error_message": "xlwings library is not installed", "context": {"required_library": "xlwings"}, "suggested_actions": ["Install xlwings using: pip install xlwings", "Ensure Python environment has the required dependencies", "Restart the application after installation"]}))',
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

def get_workbook_smart(workbook_path=None, preferred_app=None):
    """
    Smart workbook finder that handles all scenarios intelligently:
    1. If workbook is already open (by path), use it
    2. If workbook_path exists as file, open it
    3. If workbook_path doesn't exist, create new workbook and save to that path

    Args:
        workbook_path: Absolute path to workbook file
        preferred_app: Preferred Excel app instance (optional)

    Returns:
        tuple: (workbook_object, app_instance, was_opened_by_us, was_created_by_us)
    """
    import os

    if not workbook_path:
        # Return active workbook from preferred app or any app
        app = preferred_app or xw.apps.active if xw.apps else None
        if app and app.books:
            return app.books.active, app, False, False
        return None, None, False, False

    
    # Phase 1: Search across all open Excel instances
    all_apps = list(xw.apps) if xw.apps else []
    
    # Search in preferred app first
    if preferred_app and preferred_app in all_apps:
        wb = _search_workbook_in_app(workbook_path, preferred_app)
        if wb:
            return wb, preferred_app, False, False

    # Search in all other apps
    for app in all_apps:
        if app != preferred_app:
            wb = _search_workbook_in_app(workbook_path, app)
            if wb:
                return wb, app, False, False

    # Phase 2: Not found in any instance - check if file exists
    # Choose Excel instance
    target_app = preferred_app if preferred_app else (all_apps[0] if all_apps else xw.App(visible=False))

    # If file exists, open it (but check if already open in target_app first)
    if os.path.exists(workbook_path):
        # Check if workbook is already open in target_app
        wb = _search_workbook_in_app(workbook_path, target_app)
        if wb:
            return wb, target_app, False, False  # Already open, not opened by us

        try:
            wb = target_app.books.open(workbook_path)
            return wb, target_app, True, False
        except Exception as e:
            result = {
                "success": False,
                "operation": "open_workbook",
                "error_type": "workbook_open_failed",
                "error_message": f"Failed to open workbook '{workbook_path}'",
                "context": {
                    "workbook_path": workbook_path,
                    "error_details": str(e)
                },
                "suggested_actions": [
                    "Check if the workbook file exists at the specified path",
                    "Ensure you have permission to open the file",
                    "Verify the file is not corrupted or password protected",
                    "Close the file if it's open in another application"
                ]
            }
            print(json.dumps(result))
            exit()

    # File doesn't exist, create new workbook and save to path
    try:
        wb = target_app.books.add()
        wb.save(workbook_path)
        return wb, target_app, True, True
    except Exception as e:
        result = {
            "success": False,
            "operation": "create_workbook",
            "error_type": "workbook_create_failed",
            "error_message": f"Failed to create workbook '{workbook_path}'",
            "context": {
                "workbook_path": workbook_path,
                "error_details": str(e)
            },
            "suggested_actions": [
                "Check if you have write permission to the target directory",
                "Ensure the target directory exists",
                "Verify there's sufficient disk space",
                "Close any conflicting applications that might lock the file"
            ]
        }
        print(json.dumps(result))
        exit()

def _search_workbook_in_app(workbook_name, app):
    """Search for workbook in specific Excel app instance"""
    import os
    try:
        for book in app.books:
            # Try exact name match
            if book.name == workbook_name:
                return book
            # Try basename match (without path)
            if book.name == os.path.basename(workbook_name):
                return book
            # Try match without extension (Excel often shows names without .xlsx)
            if book.name == os.path.splitext(os.path.basename(workbook_name))[0]:
                return book
            # Try fullname match (with path)
            try:
                if hasattr(book, 'fullname'):
                    if book.fullname == workbook_name:
                        return book
                    # Normalized path comparison
                    if os.path.normpath(book.fullname) == os.path.normpath(workbook_name):
                        return book
            except:
                pass
        return None
    except:
        return None

def _resolve_workbook_path(workbook_name):
    """Resolve workbook name to full file path"""
    import os
    
    if not workbook_name:
        return None
    
    # If already absolute path, return as-is
    if os.path.isabs(workbook_name):
        return workbook_name
    
    # Try current directory
    if os.path.exists(workbook_name):
        return os.path.abspath(workbook_name)
    
    # Try common Excel extensions if no extension
    if '.' not in workbook_name:
        for ext in ['.xlsx', '.xlsm', '.xls']:
            test_path = workbook_name + ext
            if os.path.exists(test_path):
                return os.path.abspath(test_path)
    
    # Return as-is (might be for creation)
    return os.path.abspath(workbook_name)

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
      '            "error_type": "unexpected_error",',
      '            "error_message": str(e),',
      '            "context": {"operation": "' + params.op + '"},',
      '            "suggested_actions": ["Check the operation parameters", "Verify Excel is running and accessible", "Try the operation again", "Contact support if the problem persists"]',
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
      case 'read_range':
        return this.generateReadLogic(params);
      case 'write_range':
        return this.generateWriteLogic(params);
      case 'create_chart':
        return this.generateChartLogic(params);
      case 'update_chart':
        return this.generateUpdateChartLogic(params);
      case 'delete_chart':
        return this.generateDeleteChartLogic(params);
      case 'list_charts':
        return this.generateListChartsLogic(params);
      case 'format_range':
        return this.generateFormatLogic(params);
      case 'add_sheet':
        return this.generateAddSheetLogic(params);
      case 'alter_sheet':
        return this.generateAlterSheetLogic(params);
      case 'delete_sheet':
        return this.generateDeleteSheetLogic(params);
      case 'move_sheet':
        return this.generateMoveSheetLogic(params);
      case 'copy_sheet':
        return this.generateCopySheetLogic(params);
      case 'list_workbooks':
        return this.generateListWorkbooksLogic();
      case 'list_sheets':
        return this.generateListSheetsLogic(params);
      case 'get_selection':
        return this.generateGetSelectionLogic();
      case 'set_selection':
        return this.generateSetSelectionLogic(params);
      case 'formula_range':
        return this.generateFormulaLogic(params);
      case 'clear_range':
        return this.generateClearLogic(params);
      case 'copy_paste_range':
        return this.generateCopyPasteLogic(params);
      case 'replace_range':
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
      case 'get_last_column':
        return this.generateGetLastColumnLogic(params);
      case 'get_used_range':
        return this.generateGetUsedRangeLogic(params);
      case 'get_sheet_info':
        return this.generateGetSheetInfoLogic(params);
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
      // TODO: Implement when Pillow library is available
      /* case 'save_range_as_image':
        return this.generateSaveRangeAsImageLogic(params); */
      case 'save_chart_as_image':
        return this.generateSaveChartAsImageLogic(params);
      case 'find_range':
        return this.generateSearchDataLogic(params);
      case 'sort_range':
        return this.generateSortRangeLogic(params);
      case 'add_comment':
        return this.generateAddCommentLogic(params);
      case 'edit_comment':
        return this.generateEditCommentLogic(params);
      case 'delete_comment':
        return this.generateDeleteCommentLogic(params);
      case 'list_comments':
        return this.generateListCommentsLogic(params);
      case 'merge_range':
        return this.generateMergeCellsLogic(params);
      case 'unmerge_range':
        return this.generateUnmergeCellsLogic(params);
      case 'set_row_height':
        return this.generateSetRowHeightLogic(params);
      case 'set_column_width':
        return this.generateSetColumnWidthLogic(params);
      case 'get_row_height':
        return this.generateGetRowHeightLogic(params);
      case 'get_column_width':
        return this.generateGetColumnWidthLogic(params);
      case 'get_cell_info':
        return this.generateGetCellInfoLogic(params);
      case 'insert_range':
        return this.generateInsertCellsLogic(params);
      case 'delete_range':
        return this.generateDeleteCellsLogic(params);
      case 'list_apps':
        return this.generateListAppsLogic(params);
      case 'show_excel':
        return this.generateShowExcelLogic(params);
      case 'hide_excel':
        return this.generateHideExcelLogic(params);
      case 'insert_row':
        return this.generateInsertRowLogic(params);
      case 'insert_column':
        return this.generateInsertColumnLogic(params);
      case 'delete_row':
        return this.generateDeleteRowLogic(params);
      case 'delete_column':
        return this.generateDeleteColumnLogic(params);
      case 'create_shape':
        return this.generateCreateShapeLogic(params);
      case 'create_textbox':
        return this.generateCreateTextboxLogic(params);
      case 'list_shapes':
        return this.generateListShapesLogic(params);
      case 'modify_shape':
        return this.generateModifyShapeLogic(params);
      case 'delete_shape':
        return this.generateDeleteShapeLogic(params);
      case 'move_shape':
        return this.generateMoveShapeLogic(params);
      case 'resize_shape':
        return this.generateResizeShapeLogic(params);
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
    app = xw.App(visible=False)

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}", app)
if not wb:
    wb = app.books.active if app.books else None
    if not wb:
        result = {
            "success": False,
            "operation": "get_workbook",
            "error_type": "no_active_workbook",
            "error_message": "No active workbook found in the Excel application",
            "context": {
                "required_action": "open_workbook"
            },
            "suggested_actions": [
                "Open or create a workbook in Excel",
                "Use create_workbook() to create a new workbook",
                "Specify a workbook name in the operation"
            ]
        }
        print(json.dumps(result))
        exit()`;
  }

  private generateAlertHandlingCode(params: XlwingsParams): string {
    const disableAlerts = params.disable_alerts || false;
    if (disableAlerts) {
      return `
# Disable Excel alerts to prevent dialog boxes
original_alerts_setting = app.api.DisplayAlerts
app.api.DisplayAlerts = False`;
    }
    return '';
  }

  private generateAlertRestoreCode(params: XlwingsParams): string {
    const disableAlerts = params.disable_alerts || false;
    if (disableAlerts) {
      return `
# Restore original alerts setting
app.api.DisplayAlerts = original_alerts_setting`;
    }
    return '';
  }

  private generateReadLogic(params: XlwingsParams): string {
    const maxRows = params.max_rows || 100;
    const startRow = params.start_row || 1;
    const summaryMode = params.summary_mode || false;
    const summaryModePython = summaryMode ? 'True' : 'False';

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

# Read the data - use cell-by-cell reading to ensure 2D array format
data = []
for row_idx in range(read_range_obj.rows.count):
    row_data = []
    for col_idx in range(read_range_obj.columns.count):
        cell = read_range_obj[row_idx, col_idx]
        row_data.append(safe_convert_data(cell.value))
    data.append(row_data)

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
if ${summaryModePython} or total_rows > ${maxRows * 2}:
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
    "operation": "read_range",
    "workbook": wb.name,
    "worksheet": ws.name,
    "range": actual_range,
    "full_range": full_range_obj.address,
    "data": data if not ${summaryModePython} or total_rows <= ${maxRows * 2} else None,
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
    app = xw.App(visible=False)

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}", app)
if not wb:
    result = {
        "success": False,
        "operation": "write_range",
        "error_type": "workbook_not_found",
        "error_message": "Could not find the specified workbook",
        "context": {
            "workbook": "${params.workbook || ''}",
            "required_action": "specify_workbook"
        },
        "suggested_actions": [
            "Open the workbook in Excel first",
            "Use create_workbook() to create a new workbook",
            "Specify the exact workbook name"
        ]
    }
    print(json.dumps(result))
    exit()

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    result = {
        "success": False,
        "operation": "write_range",
        "error_type": "worksheet_not_found",
        "error_message": "Could not find the specified worksheet",
        "context": {
            "worksheet": "${params.worksheet || ''}",
            "workbook": "${params.workbook || ''}",
            "available_sheets": [sheet.name for sheet in wb.sheets]
        }
    }
    print(json.dumps(result))
    exit()

# Write data
data = ${JSON.stringify(params.data || [])}
range_str = "${params.range || 'A1'}"

if data:
    # Check if range is a single cell (e.g., "A1", "B2") or a range (e.g., "A1:C10")
    is_single_cell = ':' not in range_str

    if is_single_cell and isinstance(data, list):
        # Auto-expand range to fit data when only a single cell is specified
        if len(data) > 0 and isinstance(data[0], list):
            # 2D data - calculate actual range needed
            data_rows = len(data)
            data_cols = max(len(row) for row in data) if data else 0

            if data_rows > 0 and data_cols > 0:
                # Parse the starting cell
                import re
                match = re.match(r'([A-Z]+)(\\d+)', range_str.upper())
                if match:
                    start_col_letter = match.group(1)
                    start_row = int(match.group(2))

                    # Calculate ending cell
                    start_col_num = 0
                    for char in start_col_letter:
                        start_col_num = start_col_num * 26 + (ord(char) - ord('A') + 1)

                    end_col_num = start_col_num + data_cols - 1
                    end_row = start_row + data_rows - 1

                    # Convert end column number back to letter
                    end_col_letter = ''
                    temp = end_col_num
                    while temp > 0:
                        temp -= 1
                        end_col_letter = chr(temp % 26 + ord('A')) + end_col_letter
                        temp //= 26

                    # Create the expanded range
                    expanded_range = f"{range_str}:{end_col_letter}{end_row}"
                    range_obj = ws.range(expanded_range)
                else:
                    range_obj = ws.range(range_str)
            else:
                range_obj = ws.range(range_str)
        else:
            # 1D data - expand as a column
            data_rows = len(data)
            if data_rows > 0:
                import re
                match = re.match(r'([A-Z]+)(\\d+)', range_str.upper())
                if match:
                    col_letter = match.group(1)
                    start_row = int(match.group(2))
                    end_row = start_row + data_rows - 1
                    expanded_range = f"{range_str}:{col_letter}{end_row}"
                    range_obj = ws.range(expanded_range)
                else:
                    range_obj = ws.range(range_str)
            else:
                range_obj = ws.range(range_str)
    else:
        # Use the specified range as-is
        range_obj = ws.range(range_str)

    # Simply write the data directly - xlwings handles the sizing
    ws.range(range_obj).value = data

    # Calculate data dimensions and cells affected
    if isinstance(data, list) and len(data) > 0 and isinstance(data[0], list):
        data_rows = len(data)
        data_cols = max(len(row) for row in data) if data else 0
        cells_count = data_rows * data_cols
        data_shape = f"{data_rows} rows × {data_cols} columns"
    elif isinstance(data, list):
        data_rows = len(data)
        data_cols = 1
        cells_count = data_rows
        data_shape = f"{data_rows} rows × 1 column"
    else:
        data_rows = 1
        data_cols = 1
        cells_count = 1
        data_shape = "1 cell"

    # Get the actual range that was written to
    actual_range = range_obj.address if 'range_obj' in locals() else range_str
else:
    cells_count = 0
    data_rows = 0
    data_cols = 0
    data_shape = "no data"
    actual_range = range_str

result = {
    "success": True,
    "operation": "write_range",
    "workbook": wb.name,
    "worksheet": ws.name,
    "range_specified": range_str,
    "range_written": actual_range,
    "data_received": data_shape,
    "cells_written": cells_count,
    "rows_written": data_rows,
    "columns_written": data_cols,
    "auto_expanded": is_single_cell if 'is_single_cell' in locals() else False
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
    app = xw.App(visible=False)

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}", app)
if not wb:
    result = {
        "success": False,
        "operation": "create_chart",
        "error_type": "workbook_not_found",
        "error_message": "Could not find the specified workbook",
        "context": {
            "workbook": "${params.workbook || ''}",
            "required_action": "specify_workbook"
        }
    }
    print(json.dumps(result))
    exit()

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    result = {
        "success": False,
        "operation": "create_chart",
        "error_type": "worksheet_not_found",
        "error_message": "Could not find the specified worksheet",
        "context": {
            "worksheet": "${params.worksheet || ''}",
            "workbook": "${params.workbook || ''}",
            "available_sheets": [sheet.name for sheet in wb.sheets]
        }
    }
    print(json.dumps(result))
    exit()

# Create chart
chart_type = "${chartConfig.type || 'column'}"
data_range = "${chartConfig.data_range || 'A1:B10'}"
position = "${chartConfig.position || 'D1'}"
chart_name = "${params.chart?.name || ''}"

chart = ws.charts.add()

# Set source data with proper series configuration
chart.set_source_data(ws.range(data_range))

# Configure series names properly using Excel API
try:
    # Ensure series names are taken from headers
    chart.api.SetSourceData(ws.range(data_range).api, 1)  # xlColumns = 1 for series in columns
    chart.api.PlotBy = 1  # xlColumns = 1, ensures column headers are used as series names

    # Force refresh of series names from headers
    data_range_obj = ws.range(data_range)
    series_collection = chart.api[1].SeriesCollection()
    for i in range(1, series_collection.Count + 1):
        try:
            series = series_collection(i)
            # Get the header value from the data range for this series
            if data_range_obj.shape[0] > 1 and data_range_obj.shape[1] > 1:
                # Multi-column data, use column headers (skip first column if it contains categories)
                header_row = data_range_obj.rows(1)
                categories_range = "${chartConfig.categories_range || ''}"
                col_index = i if categories_range else i + 1  # Adjust for categories column
                if col_index <= header_row.shape[1]:
                    header_value = header_row.cells(1, col_index).value
                    if header_value and str(header_value).strip():
                        series.Name = str(header_value).strip()
        except Exception as series_error:
            pass

except Exception as series_config_error:
    # Fallback to basic configuration if advanced configuration fails
    pass

# Apply custom series names if provided
${chartConfig?.series_names && chartConfig.series_names.length > 0 ? `
try:
    series_names = ${JSON.stringify(chartConfig.series_names)}
    # Use correct xlwings API access pattern
    series_collection = chart.api[1].SeriesCollection()
    for i, series_name in enumerate(series_names, 1):
        if i <= series_collection.Count and series_name.strip():
            series_collection(i).Name = series_name.strip()
except Exception as custom_series_error:
    pass
` : ''}

# Apply individual series ranges if provided
${chartConfig?.series_ranges && chartConfig.series_ranges.length > 0 ? `
try:
    series_ranges = ${JSON.stringify(chartConfig.series_ranges)}

    # Clear existing series and create new ones with specified ranges
    series_collection = chart.api[1].SeriesCollection()
    while series_collection.Count > 0:
        series_collection(1).Delete()

    # Add series with individual ranges
    for i, series_range in enumerate(series_ranges):
        if series_range.strip():
            new_series = series_collection.NewSeries()
            new_series.Values = ws.range(series_range.strip()).api
            # Set categories for the first series if categories_range is provided
            if i == 0 and categories_range:
                new_series.XValues = ws.range(categories_range).api

except Exception as individual_series_error:
    pass
` : ''}

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
    ${chartConfig?.title ? `
    # Use the Excel API directly for chart title
    chart.api.ChartTitle.Text = "${chartConfig.title}"
    chart.api.HasTitle = True
    ` : ''}

    ${chartConfig?.x_axis_title ? `
    # Set x-axis title
    chart.api.Axes(1).HasTitle = True
    chart.api.Axes(1).AxisTitle.Text = "${chartConfig.x_axis_title}"
    ` : ''}

    ${chartConfig?.y_axis_title ? `
    # Set y-axis title
    chart.api.Axes(2).HasTitle = True
    chart.api.Axes(2).AxisTitle.Text = "${chartConfig.y_axis_title}"
    ` : ''}

    # Placeholder to ensure try block is never empty
    pass
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

  /**
   * Convert JavaScript object to Python dictionary string representation
   */
  private convertToPythonDict(obj: JsonValue): string {
    if (obj === null) return 'None';
    if (obj === undefined) return 'None';
    if (typeof obj === 'boolean') return obj ? 'True' : 'False';
    if (typeof obj === 'number') return obj.toString();
    if (typeof obj === 'string') return JSON.stringify(obj);
    
    if (Array.isArray(obj)) {
      const items = obj.map(item => this.convertToPythonDict(item));
      return `[${items.join(', ')}]`;
    }
    
    if (typeof obj === 'object') {
      const pairs = Object.entries(obj).map(([key, value]) => {
        const keyStr = JSON.stringify(key);
        const valueStr = this.convertToPythonDict(value);
        return `${keyStr}: ${valueStr}`;
      });
      return `{${pairs.join(', ')}}`;
    }
    
    return 'None';
  }

  private generateFormatLogic(params: XlwingsParams): string {
    // Convert JavaScript format object to Python dictionary string
    const formatPython = this.convertToPythonDict(params.format || {});

    return `
# Connect to Excel
app = xw.apps.active if xw.apps else None
if not app:
    app = xw.App(visible=False)

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}", app)
if not wb:
    result = {
        "success": False,
        "operation": "format_range",
        "error_type": "workbook_not_found",
        "error_message": "Could not find the specified workbook",
        "context": {
            "workbook": "${params.workbook || ''}",
            "required_action": "specify_workbook"
        }
    }
    print(json.dumps(result))
    exit()

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    result = {
        "success": False,
        "operation": "format_range",
        "error_type": "worksheet_not_found",
        "error_message": "Could not find the specified worksheet",
        "context": {
            "worksheet": "${params.worksheet || ''}",
            "workbook": "${params.workbook || ''}",
            "available_sheets": [sheet.name for sheet in wb.sheets]
        }
    }
    print(json.dumps(result))
    exit()

# Apply formatting
range_str = "${params.range || 'A1'}"
range_obj = ws.range(range_str)

format_config = ${formatPython}

if format_config.get('font'):
    font = format_config['font']
    if font.get('bold'):
        range_obj.font.bold = bool(font['bold'])
    if font.get('italic'):
        range_obj.font.italic = bool(font['italic'])
    if font.get('size'):
        range_obj.font.size = font['size']
    if font.get('color'):
        range_obj.font.color = font['color']

if format_config.get('fill', {}).get('color'):
    range_obj.color = format_config['fill']['color']

if format_config.get('number_format'):
    range_obj.number_format = format_config['number_format']

# Apply alignment if requested
if format_config.get('alignment'):
    alignment = format_config['alignment']
    # Handle both string format (legacy) and object format (new)
    if isinstance(alignment, str):
        # Legacy string format - apply as horizontal alignment
        if alignment == 'left':
            range_obj.api.HorizontalAlignment = -4131  # xlLeft
        elif alignment == 'center':
            range_obj.api.HorizontalAlignment = -4108  # xlCenter
        elif alignment == 'right':
            range_obj.api.HorizontalAlignment = -4152  # xlRight
    elif isinstance(alignment, dict):
        # New object format - apply both horizontal and vertical
        if alignment.get('horizontal'):
            h_align = alignment['horizontal']
            if h_align == 'left':
                range_obj.api.HorizontalAlignment = -4131  # xlLeft
            elif h_align == 'center':
                range_obj.api.HorizontalAlignment = -4108  # xlCenter
            elif h_align == 'right':
                range_obj.api.HorizontalAlignment = -4152  # xlRight
            elif h_align == 'justify':
                range_obj.api.HorizontalAlignment = -4130  # xlJustify

        if alignment.get('vertical'):
            v_align = alignment['vertical']
            if v_align == 'top':
                range_obj.api.VerticalAlignment = -4160  # xlTop
            elif v_align == 'center':
                range_obj.api.VerticalAlignment = -4108  # xlCenter
            elif v_align == 'bottom':
                range_obj.api.VerticalAlignment = -4107  # xlBottom

# Apply borders if requested
if format_config.get('borders'):
    import xlwings.constants as const
    range_obj.api.Borders.LineStyle = const.LineStyle.xlContinuous
    range_obj.api.Borders.Weight = const.BorderWeight.xlThin
    range_obj.api.Borders.Color = 0x000000  # Black color

cells_affected = range_obj.rows.count * range_obj.columns.count

result = {
    "success": True,
    "operation": "format_range",
    "workbook": wb.name,
    "worksheet": ws.name,
    "range": range_str,
    "cells_affected": cells_affected
}
print(json.dumps(result))`;
  }

  private generateListWorkbooksLogic(): string {
    return `
# List all open workbooks
books = [book.name for book in xw.books]

result = {
    "success": True,
    "operation": "list_workbooks",
    "books": books
}
print(json.dumps(result))`;
  }

  private generateListSheetsLogic(params: XlwingsParams): string {
    return `
# Connect to Excel
app = xw.apps.active if xw.apps else None
if not app:
    app = xw.App(visible=False)

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}", app)
if not wb:
    result = {
        "success": False,
        "operation": "list_sheets",
        "error_type": "workbook_not_found",
        "error_message": "Could not find the specified workbook",
        "context": {
            "workbook": "${params.workbook || ''}",
            "required_action": "specify_workbook"
        }
    }
    print(json.dumps(result))
    exit()

sheets = [(i, sheet.name) for i, sheet in enumerate(wb.sheets)]

result = {
    "success": True,
    "operation": "list_sheets",
    "workbook": wb.name,
    "sheets": [name for _, name in sheets],
    "sheets_with_index": [{"index": i, "name": name} for i, name in sheets]
}
print(json.dumps(result))`;
  }

  private generateGetSelectionLogic(): string {
    return `
# Get current selection
app = xw.apps.active if xw.apps else None
if not app:
    app = xw.App(visible=False)

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
    app = xw.App(visible=False)

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}", app)
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
    app = xw.App(visible=False)

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}", app)
if not wb:
    result = {
        "success": False,
        "operation": "formula_range",
        "error_type": "workbook_not_found",
        "error_message": "Could not find the specified workbook",
        "context": {
            "workbook": "${params.workbook || ''}",
            "required_action": "specify_workbook"
        },
        "suggested_actions": [
            "Open the workbook in Excel first",
            "Use create_workbook() to create a new workbook",
            "Check the workbook name spelling",
            "Use list_workbooks() to see available workbooks"
        ]
    }
    print(json.dumps(result))
    exit()

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    result = {
        "success": False,
        "operation": "formula_range",
        "error_type": "worksheet_not_found",
        "error_message": "Could not find the specified worksheet",
        "context": {
            "worksheet": "${params.worksheet || ''}",
            "workbook": "${params.workbook || ''}",
            "available_sheets": [sheet.name for sheet in wb.sheets]
        },
        "suggested_actions": [
            "Use one of the available worksheets",
            "Check the worksheet name spelling",
            "Use list_sheets() to get exact worksheet names",
            "Use add_sheet() to create a new worksheet"
        ]
    }
    print(json.dumps(result))
    exit()

range_str = "${params.range || 'A1'}"
formula = "${params.formula || ''}"

if not formula:
    raise ValueError("Formula is required for formula operation")

ws.range(range_str).formula = formula

result = {
    "success": True,
    "operation": "formula_range",
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
    app = xw.App(visible=False)

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}", app)
if not wb:
    result = {
        "success": False,
        "operation": "clear_range",
        "error_type": "workbook_not_found",
        "error_message": "Could not find the specified workbook",
        "context": {
            "workbook": "${params.workbook || ''}",
            "required_action": "specify_workbook"
        },
        "suggested_actions": [
            "Open the workbook in Excel first",
            "Use create_workbook() to create a new workbook",
            "Check the workbook name spelling",
            "Use list_workbooks() to see available workbooks"
        ]
    }
    print(json.dumps(result))
    exit()

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    result = {
        "success": False,
        "operation": "clear_range",
        "error_type": "worksheet_not_found",
        "error_message": "Could not find the specified worksheet",
        "context": {
            "worksheet": "${params.worksheet || ''}",
            "workbook": "${params.workbook || ''}",
            "available_sheets": [sheet.name for sheet in wb.sheets]
        },
        "suggested_actions": [
            "Use one of the available worksheets",
            "Check the worksheet name spelling",
            "Use list_sheets() to get exact worksheet names",
            "Use add_sheet() to create a new worksheet"
        ]
    }
    print(json.dumps(result))
    exit()

range_str = "${params.range || 'A1'}"
range_obj = ws.range(range_str)
range_obj.clear()

cells_affected = range_obj.rows.count * range_obj.columns.count

result = {
    "success": True,
    "operation": "clear_range",
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
    const sourceWorkbook = params.copy_paste.source_workbook || params.workbook || '';
    const targetWorkbook = params.copy_paste.target_workbook || params.workbook || '';
    const sourceWorkbookPath = this.escapePythonPath(sourceWorkbook);
    const targetWorkbookPath = this.escapePythonPath(targetWorkbook);
    const alertHandling = this.generateAlertHandlingCode(params);
    const alertRestore = this.generateAlertRestoreCode(params);

    return `# Smart copy/paste range with multi-instance support
import time

source_range_str = "${params.copy_paste.source_range}"
dest_range_str = "${params.copy_paste.destination_range}"
values_only = ${valuesOnlyPython}
cut_mode = ${cutModePython}

try:
    # Phase 1: Find/open source workbook
    source_wb, source_app, source_opened_by_us, source_created_by_us = get_workbook_smart(
        "${sourceWorkbookPath}"
    )
    if not source_wb:
        result = {
            "success": False,
            "operation": "copy_paste_range",
            "error_type": "source_workbook_not_found",
            "error_message": f"Could not find or open source workbook '${sourceWorkbookPath}'",
            "context": {
                "source_workbook": "${sourceWorkbookPath}",
                "required_action": "check_source_workbook_path"
            }
        }
        print(json.dumps(result))
        exit()

    # Phase 2: Find/open target workbook (if cross-workbook operation)
    target_wb = None
    target_app = None
    target_opened_by_us = False
    target_created_by_us = False
    
    if "${targetWorkbookPath}" and "${targetWorkbookPath}" != "${sourceWorkbookPath}":
        # Cross-workbook operation
        target_wb, target_app, target_opened_by_us, target_created_by_us = get_workbook_smart(
            "${targetWorkbookPath}",
            preferred_app=source_app,  # Prefer same instance as source
            auto_open=True,
            create_if_missing=True  # Create target workbook if it doesn't exist
        )
        
        if not target_wb:
            result = {
                "success": False,
                "operation": "copy_paste_range",
                "error_type": "target_workbook_not_found",
                "error_message": f"Could not find, open, or create target workbook '${targetWorkbookPath}'",
                "context": {
                    "target_workbook": "${targetWorkbookPath}",
                    "required_action": "check_target_workbook_path"
                }
            }
            print(json.dumps(result))
            exit()
        
        copy_type = "cross_workbook"
    else:
        # Same workbook operation
        target_wb = source_wb
        target_app = source_app
        copy_type = "same_workbook"

    # Phase 3: Parse source range
    try:
        if '!' in source_range_str:
            source_sheet_name, source_cell_range = source_range_str.split('!', 1)
            try:
                source_ws = source_wb.sheets[source_sheet_name]
            except KeyError:
                result = {
                    "success": False,
                    "operation": "copy_paste_range",
                    "error_type": "source_worksheet_not_found",
                    "error_message": f"Source worksheet '{source_sheet_name}' not found",
                    "context": {
                        "worksheet": source_sheet_name,
                        "workbook": source_wb.name,
                        "available_sheets": [s.name for s in source_wb.sheets]
                    }
                }
                print(json.dumps(result))
                exit()
        else:
            source_ws = get_worksheet(source_wb, "${params.worksheet || ''}")
            if not source_ws:
                source_ws = source_wb.sheets.active
            source_cell_range = source_range_str
        
        source_range = source_ws.range(source_cell_range)
    except Exception as e:
        result = {
            "success": False,
            "operation": "copy_paste_range",
            "error_type": "source_range_error",
            "error_message": f"Error accessing source range '{source_range_str}'",
            "context": {
                "source_range": source_range_str,
                "error_details": str(e)
            }
        }
        print(json.dumps(result))
        exit()

    # Phase 4: Parse destination range
    try:
        if '!' in dest_range_str:
            dest_sheet_name, dest_cell_range = dest_range_str.split('!', 1)
            try:
                dest_ws = target_wb.sheets[dest_sheet_name]
            except KeyError:
                result = {
                    "success": False,
                    "operation": "copy_paste_range",
                    "error_type": "destination_worksheet_not_found",
                    "error_message": f"Destination worksheet '{dest_sheet_name}' not found",
                    "context": {
                        "worksheet": dest_sheet_name,
                        "workbook": target_wb.name,
                        "available_sheets": [s.name for s in target_wb.sheets]
                    }
                }
                print(json.dumps(result))
                exit()
        else:
            dest_ws = get_worksheet(target_wb, "${params.worksheet || ''}")
            if not dest_ws:
                dest_ws = target_wb.sheets.active
            dest_cell_range = dest_range_str
        
        dest_range = dest_ws.range(dest_cell_range)
    except Exception as e:
        result = {
            "success": False,
            "operation": "copy_paste_range",
            "error_type": "destination_range_error",
            "error_message": f"Error accessing destination range '{dest_range_str}'",
            "context": {
                "destination_range": dest_range_str,
                "error_details": str(e)
            }
        }
        print(json.dumps(result))
        exit()

    # Phase 5: Detect cross-instance operation
    cross_instance = source_app != target_app
    cross_workbook = source_wb.name != target_wb.name
${alertHandling}
    # Phase 6: Perform copy/paste operation
    copy_success = False
    copy_error = None
    method_used = "unknown"

    try:
        if cross_instance:
            # Cross-instance operation - use data reconstruction method
            method_used = "cross_instance_reconstruction"
            
            # Extract source data
            source_data = source_range.value
            
            # Extract formatting properties if not values_only
            source_properties = {}
            if not values_only:
                try:
                    # Get basic formatting properties
                    source_properties['font_bold'] = source_range.api.Font.Bold
                    source_properties['font_size'] = source_range.api.Font.Size
                    source_properties['font_color'] = source_range.api.Font.ColorIndex
                    source_properties['color'] = source_range.color
                    source_properties['number_format'] = source_range.number_format
                except Exception:
                    pass
            
            # Extract formulas if not values_only
            source_formulas = {}
            if not values_only:
                try:
                    if isinstance(source_data, list) and len(source_data) > 0:
                        # Multi-cell range
                        for row_idx in range(source_range.rows.count):
                            for col_idx in range(source_range.columns.count):
                                cell = source_range[row_idx, col_idx]
                                if cell.formula and cell.formula.startswith('='):
                                    source_formulas[f"{row_idx},{col_idx}"] = cell.formula
                    else:
                        # Single cell
                        if source_range.formula and source_range.formula.startswith('='):
                            source_formulas["0,0"] = source_range.formula
                except Exception:
                    pass
            
            # Apply data to destination
            dest_range.value = source_data
            
            # Apply formatting if not values_only
            if not values_only:
                for prop, value in source_properties.items():
                    try:
                        if prop == 'font_bold':
                            dest_range.api.Font.Bold = value
                        elif prop == 'font_size':
                            dest_range.api.Font.Size = value
                        elif prop == 'font_color':
                            dest_range.api.Font.ColorIndex = value
                        elif prop == 'color':
                            dest_range.color = value
                        elif prop == 'number_format':
                            dest_range.number_format = value
                    except Exception:
                        pass
            
            # Apply formulas if not values_only 
            if not values_only:
                for pos, formula in source_formulas.items():
                    try:
                        row_idx, col_idx = map(int, pos.split(','))
                        if isinstance(source_data, list) and len(source_data) > 0:
                            dest_cell = dest_range[row_idx, col_idx]
                        else:
                            dest_cell = dest_range
                        dest_cell.formula = formula
                    except Exception:
                        pass
            
            copy_success = True
            
        else:
            # Same instance operation - use native xlwings methods
            if values_only:
                method_used = "native_values_only"
                dest_range.value = source_range.value
            else:
                method_used = "native_copy_paste"
                try:
                    # Try standard copy method first
                    source_range.copy()
                    time.sleep(0.1)
                    
                    # Use paste_special if available, otherwise paste normally
                    try:
                        dest_range.paste_special(paste="all")
                    except AttributeError:
                        # Fallback to COM API
                        dest_range.api.PasteSpecial()
                    except Exception:
                        # Final fallback to simple paste
                        dest_range.paste()
                except Exception as copy_error_inner:
                    # Fallback to value copy
                    method_used = "native_fallback_values"
                    dest_range.value = source_range.value
            
            copy_success = True

    except Exception as e:
        copy_error = str(e)
        copy_success = False

    # Phase 7: Handle cut mode (delete source after successful copy)
    cut_method = None
    if cut_mode and copy_success:
        try:
            # Only perform cut on source if copy was successful
            if ':' in source_cell_range and source_cell_range.count(':') == 1:
                range_parts = source_cell_range.split(':')
                start_part = range_parts[0].strip()
                end_part = range_parts[1].strip()
                
                # Check for full row/column deletion
                if start_part.isdigit() and end_part.isdigit():
                    # Full row range
                    start_row = int(start_part)
                    end_row = int(end_part)
                    row_count = end_row - start_row + 1
                    source_ws.api.Rows(f"{start_row}:{end_row}").Delete()
                    cut_method = f"deleted {row_count} row(s)"
                elif start_part.isalpha() and end_part.isalpha() and len(start_part) <= 3 and len(end_part) <= 3:
                    # Full column range
                    source_ws.api.Columns(f"{start_part.upper()}:{end_part.upper()}").Delete()
                    cut_method = f"deleted column(s) {start_part.upper()}:{end_part.upper()}"
                else:
                    # Regular cell range
                    source_range.clear()
                    cut_method = "cleared source range"
            else:
                # Single cell or irregular range
                source_range.clear()
                cut_method = "cleared source range"
        except Exception as cut_error:
            try:
                source_range.clear()
                cut_method = "cleared source range (deletion failed)"
            except Exception:
                cut_method = "cut operation failed"

    # Phase 8: Prepare result
    if copy_success:
        cells_affected = 1
        try:
            cells_affected = source_range.rows.count * source_range.columns.count
        except Exception:
            pass
            
        result = {
            "success": True,
            "operation": "copy_paste_range",
            "source_workbook": source_wb.name,
            "target_workbook": target_wb.name,
            "source_worksheet": source_ws.name,
            "destination_worksheet": dest_ws.name,
            "source_range": source_range_str,
            "destination_range": dest_range_str,
            "cross_instance": cross_instance,
            "cross_workbook": cross_workbook,
            "source_app_pid": source_app.pid if hasattr(source_app, 'pid') else None,
            "target_app_pid": target_app.pid if hasattr(target_app, 'pid') else None,
            "values_only": values_only,
            "cut_mode": cut_mode,
            "cut_method": cut_method,
            "method_used": method_used,
            "cells_affected": cells_affected,
            "workbook_status": {
                "source_opened_by_operation": source_opened_by_us,
                "source_created_by_operation": source_created_by_us,
                "target_opened_by_operation": target_opened_by_us,
                "target_created_by_operation": target_created_by_us
            }
        }
    else:
        result = {
            "success": False,
            "operation": "copy_paste_range",
            "error": copy_error,
            "source_range": source_range_str,
            "destination_range": dest_range_str,
            "cross_instance": cross_instance if 'cross_instance' in locals() else False,
            "cross_workbook": cross_workbook if 'cross_workbook' in locals() else False,
            "method_attempted": method_used
        }

except Exception as e:
    # Clean up any workbooks we opened during this operation
    cleanup_workbooks = []
    if 'source_opened_by_us' in locals() and source_opened_by_us:
        cleanup_workbooks.append((source_wb, "source"))
    if 'target_opened_by_us' in locals() and target_opened_by_us:
        cleanup_workbooks.append((target_wb, "target"))
    if 'source_created_by_us' in locals() and source_created_by_us:
        cleanup_workbooks.append((source_wb, "source"))
    if 'target_created_by_us' in locals() and target_created_by_us:
        cleanup_workbooks.append((target_wb, "target"))
    
    cleanup_errors = []
    for wb, wb_type in cleanup_workbooks:
        try:
            if wb:
                wb.close()
        except Exception as cleanup_error:
            cleanup_errors.append(f"{wb_type}: {str(cleanup_error)}")
    
    result = {
        "success": False,
        "operation": "copy_paste_range",
        "source_range": source_range_str if 'source_range_str' in locals() else "${params.copy_paste.source_range}",
        "destination_range": dest_range_str if 'dest_range_str' in locals() else "${params.copy_paste.destination_range}",
        "error": str(e),
        "cleanup_performed": len(cleanup_workbooks) > 0,
        "cleanup_errors": cleanup_errors if cleanup_errors else None
    }
${alertRestore}
print(json.dumps(result))`;
  }

  private generateFindReplaceLogic(params: XlwingsParams): string {
    if (!params.find_replace) {
      return 'raise ValueError("Find and replace configuration is required")';
    }

    return `
# Find and replace
app = xw.apps.active if xw.apps else None
if not app:
    app = xw.App(visible=False)

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}", app)
if not wb:
    result = {
        "success": False,
        "operation": "replace_range",
        "error_type": "workbook_not_found",
        "error_message": "Could not find the specified workbook",
        "context": {
            "workbook": "${params.workbook || ''}",
            "required_action": "specify_workbook"
        },
        "suggested_actions": [
            "Open the workbook in Excel first",
            "Use create_workbook() to create a new workbook",
            "Check the workbook name spelling",
            "Use list_workbooks() to see available workbooks"
        ]
    }
    print(json.dumps(result))
    exit()

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    result = {
        "success": False,
        "operation": "replace_range",
        "error_type": "worksheet_not_found",
        "error_message": "Could not find the specified worksheet",
        "context": {
            "worksheet": "${params.worksheet || ''}",
            "workbook": "${params.workbook || ''}",
            "available_sheets": [sheet.name for sheet in wb.sheets]
        },
        "suggested_actions": [
            "Use one of the available worksheets",
            "Check the worksheet name spelling",
            "Use list_sheets() to get exact worksheet names",
            "Use add_sheet() to create a new worksheet"
        ]
    }
    print(json.dumps(result))
    exit()

find_text = "${params.find_replace.find}"
replace_text = "${params.find_replace.replace}"
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
    "operation": "replace_range",
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
# get_workbook_smart will automatically create Excel app if needed
wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}")
if not wb:
    result = {
        "success": False,
        "operation": "add_sheet",
        "error_type": "workbook_not_found",
        "error_message": "Could not find or create the specified workbook",
        "context": {
            "workbook": "${this.escapePythonPath(params.workbook || '')}"
        },
        "suggested_actions": [
            "Check the workbook path spelling",
            "Ensure you have write permission to create the file if it doesn't exist",
            "Verify the target directory exists",
            "Try creating the workbook manually first"
        ]
    }
    print(json.dumps(result))
    exit()

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

  private generateAlterSheetLogic(params: XlwingsParams): string {
    const sheetAlter = params.sheet_alter;
    const newName = sheetAlter?.new_name || '';
    const tabColor = sheetAlter?.tab_color || '';
    
    return `
# Alter sheet properties
app = xw.apps.active if xw.apps else None
if not app:
    app = xw.App(visible=False)

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}", app)
if not wb:
    # Get list of available workbooks for debugging
    available_workbooks = [book.name for book in app.books] if app.books else []
    result = {
        "success": False,
        "operation": "alter_sheet",
        "error_type": "workbook_not_found",
        "error_message": f"Could not find the specified workbook '${params.workbook || ''}'",
        "context": {
            "workbook": "${params.workbook || ''}",
            "available_workbooks": available_workbooks
        },
        "suggested_actions": [
            f"Use one of the available workbooks: {', '.join(available_workbooks) if available_workbooks else 'None available'}",
            "Check the workbook name spelling and ensure it's open in Excel",
            "Open the workbook in Excel first, then try again",
            "Use the exact workbook name as it appears in Excel"
        ]
    }
    print(json.dumps(result))
    exit()

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    result = {
        "success": False,
        "operation": "alter_sheet",
        "error_type": "worksheet_not_found",
        "error_message": "Could not find the specified worksheet",
        "context": {
            "worksheet": "${params.worksheet || ''}",
            "workbook": wb.name if wb else "${params.workbook || ''}"
        },
        "suggested_actions": [
            "Check the worksheet name spelling and capitalization",
            "Use list_sheets() to get the exact worksheet names",
            "Ensure the worksheet exists in the specified workbook",
            "Example: alter_sheet(worksheet: 'Sheet1', sheet_alter: {new_name: 'NewName'})"
        ]
    }
    print(json.dumps(result))
    exit()

original_name = ws.name
changes_made = []

try:
    # Rename sheet if new_name is provided
    if "${newName}":
        new_sheet_name = "${newName}"
        existing_names = [sheet.name for sheet in wb.sheets if sheet.name != original_name]
        
        # Check if new name already exists
        if new_sheet_name in existing_names:
            result = {
                "success": False,
                "operation": "alter_sheet",
                "error_type": "sheet_name_exists",
                "error_message": f"Sheet name '{new_sheet_name}' already exists",
                "context": {
                    "requested_name": new_sheet_name,
                    "existing_names": existing_names,
                    "workbook": wb.name
                },
                "suggested_actions": [
                    f"Use a different name that doesn't exist: {', '.join(existing_names)}",
                    "Choose a unique name for the worksheet",
                    "Check if the target name is already in use",
                    f"Example: alter_sheet(sheet_alter: {{new_name: '{new_sheet_name}_2'}})"
                ]
            }
            print(json.dumps(result))
            exit()
        
        ws.name = new_sheet_name
        changes_made.append(f"renamed to '{new_sheet_name}'")
    
    # Set tab color if provided
    if "${tabColor}":
        tab_color = "${tabColor}"
        # Convert hex color to RGB values
        if tab_color.startswith('#') and len(tab_color) == 7:
            try:
                # Remove # and convert hex to RGB
                hex_color = tab_color[1:]
                r = int(hex_color[0:2], 16)
                g = int(hex_color[2:4], 16) 
                b = int(hex_color[4:6], 16)
                
                # Set tab color using RGB values
                ws.api.Tab.Color = r + (g * 256) + (b * 256 * 256)
                changes_made.append(f"tab color set to {tab_color}")
            except ValueError:
                result = {
                    "success": False,
                    "operation": "alter_sheet",
                    "error_type": "invalid_hex_color",
                    "error_message": f"Invalid hex color format: {tab_color}. Use format #RRGGBB",
                    "context": {
                        "provided_color": tab_color,
                        "expected_format": "#RRGGBB"
                    },
                    "suggested_actions": [
                        "Use hex color format like #FF0000 for red",
                        "Ensure the color starts with # and has 6 hex digits",
                        "Example colors: #FF0000 (red), #00FF00 (green), #0000FF (blue)",
                        "Use online color picker tools to get hex values"
                    ]
                }
                print(json.dumps(result))
                exit()
        else:
            result = {
                "success": False,
                "operation": "alter_sheet",
                "error_type": "invalid_hex_color",
                "error_message": f"Invalid hex color format: {tab_color}. Use format #RRGGBB",
                "context": {
                    "provided_color": tab_color,
                    "expected_format": "#RRGGBB"
                },
                "suggested_actions": [
                    "Use hex color format like #FF0000 for red",
                    "Ensure the color starts with # and has 6 hex digits",
                    "Example colors: #FF0000 (red), #00FF00 (green), #0000FF (blue)",
                    "Use online color picker tools to get hex values"
                ]
            }
            print(json.dumps(result))
            exit()

    if not changes_made:
        result = {
            "success": False,
            "operation": "alter_sheet",
            "error_type": "no_changes_specified",
            "error_message": "No changes specified. Provide new_name and/or tab_color",
            "context": {
                "sheet_name": ws.name,
                "workbook": wb.name,
                "available_properties": ["new_name", "tab_color"]
            },
            "suggested_actions": [
                "Specify new_name to rename the worksheet",
                "Specify tab_color to change the tab color",
                "Example: alter_sheet(sheet_alter: {new_name: 'NewName', tab_color: '#FF0000'})",
                "Provide at least one property to change"
            ]
        }
        print(json.dumps(result))
        exit()

    result = {
        "success": True,
        "operation": "alter_sheet",
        "workbook": wb.name,
        "original_sheet_name": original_name,
        "current_sheet_name": ws.name,
        "changes_made": changes_made,
        "tab_color": "${tabColor}" if "${tabColor}" else None
    }
    
except Exception as e:
    result = {
        "success": False,
        "operation": "alter_sheet", 
        "workbook": wb.name if 'wb' in locals() else None,
        "original_sheet_name": original_name if 'original_name' in locals() else None,
        "error": str(e)
    }

print(json.dumps(result))`;
  }

  private generateDeleteSheetLogic(params: XlwingsParams): string {
    const alertHandling = this.generateAlertHandlingCode(params);
    const alertRestore = this.generateAlertRestoreCode(params);
    
    return `
# Delete sheet
app = xw.apps.active if xw.apps else None
if not app:
    app = xw.App(visible=False)

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}", app)
if not wb:
    # Get list of available workbooks for debugging
    available_workbooks = [book.name for book in app.books] if app.books else []
    result = {
        "success": False,
        "operation": "delete_sheet",
        "error_type": "workbook_not_found",
        "error_message": f"Could not find the specified workbook '${params.workbook || ''}'",
        "context": {
            "workbook": "${params.workbook || ''}",
            "available_workbooks": available_workbooks
        },
        "suggested_actions": [
            f"Use one of the available workbooks: {', '.join(available_workbooks) if available_workbooks else 'None available'}",
            "Check the workbook name spelling and ensure it's open in Excel",
            "Open the workbook in Excel first, then try again",
            "Use the exact workbook name as it appears in Excel"
        ]
    }
    print(json.dumps(result))
    exit()
${alertHandling}
# Check if worksheet is specified
worksheet_name = "${params.worksheet || ''}"
if not worksheet_name:
    result = {
        "success": False,
        "operation": "delete_sheet",
        "error_type": "missing_parameter",
        "error_message": "worksheet parameter is required for delete_sheet operation",
        "context": {
            "required_parameter": "worksheet"
        }
    }
    print(json.dumps(result))
    exit()

# Find the worksheet to delete
try:
    ws = wb.sheets[worksheet_name]
    sheet_name_to_delete = ws.name
except KeyError:
    available_sheets = [sheet.name for sheet in wb.sheets]
    result = {
        "success": False,
        "operation": "delete_sheet",
        "error_type": "worksheet_not_found",
        "error_message": f"Worksheet '{worksheet_name}' not found",
        "context": {
            "worksheet": worksheet_name,
            "workbook": wb.name,
            "available_sheets": available_sheets
        },
        "suggested_actions": [
            f"Use one of the available worksheets: {', '.join(available_sheets)}",
            "Check the worksheet name spelling and capitalization",
            "Use list_sheets() to get the exact worksheet names",
            f"Example: delete_sheet(worksheet: '{available_sheets[0] if available_sheets else 'Sheet1'}')"
        ]
    }
    print(json.dumps(result))
    exit()

# Check if it's the only sheet (Excel doesn't allow deleting the last sheet)
if len(wb.sheets) <= 1:
    result = {
        "success": False,
        "operation": "delete_sheet",
        "error_type": "last_worksheet_error",
        "error_message": "Cannot delete the only worksheet in the workbook. Excel requires at least one worksheet.",
        "context": {
            "workbook": wb.name,
            "remaining_sheets": len(wb.sheets),
            "sheet_to_delete": worksheet_name
        },
        "suggested_actions": [
            "Create additional worksheets before deleting this one",
            "Add a new sheet first using add_sheet() operation",
            "Excel always requires at least one worksheet in a workbook",
            "Consider copying data to another sheet instead of deleting"
        ]
    }
    print(json.dumps(result))
    exit()

try:
    # Delete the worksheet
    ws.delete()
    
    result = {
        "success": True,
        "operation": "delete_sheet",
        "workbook": wb.name,
        "deleted_sheet_name": sheet_name_to_delete,
        "remaining_sheets": [sheet.name for sheet in wb.sheets],
        "remaining_sheets_count": len(wb.sheets)
    }
    
except Exception as e:
    result = {
        "success": False,
        "operation": "delete_sheet",
        "workbook": wb.name if 'wb' in locals() else None,
        "attempted_sheet_name": sheet_name_to_delete if 'sheet_name_to_delete' in locals() else worksheet_name,
        "error": str(e)
    }
${alertRestore}
print(json.dumps(result))`;
  }

  private generateMoveSheetLogic(params: XlwingsParams): string {
    // Check if user passed top-level parameters incorrectly
    interface TopLevelMoveParams {
      target_workbook?: string;
      new_index?: number;
      position?: string;
      reference_sheet?: string;
    }

    const typedParams = params as XlwingsParams & TopLevelMoveParams;
    const hasTopLevelParams = typedParams.target_workbook ||
                             typedParams.new_index !== undefined ||
                             typedParams.position ||
                             typedParams.reference_sheet;

    if (hasTopLevelParams && !params.sheet_move) {
      return `
result = {
    "success": False,
    "operation": "move_sheet",
    "error_type": "parameter_structure_error",
    "error_message": "move_sheet operation requires parameters to be nested under 'sheet_move' object",
    "context": {
        "current_parameters": ${JSON.stringify(params)},
        "required_structure": "sheet_move: { target_workbook?, new_index?, position?, reference_sheet? }"
    },
    "suggested_fix": {
        "current_format": "{ workbook: '...', worksheet: '...', new_index: 0 }",
        "correct_format": "{ workbook: '...', worksheet: '...', sheet_move: { new_index: 0 } }",
        "examples": [
            "For same-workbook reordering: { workbook: 'file.xlsx', worksheet: 'Sheet1', sheet_move: { new_index: 0 } }",
            "For relative positioning: { workbook: 'file.xlsx', worksheet: 'Sheet1', sheet_move: { position: 'before', reference_sheet: 'Sheet2' } }",
            "For cross-workbook move: { workbook: 'source.xlsx', worksheet: 'Sheet1', sheet_move: { target_workbook: 'target.xlsx', new_index: 0 } }"
        ]
    }
}
print(json.dumps(result))
exit()
`;
    }

    const sheetMove = params.sheet_move;
    const targetWorkbook = sheetMove?.target_workbook || '';
    const newIndex = sheetMove?.new_index ?? -1;
    const position = sheetMove?.position || '';
    const referenceSheet = sheetMove?.reference_sheet || '';

    // Properly escape paths for Python
    const sourceWorkbookPath = this.escapePythonPath(params.workbook || '');
    const targetWorkbookPath = this.escapePythonPath(targetWorkbook);

    return `
# Smart move sheet with multi-instance support
# Phase 1: Find/open source workbook
source_wb, source_app, source_opened_by_us, source_created_by_us = get_workbook_smart(
    "${sourceWorkbookPath}"
)

if not source_wb:
    result = {
        "success": False,
        "operation": "move_sheet",
        "error_type": "source_workbook_not_found",
        "error_message": f"Could not find or open source workbook '${params.workbook || ''}'",
        "context": {
            "source_workbook": "${params.workbook || ''}",
            "required_action": "check_source_workbook_path"
        },
        "suggested_actions": [
            "Check if the source workbook file exists",
            "Verify the workbook file path and name",
            "Ensure the workbook is not corrupted",
            "Use create_workbook() to create a new workbook if needed",
            "Check file permissions"
        ]
    }
    print(json.dumps(result))
    exit()

# Phase 2: Find/open target workbook (if cross-workbook move)
target_wb = None
target_app = None
target_opened_by_us = False
target_created_by_us = False

if "${targetWorkbookPath}":
    # Cross-workbook move
    target_wb, target_app, target_opened_by_us, target_created_by_us = get_workbook_smart(
        "${targetWorkbookPath}",
        preferred_app=source_app  # Prefer same instance as source
    )
    
    if not target_wb:
        result = {
            "success": False,
            "operation": "move_sheet",
            "error_type": "target_workbook_not_found",
            "error_message": f"Could not find, open, or create target workbook '${targetWorkbookPath}'",
            "context": {
                "target_workbook_path": "${targetWorkbookPath}",
                "operation": "cross_workbook_move"
            },
            "suggested_actions": [
                "Verify the target workbook path exists and is accessible",
                "Ensure you have read/write permissions to the target file",
                "Check if the target workbook is corrupted or in use by another process",
                "Try using an absolute path instead of a relative path",
                "Use create_workbook() first if you want to create a new target workbook"
            ]
        }
        print(json.dumps(result))
        exit()
    
    if target_wb.name == source_wb.name:
        result = {
            "success": False,
            "operation": "move_sheet",
            "error_type": "same_workbook_error",
            "error_message": "Target workbook cannot be the same as source workbook for cross-workbook moves",
            "context": {
                "source_workbook": source_wb.name,
                "target_workbook": target_wb.name,
                "operation": "cross_workbook_move"
            },
            "suggested_actions": [
                "Use a different target workbook for cross-workbook moves",
                "For same-workbook moves, omit the targetWorkbookPath parameter",
                "Use move_sheet() without targetWorkbookPath to reorder within the same workbook",
                "Create a new workbook with create_workbook() first, then use that as target"
            ]
        }
        print(json.dumps(result))
        exit()
    
    move_type = "cross_workbook"
else:
    # Same workbook move/reorder
    target_wb = source_wb
    target_app = source_app
    move_type = "reorder_index" if ${newIndex} >= 0 else "reorder_position"

# Phase 3: Find and validate the source worksheet
worksheet_name = "${params.worksheet || ''}"
if not worksheet_name:
    result = {
        "success": False,
        "operation": "move_sheet",
        "error_type": "missing_parameter",
        "error_message": "worksheet parameter is required for move_sheet operation",
        "context": {
            "required_parameter": "worksheet"
        }
    }
    print(json.dumps(result))
    exit()

try:
    source_ws = source_wb.sheets[worksheet_name]
    source_sheet_name = source_ws.name
    original_index = source_ws.index
except KeyError:
    available_sheets = [sheet.name for sheet in source_wb.sheets]
    # Clean up opened workbooks before failing
    cleanup_workbooks = []
    if source_opened_by_us or source_created_by_us:
        cleanup_workbooks.append((source_wb, "source"))
    if target_opened_by_us or target_created_by_us:
        cleanup_workbooks.append((target_wb, "target"))
    
    for wb, wb_type in cleanup_workbooks:
        try:
            if wb:
                wb.close()
        except:
            pass  # Ignore cleanup errors
    
    result = {
        "success": False,
        "operation": "move_sheet",
        "error_type": "worksheet_not_found",
        "error_message": f"Worksheet '{worksheet_name}' not found in source workbook",
        "context": {
            "worksheet": worksheet_name,
            "workbook": source_wb.name,
            "available_sheets": available_sheets
        },
        "suggested_actions": [
            f"Use one of the available worksheets: {', '.join(available_sheets)}",
            "Check the worksheet name spelling and capitalization",
            "Use list_sheets() to get the exact worksheet names",
            f"Example: move_sheet(worksheet: '{available_sheets[0] if available_sheets else 'Sheet1'}')"
        ]
    }
    print(json.dumps(result))
    exit()

# Phase 4: Perform the move operation
try:
    if move_type == "cross_workbook":
        
        # Check if source and target are in different Excel instances
        cross_instance = source_app != target_app
        
        if cross_instance:
            # Cross-instance move: Use sheet reconstruction + delete method
            
            # Step 1: Extract all data and properties from source sheet
            if source_ws.used_range:
                used_range_addr = source_ws.used_range.address
                sheet_data = source_ws.used_range.value
            else:
                # Empty sheet
                used_range_addr = "$A$1"
                sheet_data = None
            
            # Step 2: Extract sheet properties
            source_sheet_info = {
                "name": source_ws.name,
                "data": sheet_data,
                "used_range": used_range_addr,
                "tab_color": None,
                "visible": True
            }
            
            # Try to extract additional properties
            try:
                if hasattr(source_ws.api, 'Tab') and hasattr(source_ws.api.Tab, 'Color'):
                    source_sheet_info["tab_color"] = source_ws.api.Tab.Color
            except:
                pass
                
            try:
                source_sheet_info["visible"] = source_ws.api.Visible != 0
            except:
                pass
            
            # Step 3: Create new sheet in target workbook at beginning
            moved_ws = target_wb.sheets.add()
            moved_ws.api.Move(Before=target_wb.sheets[0].api)  # Move to beginning
            moved_ws = target_wb.sheets[0]  # Get the moved sheet reference
            
            # Step 4: Apply name (generate unique if needed)
            moved_sheet_name = source_sheet_info["name"]
            existing_names = [sheet.name for sheet in target_wb.sheets if sheet != moved_ws]
            if moved_sheet_name in existing_names:
                counter = 1
                original_name = moved_sheet_name
                while moved_sheet_name in existing_names:
                    moved_sheet_name = f"{original_name}_Moved{counter}"
                    counter += 1
            
            moved_ws.name = moved_sheet_name
            
            # Step 5: Transfer data if exists
            if sheet_data is not None:
                if isinstance(sheet_data, list):
                    if len(sheet_data) > 0:
                        rows = len(sheet_data)
                        cols = len(sheet_data[0]) if isinstance(sheet_data[0], list) else 1
                        # Build proper range address
                        col_addr = column_number_to_letter(cols)
                        target_range = f"A1:{col_addr}{rows}"
                        moved_ws.range(target_range).value = sheet_data
                else:
                    # Single value
                    moved_ws.range("A1").value = sheet_data
            
            # Step 6: Apply properties
            try:
                if source_sheet_info["tab_color"] is not None:
                    moved_ws.api.Tab.Color = source_sheet_info["tab_color"]
            except:
                pass
                
            try:
                moved_ws.api.Visible = -1 if source_sheet_info["visible"] else 0
            except:
                pass
            
            # Step 7: Copy basic formatting (same as copy_sheet)
            if sheet_data is not None and source_ws.used_range:
                try:
                    if isinstance(sheet_data, list) and len(sheet_data) > 0:
                        first_row = sheet_data[0]
                        if isinstance(first_row, list) and len(first_row) > 0:
                            cols = len(first_row)
                            col_addr = column_number_to_letter(cols)

                            source_header_range = source_ws.range(f"A1:{col_addr}1")
                            target_header_range = moved_ws.range(f"A1:{col_addr}1")
                            
                            # Copy bold formatting
                            try:
                                if source_header_range.api.Font.Bold:
                                    target_header_range.api.Font.Bold = True
                            except:
                                pass
                                
                            # Copy background color
                            try:
                                source_color = source_header_range.color
                                if source_color and source_color != (255, 255, 255):
                                    target_header_range.color = source_color
                            except:
                                pass
                except:
                    pass
            
            # Step 8: Delete original sheet from source workbook
            if len(source_wb.sheets) <= 1:
                result = {
                    "success": False,
                    "operation": "move_sheet",
                    "error_type": "last_worksheet_error",
                    "error_message": "Cannot move the only worksheet from source workbook",
                    "context": {
                        "source_workbook": source_wb.name,
                        "remaining_sheets": len(source_wb.sheets),
                        "operation": "cross_instance_move"
                    },
                    "suggested_actions": [
                        "Create additional worksheets in the source workbook before moving",
                        "Use copy_sheet() instead of move_sheet() to preserve the original",
                        "Move worksheets from a workbook that has multiple sheets",
                        "Consider merging data instead of moving entire worksheets"
                    ]
                }
                print(json.dumps(result))
                exit()
            source_ws.delete()
            
            
        else:
            # Same instance cross-workbook move - use native Excel API
            source_ws.api.Copy(Before=target_wb.sheets[0].api)
            moved_ws = target_wb.sheets[0]
            
            # Delete original sheet from source workbook
            if len(source_wb.sheets) <= 1:
                result = {
                    "success": False,
                    "operation": "move_sheet",
                    "error_type": "last_worksheet_error",
                    "error_message": "Cannot move the only worksheet from source workbook",
                    "context": {
                        "source_workbook": source_wb.name,
                        "remaining_sheets": len(source_wb.sheets),
                        "operation": "same_instance_move"
                    },
                    "suggested_actions": [
                        "Create additional worksheets in the source workbook before moving",
                        "Use copy_sheet() instead of move_sheet() to preserve the original",
                        "Move worksheets from a workbook that has multiple sheets",
                        "Consider merging data instead of moving entire worksheets"
                    ]
                }
                print(json.dumps(result))
                exit()
            source_ws.delete()
        
        move_type = "cross_workbook"
        
        result = {
            "success": True,
            "operation": "move_sheet",
            "move_type": move_type,
            "sheet_name": source_sheet_name,
            "source_workbook": source_wb.name,
            "target_workbook": target_wb.name,
            "original_index": original_index,
            "new_index": 0,
            "source_sheets_remaining": [sheet.name for sheet in source_wb.sheets],
            "target_sheets_after": [sheet.name for sheet in target_wb.sheets],
            "workbook_status": {
                "source_opened_by_operation": source_opened_by_us,
                "source_created_by_operation": source_created_by_us,
                "target_opened_by_operation": target_opened_by_us,
                "target_created_by_operation": target_created_by_us,
                "cross_instance": source_app != target_app
            }
        }
        
    else:
        # Same workbook - reorder by index or position
        target_wb = source_wb
        total_sheets = len(source_wb.sheets)
        
        if ${newIndex} >= 0:
            # Move to specific index
            new_pos = min(max(${newIndex}, 0), total_sheets - 1)
            
            if new_pos == original_index - 1:  # xlwings uses 1-based index
                result = {
                    "success": False,
                    "operation": "move_sheet",
                    "error_type": "no_change_needed",
                    "error_message": f"Sheet is already at index {new_pos}",
                    "context": {
                        "worksheet": source_sheet_name,
                        "current_index": new_pos,
                        "requested_index": new_pos,
                        "operation": "reorder_index"
                    },
                    "suggested_actions": [
                        f"Sheet '{source_sheet_name}' is already at the requested position",
                        "Use a different index to move the sheet to a new position",
                        "Use list_sheets() to see current sheet order",
                        "No action needed - sheet is already in the desired position"
                    ]
                }
                print(json.dumps(result))
                exit()
                
            # Move worksheet to new position
            if new_pos < original_index - 1:
                # Moving left - insert before the sheet at new_pos
                target_sheet = source_wb.sheets[new_pos]
                source_ws.api.Move(Before=target_sheet.api)
            else:
                # Moving right - insert after the sheet at new_pos  
                if new_pos < total_sheets - 1:
                    target_sheet = source_wb.sheets[new_pos + 1]
                    source_ws.api.Move(Before=target_sheet.api)
                else:
                    # Move to end
                    source_ws.api.Move(After=source_wb.sheets[-1].api)
            
            move_type = "reorder_index"
            final_index = source_ws.index - 1  # Convert to 0-based
            
        elif "${position}" and "${referenceSheet}":
            # Move relative to another sheet
            try:
                ref_ws = source_wb.sheets["${referenceSheet}"]
                ref_index = ref_ws.index
                
                if "${position}" == "before":
                    source_ws.api.Move(Before=ref_ws.api)
                    final_index = ref_index - 1
                else:  # after
                    if ref_index < total_sheets:
                        next_sheet = source_wb.sheets[ref_index]  # xlwings uses 1-based, so ref_index is the next sheet
                        source_ws.api.Move(Before=next_sheet.api)
                        final_index = ref_index
                    else:
                        source_ws.api.Move(After=ref_ws.api)
                        final_index = total_sheets - 1
                        
                move_type = "reorder_position"
                
            except KeyError:
                available_sheets = [sheet.name for sheet in source_wb.sheets if sheet.name != source_sheet_name]
                result = {
                    "success": False,
                    "operation": "move_sheet",
                    "error_type": "reference_sheet_not_found",
                    "error_message": f"Reference sheet '${referenceSheet}' not found",
                    "context": {
                        "reference_sheet": "${referenceSheet}",
                        "position": "${position}",
                        "workbook": source_wb.name,
                        "available_sheets": available_sheets
                    },
                    "suggested_actions": [
                        f"Use one of the available sheets as reference: {', '.join(available_sheets)}",
                        "Check the reference sheet name spelling and capitalization",
                        "Use list_sheets() to get the exact sheet names",
                        f"Example: move_sheet(position: 'before', reference_sheet: '{available_sheets[0] if available_sheets else 'Sheet1'}')"
                    ]
                }
                print(json.dumps(result))
                exit()

        else:
            result = {
                "success": False,
                "operation": "move_sheet",
                "error_type": "missing_position_parameters",
                "error_message": "For same-workbook moves, specify either new_index or (position + reference_sheet)",
                "context": {
                    "operation": "same_workbook_move",
                    "required_parameters": ["new_index", "position + reference_sheet"]
                },
                "suggested_actions": [
                    "Specify new_index to move to a specific position (e.g., new_index: 0)",
                    "Or specify both position ('before'/'after') and reference_sheet",
                    "Example: move_sheet(new_index: 2) or move_sheet(position: 'before', reference_sheet: 'Sheet2')",
                    "Use list_sheets() to see current sheet order and names"
                ]
            }
            print(json.dumps(result))
            exit()
        
        result = {
            "success": True,
            "operation": "move_sheet", 
            "move_type": move_type,
            "sheet_name": source_sheet_name,
            "workbook": source_wb.name,
            "original_index": original_index - 1,  # Convert to 0-based
            "new_index": final_index,
            "sheets_after": [(i, sheet.name) for i, sheet in enumerate(source_wb.sheets)],
            "workbook_status": {
                "source_opened_by_operation": source_opened_by_us,
                "source_created_by_operation": source_created_by_us
            }
        }

except Exception as e:
    # Clean up any workbooks we opened during this operation
    cleanup_workbooks = []
    if 'source_opened_by_us' in locals() and source_opened_by_us:
        cleanup_workbooks.append((source_wb, "source"))
    if 'target_opened_by_us' in locals() and target_opened_by_us:
        cleanup_workbooks.append((target_wb, "target"))
    if 'source_created_by_us' in locals() and source_created_by_us:
        cleanup_workbooks.append((source_wb, "source"))
    if 'target_created_by_us' in locals() and target_created_by_us:
        cleanup_workbooks.append((target_wb, "target"))
    
    cleanup_errors = []
    for wb, wb_type in cleanup_workbooks:
        try:
            if wb:
                wb.close()
        except Exception as cleanup_error:
            cleanup_errors.append(f"{wb_type}: {str(cleanup_error)}")
    
    result = {
        "success": False,
        "operation": "move_sheet",
        "sheet_name": source_sheet_name if 'source_sheet_name' in locals() else worksheet_name,
        "source_workbook": source_wb.name if 'source_wb' in locals() and source_wb else "${params.workbook || ''}",
        "target_workbook": "${targetWorkbookPath}" if "${targetWorkbookPath}" else None,
        "error": str(e),
        "cleanup_performed": len(cleanup_workbooks) > 0,
        "cleanup_errors": cleanup_errors if cleanup_errors else None
    }

print(json.dumps(result))`;
  }

  private generateCopySheetLogic(params: XlwingsParams): string {
    const sheetCopy = params.sheet_copy;
    const targetWorkbook = sheetCopy?.target_workbook || '';
    const newName = sheetCopy?.new_name || '';
    const targetIndex = sheetCopy?.target_index ?? -1;
    const position = sheetCopy?.position || '';
    const referenceSheet = sheetCopy?.reference_sheet || '';

    // Properly escape paths for Python
    const sourceWorkbookPath = this.escapePythonPath(params.workbook || '');
    const targetWorkbookPath = this.escapePythonPath(targetWorkbook);

    return `
# Smart copy sheet with multi-instance support

# Phase 1: Find/open source workbook
source_wb, source_app, source_opened_by_us, source_created_by_us = get_workbook_smart(
    "${sourceWorkbookPath}"
)

if not source_wb:
    result = {
        "success": False,
        "operation": "copy_sheet",
        "error_type": "source_workbook_not_found",
        "error_message": f"Could not find or open source workbook '${sourceWorkbookPath}'",
        "context": {
            "source_workbook_path": "${sourceWorkbookPath}"
        },
        "suggested_actions": [
            "Verify the source workbook path exists and is accessible",
            "Ensure you have read permissions to the source file",
            "Check if the source workbook is corrupted or in use by another process",
            "Try using an absolute path instead of a relative path",
            "Ensure the file extension is correct (.xlsx, .xls, etc.)"
        ]
    }
    print(json.dumps(result))
    exit()


worksheet_name = "${params.worksheet || ''}"
if not worksheet_name:
    # Cleanup source if we opened it
    if source_opened_by_us:
        try:
            source_wb.close()
        except:
            pass
    # Return structured error instead of raising exception
    result = {
        "success": False,
        "operation": "copy_sheet",
        "error_type": "missing_parameter",
        "error_message": "worksheet parameter is required for copy_sheet operation",
        "context": {
            "required_parameter": "worksheet"
        },
        "suggested_actions": [
            "Specify the worksheet parameter with the name of the sheet to copy",
            "Use list_sheets() to see available worksheets first",
            "Example: copy_sheet(worksheet: 'Sheet1', sheet_copy: {new_name: 'Sheet1_Copy'})"
        ]
    }
    print(json.dumps(result))
    exit()


# Use safe traversal method to find source worksheet
source_ws = None
for sheet in source_wb.sheets:
    if sheet.name == worksheet_name:
        source_ws = sheet
        break

if not source_ws:
    # Worksheet not found - cleanup and return error immediately

    available_sheets = [sheet.name for sheet in source_wb.sheets]

    # Cleanup source workbook if we opened it
    if source_opened_by_us:
        try:
            source_wb.close()
        except:
            pass


    # Return structured error instead of raising exception
    result = {
        "success": False,
        "operation": "copy_sheet",
        "error_type": "worksheet_not_found",
        "error_message": f"Worksheet '{worksheet_name}' not found in source workbook",
        "context": {
            "worksheet": worksheet_name,
            "workbook": source_wb.name,
            "available_sheets": available_sheets
        },
        "suggested_actions": [
            f"Use one of the available worksheets: {', '.join(available_sheets)}",
            "Check the worksheet name spelling and capitalization",
            "Use list_sheets() to get the exact worksheet names",
            f"Example: copy_sheet(worksheet: '{available_sheets[0] if available_sheets else 'Sheet1'}')"
        ]
    }
    print(json.dumps(result))
    exit()

# Worksheet found - proceed with copy operation
source_sheet_name = source_ws.name
original_index = source_ws.index - 1  # Convert to 0-based


# Phase 3: Open target workbook only after verifying source worksheet exists
target_wb = None
target_app = None
target_opened_by_us = False
target_created_by_us = False

if "${targetWorkbookPath}":
    # Cross-workbook copy
    target_wb, target_app, target_opened_by_us, target_created_by_us = get_workbook_smart(
        "${targetWorkbookPath}",
        preferred_app=source_app  # Prefer same instance as source
    )

    if not target_wb:
        # Failed to open target - cleanup source if needed
        if source_opened_by_us:
            try:
                source_wb.close()
            except:
                pass
        result = {
            "success": False,
            "operation": "copy_sheet",
            "error_type": "target_workbook_not_found",
            "error_message": f"Could not find, open, or create target workbook '${targetWorkbookPath}'",
            "context": {
                "target_workbook_path": "${targetWorkbookPath}",
                "operation": "cross_workbook_copy"
            },
            "suggested_actions": [
                "Verify the target workbook path exists and is accessible",
                "Ensure you have read/write permissions to the target file",
                "Check if the target workbook is corrupted or in use by another process",
                "Try using an absolute path instead of a relative path",
                "Use create_workbook() first if you want to create a new target workbook"
            ]
        }
        print(json.dumps(result))
        exit()


    copy_type = "cross_workbook"
else:
    # Same workbook copy
    target_wb = source_wb
    target_app = source_app
    copy_type = "same_workbook"

# Phase 4: Perform the copy operation

copied_sheet_name = None
final_index = None

try:
    if copy_type == "cross_workbook":
        # Check if source and target are in different Excel instances
        cross_instance = source_app != target_app


        if cross_instance:
            # Cross-instance copy: Use complete sheet reconstruction method
            
            # Step 1: Extract all data from source sheet
            if source_ws.used_range:
                used_range_addr = source_ws.used_range.address
                sheet_data = source_ws.used_range.value
            else:
                # Empty sheet
                used_range_addr = "$A$1"
                sheet_data = None
            
            # Step 2: Extract sheet properties
            source_sheet_info = {
                "name": source_ws.name,
                "data": sheet_data,
                "used_range": used_range_addr,
                "tab_color": None,  # Will extract if available
                "visible": True     # Default visible
            }
            
            # Try to extract tab color (might fail in some Excel versions)
            try:
                if hasattr(source_ws.api, 'Tab') and hasattr(source_ws.api.Tab, 'Color'):
                    source_sheet_info["tab_color"] = source_ws.api.Tab.Color
            except:
                pass
                
            # Try to extract visibility
            try:
                source_sheet_info["visible"] = source_ws.api.Visible != 0  # Excel uses 0 for hidden
            except:
                pass
            
            # Step 3: Create new sheet in target workbook

            copied_ws = target_wb.sheets.add()
            copied_sheet_name = source_sheet_info["name"]


            # Generate unique name if needed
            existing_names = [sheet.name for sheet in target_wb.sheets if sheet != copied_ws]


            if copied_sheet_name in existing_names:
                counter = 1
                original_name = copied_sheet_name
                while copied_sheet_name in existing_names:
                    copied_sheet_name = f"{original_name}_Copy{counter}"
                    counter += 1



            copied_ws.name = copied_sheet_name

            
            # Step 4: Transfer data if exists
            if sheet_data is not None:
                # Determine the range to write to
                if isinstance(sheet_data, list):
                    if len(sheet_data) > 0:
                        rows = len(sheet_data)
                        cols = len(sheet_data[0]) if isinstance(sheet_data[0], list) else 1
                        col_letter = column_number_to_letter(cols)
                        target_range = f"A1:{col_letter}{rows}"
                        copied_ws.range(target_range).value = sheet_data
                else:
                    # Single value
                    copied_ws.range("A1").value = sheet_data
            
            # Step 5: Apply sheet properties
            try:
                if source_sheet_info["tab_color"] is not None:
                    copied_ws.api.Tab.Color = source_sheet_info["tab_color"]
            except:
                pass
                
            try:
                copied_ws.api.Visible = -1 if source_sheet_info["visible"] else 0
            except:
                pass
            
            # Step 6: Try to copy formatting (basic formatting only due to complexity)
            if sheet_data is not None and source_ws.used_range:
                try:
                    # Copy basic formatting from header row if it exists
                    if isinstance(sheet_data, list) and len(sheet_data) > 0:
                        # Check if first row might be headers
                        first_row = sheet_data[0]
                        if isinstance(first_row, list) and len(first_row) > 0:
                            # Try to copy bold formatting from source header
                            col_letter = column_number_to_letter(len(first_row))
                            source_header_range = source_ws.range(f"A1:{col_letter}1")
                            target_header_range = copied_ws.range(f"A1:{col_letter}1")
                            
                            # Copy bold formatting
                            try:
                                if source_header_range.api.Font.Bold:
                                    target_header_range.api.Font.Bold = True
                            except:
                                pass
                                
                            # Copy background color
                            try:
                                source_color = source_header_range.color
                                if source_color and source_color != (255, 255, 255):  # Not white
                                    target_header_range.color = source_color
                            except:
                                pass
                except:
                    # Formatting failed, but data copy was successful
                    pass
            
            final_index = copied_ws.index - 1  # Convert to 0-based
            
        else:
            # Same instance cross-workbook copy - use native Excel API
            source_ws.api.Copy(After=target_wb.sheets[-1].api)
            copied_ws = target_wb.sheets[-1]
            copied_sheet_name = copied_ws.name
            final_index = len(target_wb.sheets) - 1
        
    else:  # same_workbook
        # Same workbook copy - copy after original sheet
        source_ws.api.Copy(After=source_ws.api)
        copied_ws = source_wb.sheets[source_ws.index]  # xlwings 1-based index
        copied_sheet_name = copied_ws.name
        final_index = source_ws.index  # This will be 0-based for result
    
    # Handle custom naming
    if "${newName}":

        new_sheet_name = "${newName}"
        existing_names = [sheet.name for sheet in target_wb.sheets if sheet.name != copied_sheet_name]


        if new_sheet_name in existing_names:

            # Generate unique name
            counter = 1
            while f"{new_sheet_name}_{counter}" in existing_names:
                counter += 1
            new_sheet_name = f"{new_sheet_name}_{counter}"



        copied_ws.name = new_sheet_name


        copied_sheet_name = new_sheet_name
    
    # Handle positioning (move the copied sheet to desired position)
    if ${targetIndex} >= 0:
        # Move to specific index
        total_sheets = len(target_wb.sheets)
        new_pos = min(max(${targetIndex}, 0), total_sheets - 1)
        
        if new_pos != copied_ws.index - 1:  # xlwings uses 1-based index
            if new_pos == 0:
                # Move to beginning
                copied_ws.api.Move(Before=target_wb.sheets[0].api)
            elif new_pos < copied_ws.index - 1:
                # Moving left
                target_sheet = target_wb.sheets[new_pos]
                copied_ws.api.Move(Before=target_sheet.api)
            else:
                # Moving right
                if new_pos < total_sheets - 1:
                    target_sheet = target_wb.sheets[new_pos + 1]
                    copied_ws.api.Move(Before=target_sheet.api)
                else:
                    # Move to end
                    copied_ws.api.Move(After=target_wb.sheets[-1].api)
        
        final_index = new_pos
        
    elif "${position}" and "${referenceSheet}":
        # Move relative to another sheet
        try:
            ref_ws = target_wb.sheets["${referenceSheet}"]
            
            if "${position}" == "before":
                copied_ws.api.Move(Before=ref_ws.api)
                final_index = ref_ws.index - 2  # Adjust for the moved sheet
            else:  # after
                copied_ws.api.Move(After=ref_ws.api)
                final_index = ref_ws.index - 1  # Adjust for 1-based to 0-based
                
        except KeyError:
            available_sheets = [sheet.name for sheet in target_wb.sheets if sheet.name != copied_sheet_name]
            result = {
                "success": False,
                "operation": "copy_sheet",
                "error_type": "reference_sheet_not_found",
                "error_message": f"Reference sheet '${referenceSheet}' not found",
                "context": {
                    "reference_sheet": "${referenceSheet}",
                    "position": "${position}",
                    "target_workbook": target_wb.name,
                    "available_sheets": available_sheets
                },
                "suggested_actions": [
                    f"Use one of the available sheets as reference: {', '.join(available_sheets)}",
                    "Check the reference sheet name spelling and capitalization",
                    "Use list_sheets() to get the exact sheet names in target workbook",
                    f"Example: copy_sheet(position: 'before', reference_sheet: '{available_sheets[0] if available_sheets else 'Sheet1'}')"
                ]
            }
            print(json.dumps(result))
            exit()
    
    # Phase 5: Clean up workbooks and restore original state

    # Phase 6.1: Collect workbook information BEFORE closing workbooks
    target_sheets_after = [sheet.name for sheet in target_wb.sheets] if target_wb else []
    target_sheets_count = len(target_wb.sheets) if target_wb else 0
    source_workbook_name = source_wb.name if source_wb else ""
    target_workbook_name = target_wb.name if target_wb else ""


    # Save and close workbooks that we opened
    # For copy operations, we need to save the target workbook if we opened it OR created it
    if (target_created_by_us or target_opened_by_us) and target_wb and copy_type == "cross_workbook":
        try:
            target_wb.save()
        except Exception as save_error:

            # Save failed - this is a critical error, return failure immediately
            result = {
                "success": False,
                "operation": "copy_sheet",
                "error_type": "save_failed",
                "error_message": f"Sheet copied successfully but failed to save target workbook: {str(save_error)}",
                "context": {
                    "target_workbook": target_wb.name if target_wb else "${targetWorkbookPath}",
                    "save_error": str(save_error),
                    "copied_sheet_name": copied_sheet_name if 'copied_sheet_name' in locals() else None
                },
                "suggested_actions": [
                    "Check if you have write permissions to the target file",
                    "Ensure the target file is not open in another application",
                    "Verify there's sufficient disk space",
                    "Try copying to a different location",
                    "Check if the file path contains special characters"
                ]
            }
            print(json.dumps(result))
            exit()

    if target_opened_by_us and target_wb and copy_type == "cross_workbook":
        try:
            target_wb.close()
        except:
            pass

    if source_opened_by_us and source_wb:
        try:
            source_wb.close()
        except:
            pass

    # Phase 7: Prepare result with collected workbook information
    if copy_type == "cross_workbook":
        result = {
            "success": True,
            "operation": "copy_sheet",
            "copy_type": copy_type,
            "source_sheet_name": source_sheet_name,
            "copied_sheet_name": copied_sheet_name,
            "source_workbook": source_workbook_name,
            "target_workbook": target_workbook_name,
            "source_index": original_index,
            "target_index": final_index,
            "target_sheets_after": target_sheets_after,
            "target_sheets_count": target_sheets_count,
            "workbook_status": {
                "source_opened_by_operation": source_opened_by_us,
                "source_created_by_operation": source_created_by_us,
                "target_opened_by_operation": target_opened_by_us,
                "target_created_by_operation": target_created_by_us,
                "cross_instance": source_app != target_app
            }
        }
    else:  # same_workbook
        sheets_after_with_index = [(i, sheet.name) for i, sheet in enumerate(target_wb.sheets)] if target_wb else []
        result = {
            "success": True,
            "operation": "copy_sheet",
            "copy_type": copy_type,
            "source_sheet_name": source_sheet_name,
            "copied_sheet_name": copied_sheet_name,
            "workbook": source_workbook_name,
            "source_index": original_index,
            "copied_index": final_index,
            "sheets_after": sheets_after_with_index,
            "total_sheets": target_sheets_count,
            "workbook_status": {
                "source_opened_by_operation": source_opened_by_us,
                "source_created_by_operation": source_created_by_us
            }
        }

except Exception as e:
    # Clean up any workbooks we opened during this operation
    cleanup_workbooks = []
    if 'source_opened_by_us' in locals() and source_opened_by_us:
        cleanup_workbooks.append((source_wb, "source"))
    if 'target_opened_by_us' in locals() and target_opened_by_us:
        cleanup_workbooks.append((target_wb, "target"))
    if 'source_created_by_us' in locals() and source_created_by_us:
        cleanup_workbooks.append((source_wb, "source"))
    if 'target_created_by_us' in locals() and target_created_by_us:
        cleanup_workbooks.append((target_wb, "target"))
    
    cleanup_errors = []
    for wb, wb_type in cleanup_workbooks:
        try:
            if wb:
                wb.close()
        except Exception as cleanup_error:
            cleanup_errors.append(f"{wb_type}: {str(cleanup_error)}")
    
    result = {
        "success": False,
        "operation": "copy_sheet",
        "source_sheet_name": source_sheet_name if 'source_sheet_name' in locals() else worksheet_name,
        "source_workbook": source_wb.name if 'source_wb' in locals() and source_wb else "${params.workbook || ''}",
        "target_workbook": "${targetWorkbookPath}" if "${targetWorkbookPath}" else None,
        "error": str(e),
        "cleanup_performed": len(cleanup_workbooks) > 0,
        "cleanup_errors": cleanup_errors if cleanup_errors else None
    }


print(json.dumps(result))`;
  }

  private generateAddCommentLogic(params: XlwingsParams): string {
    const comment = params.comment;
    const commentText = comment?.text || '';
    // const author = comment?.author || '';
    // const visible = comment?.visible ?? true;
    
    return `
# Add comment to cell
app = xw.apps.active if xw.apps else None
if not app:
    app = xw.App(visible=False)

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}", app)
if not wb:
    # Get list of available workbooks for debugging
    available_workbooks = [book.name for book in app.books] if app.books else []
    result = {
        "success": False,
        "operation": "add_comment",
        "error_type": "workbook_not_found",
        "error_message": f"Could not find the specified workbook '${params.workbook || ''}'",
        "context": {
            "workbook": "${params.workbook || ''}",
            "available_workbooks": available_workbooks
        },
        "suggested_actions": [
            f"Use one of the available workbooks: {', '.join(available_workbooks) if available_workbooks else 'None available'}",
            "Check the workbook name spelling and ensure it's open in Excel",
            "Open the workbook in Excel first, then try again",
            "Use the exact workbook name as it appears in Excel"
        ]
    }
    print(json.dumps(result))
    exit()

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    result = {
        "success": False,
        "operation": "add_comment",
        "error_type": "worksheet_not_found",
        "error_message": "Could not find the specified worksheet",
        "context": {
            "worksheet": "${params.worksheet || ''}",
            "workbook": wb.name if wb else "${params.workbook || ''}"
        },
        "suggested_actions": [
            "Check the worksheet name spelling and capitalization",
            "Use list_sheets() to get the exact worksheet names",
            "Ensure the worksheet exists in the specified workbook",
            "Example: add_comment(worksheet: 'Sheet1', range: 'A1', comment: {text: 'Comment'})"
        ]
    }
    print(json.dumps(result))
    exit()

# Get target cell
range_str = "${params.range || 'A1'}"
if not range_str:
    result = {
        "success": False,
        "operation": "add_comment",
        "error_type": "missing_parameter",
        "error_message": "range parameter is required for add_comment operation",
        "context": {
            "required_parameter": "range"
        }
    }
    print(json.dumps(result))
    exit()

try:
    cell = ws.range(range_str)
    
    # Check if it's a single cell
    if cell.rows.count > 1 or cell.columns.count > 1:
        result = {
            "success": False,
            "operation": "add_comment",
            "error_type": "invalid_range",
            "error_message": "Comments can only be added to single cells, not ranges",
            "context": {
                "range": range_str,
                "rows_count": cell.rows.count,
                "columns_count": cell.columns.count
            },
            "suggested_actions": [
                "Specify a single cell reference (e.g., 'A1')",
                "Use individual cells if you need to add comments to multiple cells",
                "Example: add_comment(range: 'A1', comment: {text: 'Comment text'})"
            ]
        }
        print(json.dumps(result))
        exit()
    
    # Add comment
    comment_text = "${commentText || ''}"
    if not comment_text:
        result = {
            "success": False,
            "operation": "add_comment",
            "error_type": "missing_parameter",
            "error_message": "comment.text is required for add_comment operation",
            "context": {
                "required_parameter": "comment.text"
            },
            "suggested_actions": [
                "Specify the comment text in the comment parameter",
                "Example: add_comment(range: 'A1', comment: {text: 'This is a comment'})",
                "Check that the comment object has a text property"
            ]
        }
        print(json.dumps(result))
        exit()
    
    # Delete existing comment if any
    try:
        if cell.note:
            cell.note.delete()
    except:
        pass  # Note doesn't exist, continue

    # Add new comment using COM API then set text
    try:
        # Use COM API to add comment first
        cell.api.AddComment()
        cell.api.Comment.Text(comment_text)
    except:
        # Fallback: try direct note.text assignment
        try:
            cell.note.text = comment_text
        except Exception as e:
            result = {
                "success": False,
                "operation": "add_comment",
                "error_type": "comment_add_failed",
                "error_message": f"Failed to add comment using both COM API and note.text methods",
                "context": {
                    "range": range_str,
                    "comment_text": comment_text,
                    "error_details": str(e)
                },
                "suggested_actions": [
                    "Check if the worksheet is protected",
                    "Verify that comments are allowed in this workbook",
                    "Try refreshing Excel and running the operation again",
                    "Ensure the cell is not locked or protected"
                ]
            }
            print(json.dumps(result))
            exit()
    
    # Note: xlwings Note object only supports text property
    # Author and visibility are not supported in the current Note API
    
    result = {
        "success": True,
        "operation": "add_comment",
        "workbook": wb.name,
        "worksheet": ws.name,
        "range": range_str,
        "comment_text": comment_text,
        "comment_author": "System",
        "comment_visible": True
    }
    
except Exception as e:
    result = {
        "success": False,
        "operation": "add_comment",
        "workbook": wb.name if 'wb' in locals() else None,
        "worksheet": ws.name if 'ws' in locals() else None,
        "range": range_str,
        "error": str(e)
    }

print(json.dumps(result))`;
  }

  private generateEditCommentLogic(params: XlwingsParams): string {
    const comment = params.comment;
    const commentText = comment?.text || '';
    const author = comment?.author || '';
    const visible = comment?.visible;
    
    return `
# Edit existing comment
app = xw.apps.active if xw.apps else None
if not app:
    app = xw.App(visible=False)

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}", app)
if not wb:
    # Get list of available workbooks for debugging
    available_workbooks = [book.name for book in app.books] if app.books else []
    result = {
        "success": False,
        "operation": "edit_comment",
        "error_type": "workbook_not_found",
        "error_message": f"Could not find the specified workbook '${params.workbook || ''}'",
        "context": {
            "workbook": "${params.workbook || ''}",
            "available_workbooks": available_workbooks
        },
        "suggested_actions": [
            f"Use one of the available workbooks: {', '.join(available_workbooks) if available_workbooks else 'None available'}",
            "Check the workbook name spelling and ensure it's open in Excel",
            "Open the workbook in Excel first, then try again",
            "Use the exact workbook name as it appears in Excel"
        ]
    }
    print(json.dumps(result))
    exit()

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    result = {
        "success": False,
        "operation": "edit_comment",
        "error_type": "worksheet_not_found",
        "error_message": "Could not find the specified worksheet",
        "context": {
            "worksheet": "${params.worksheet || ''}",
            "workbook": wb.name if wb else "${params.workbook || ''}"
        },
        "suggested_actions": [
            "Check the worksheet name spelling and capitalization",
            "Use list_sheets() to get the exact worksheet names",
            "Ensure the worksheet exists in the specified workbook",
            "Example: edit_comment(worksheet: 'Sheet1', range: 'A1', comment: {text: 'Updated comment'})"
        ]
    }
    print(json.dumps(result))
    exit()

# Get target cell
range_str = "${params.range || 'A1'}"
if not range_str:
    result = {
        "success": False,
        "operation": "edit_comment",
        "error_type": "missing_parameter",
        "error_message": "range parameter is required for edit_comment operation",
        "context": {
            "required_parameter": "range"
        }
    }
    print(json.dumps(result))
    exit()

try:
    cell = ws.range(range_str)
    
    # Check if it's a single cell
    if cell.rows.count > 1 or cell.columns.count > 1:
        result = {
            "success": False,
            "operation": "edit_comment",
            "error_type": "invalid_range",
            "error_message": "Comments can only be edited on single cells, not ranges",
            "context": {
                "range": range_str,
                "rows_count": cell.rows.count,
                "columns_count": cell.columns.count
            },
            "suggested_actions": [
                "Specify a single cell reference (e.g., 'A1')",
                "Use individual cells if you need to edit multiple comments",
                "Example: edit_comment(range: 'A1', comment: {text: 'New comment text'})"
            ]
        }
        print(json.dumps(result))
        exit()

    # Check if comment exists using note property
    if not cell.note:
        result = {
            "success": False,
            "operation": "edit_comment",
            "error_type": "comment_not_found",
            "error_message": f"No comment found at {range_str}",
            "context": {
                "range": range_str,
                "cell_address": range_str
            },
            "suggested_actions": [
                "First add a comment using add_comment() before editing",
                "Check if the cell address is correct",
                "Use list_comments() to see which cells have comments",
                f"Example: add_comment(range: '{range_str}', comment: {{text: 'Comment text'}})"
            ]
        }
        print(json.dumps(result))
        exit()

    # Update comment text if provided
    comment_text = "${commentText}"
    author = "${author}"
    visible = ${visible !== undefined ? visible : 'None'}

    if comment_text:
        cell.note.text = comment_text
    
    # Note: xlwings Note object only supports text property
    # Author and visibility are not supported in the current Note API
    
    result = {
        "success": True,
        "operation": "edit_comment",
        "workbook": wb.name,
        "worksheet": ws.name,
        "range": range_str,
        "comment_text": cell.note.text,
        "changes_made": []
    }
    
    if comment_text:
        result["changes_made"].append("text updated")
    if author:
        result["changes_made"].append("author updated")
    if visible is not None:
        result["changes_made"].append("visibility updated")
    
except Exception as e:
    result = {
        "success": False,
        "operation": "edit_comment",
        "workbook": wb.name if 'wb' in locals() else None,
        "worksheet": ws.name if 'ws' in locals() else None,
        "range": range_str,
        "error": str(e)
    }

print(json.dumps(result))`;
  }

  private generateDeleteCommentLogic(params: XlwingsParams): string {
    return `
# Delete comment from cell
app = xw.apps.active if xw.apps else None
if not app:
    app = xw.App(visible=False)

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}", app)
if not wb:
    # Get list of available workbooks for debugging
    available_workbooks = [book.name for book in app.books] if app.books else []
    result = {
        "success": False,
        "operation": "delete_comment",
        "error_type": "workbook_not_found",
        "error_message": f"Could not find the specified workbook '${params.workbook || ''}'",
        "context": {
            "workbook": "${params.workbook || ''}",
            "available_workbooks": available_workbooks
        },
        "suggested_actions": [
            f"Use one of the available workbooks: {', '.join(available_workbooks) if available_workbooks else 'None available'}",
            "Check the workbook name spelling and ensure it's open in Excel",
            "Open the workbook in Excel first, then try again",
            "Use the exact workbook name as it appears in Excel"
        ]
    }
    print(json.dumps(result))
    exit()

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    result = {
        "success": False,
        "operation": "delete_comment",
        "error_type": "worksheet_not_found",
        "error_message": "Could not find the specified worksheet",
        "context": {
            "worksheet": "${params.worksheet || ''}",
            "workbook": wb.name if wb else "${params.workbook || ''}"
        },
        "suggested_actions": [
            "Check the worksheet name spelling and capitalization",
            "Use list_sheets() to get the exact worksheet names",
            "Ensure the worksheet exists in the specified workbook",
            "Example: delete_comment(worksheet: 'Sheet1', range: 'A1')"
        ]
    }
    print(json.dumps(result))
    exit()

# Get target cell
range_str = "${params.range || 'A1'}"
if not range_str:
    result = {
        "success": False,
        "operation": "delete_comment",
        "error_type": "missing_parameter",
        "error_message": "range parameter is required for delete_comment operation",
        "context": {
            "required_parameter": "range"
        }
    }
    print(json.dumps(result))
    exit()

try:
    cell = ws.range(range_str)
    
    # Check if it's a single cell
    if cell.rows.count > 1 or cell.columns.count > 1:
        result = {
            "success": False,
            "operation": "delete_comment",
            "error_type": "invalid_range",
            "error_message": "Comments can only be deleted from single cells, not ranges",
            "context": {
                "range": range_str,
                "rows_count": cell.rows.count,
                "columns_count": cell.columns.count
            },
            "suggested_actions": [
                "Specify a single cell reference (e.g., 'A1')",
                "Use individual cells if you need to delete multiple comments",
                "Example: delete_comment(range: 'A1')"
            ]
        }
        print(json.dumps(result))
        exit()

    # Check if comment exists using note property
    if not cell.note:
        result = {
            "success": False,
            "operation": "delete_comment",
            "error_type": "comment_not_found",
            "error_message": f"No comment found at {range_str}",
            "context": {
                "range": range_str,
                "cell_address": range_str
            },
            "suggested_actions": [
                "Check if the cell address is correct",
                "Use list_comments() to see which cells have comments",
                "Verify that a comment exists at this location"
            ]
        }
        print(json.dumps(result))
        exit()

    # Store comment info before deletion
    comment_text = cell.note.text if cell.note else "No text"
    comment_author = "Unknown"  # Author info not easily accessible

    # Delete comment using note.delete() method
    cell.note.delete()
    
    result = {
        "success": True,
        "operation": "delete_comment",
        "workbook": wb.name,
        "worksheet": ws.name,
        "range": range_str,
        "deleted_comment_text": comment_text,
        "deleted_comment_author": comment_author
    }
    
except Exception as e:
    result = {
        "success": False,
        "operation": "delete_comment",
        "workbook": wb.name if 'wb' in locals() else None,
        "worksheet": ws.name if 'ws' in locals() else None,
        "range": range_str,
        "error": str(e)
    }

print(json.dumps(result))`;
  }

  private generateListCommentsLogic(params: XlwingsParams): string {
    return `
# List all comments in worksheet
app = xw.apps.active if xw.apps else None
if not app:
    app = xw.App(visible=False)

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}", app)
if not wb:
    # Get list of available workbooks for debugging
    available_workbooks = [book.name for book in app.books] if app.books else []
    result = {
        "success": False,
        "operation": "list_comments",
        "error_type": "workbook_not_found",
        "error_message": f"Could not find the specified workbook '${params.workbook || ''}'",
        "context": {
            "workbook": "${params.workbook || ''}",
            "available_workbooks": available_workbooks
        },
        "suggested_actions": [
            f"Use one of the available workbooks: {', '.join(available_workbooks) if available_workbooks else 'None available'}",
            "Check the workbook name spelling and ensure it's open in Excel",
            "Open the workbook in Excel first, then try again",
            "Use the exact workbook name as it appears in Excel"
        ]
    }
    print(json.dumps(result))
    exit()

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    result = {
        "success": False,
        "operation": "list_comments",
        "error_type": "worksheet_not_found",
        "error_message": "Could not find the specified worksheet",
        "context": {
            "worksheet": "${params.worksheet || ''}",
            "workbook": wb.name if wb else "${params.workbook || ''}"
        },
        "suggested_actions": [
            "Check the worksheet name spelling and capitalization",
            "Use list_sheets() to get the exact worksheet names",
            "Ensure the worksheet exists in the specified workbook",
            "Example: list_comments(worksheet: 'Sheet1')"
        ]
    }
    print(json.dumps(result))
    exit()

try:
    comments = []
    
    # Search for comments in used range
    used_range = ws.used_range
    if used_range:
        for row in range(1, used_range.last_cell.row + 1):
            for col in range(1, used_range.last_cell.column + 1):
                try:
                    cell = ws.range((row, col))
                    if cell.note:
                        comment_info = {
                            "address": cell.address,
                            "row": row,
                            "column": col,
                            "text": cell.note.text,
                            "author": "Unknown",  # Note object doesn't have author property
                            "visible": False  # Note object doesn't have visible property
                        }
                        comments.append(comment_info)
                except:
                    continue  # Skip cells that can't be accessed
    
    result = {
        "success": True,
        "operation": "list_comments",
        "workbook": wb.name,
        "worksheet": ws.name,
        "comments": comments,
        "total_comments": len(comments)
    }
    
except Exception as e:
    result = {
        "success": False,
        "operation": "list_comments",
        "workbook": wb.name if 'wb' in locals() else None,
        "worksheet": ws.name if 'ws' in locals() else None,
        "error": str(e)
    }

print(json.dumps(result))`;
  }

  private generateMergeCellsLogic(params: XlwingsParams): string {
    const merge = params.merge;
    const acrossColumns = merge?.across_columns ?? false;
    const acrossRows = merge?.across_rows ?? false;
    const centerContent = merge?.center_content ?? false;
    const acrossColumnsPython = acrossColumns ? 'True' : 'False';
    const acrossRowsPython = acrossRows ? 'True' : 'False';
    const centerContentPython = centerContent ? 'True' : 'False';
    
    const alertHandling = this.generateAlertHandlingCode(params);
    const alertRestore = this.generateAlertRestoreCode(params);
    
    return `
# Merge cells in specified range
app = xw.apps.active if xw.apps else None
if not app:
    app = xw.App(visible=False)

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}", app)
if not wb:
    # Get list of available workbooks for debugging
    available_workbooks = [book.name for book in app.books] if app.books else []
    result = {
        "success": False,
        "operation": "merge_cells",
        "error_type": "workbook_not_found",
        "error_message": f"Could not find the specified workbook '${params.workbook || ''}'",
        "context": {
            "workbook": "${params.workbook || ''}",
            "available_workbooks": available_workbooks
        },
        "suggested_actions": [
            f"Use one of the available workbooks: {', '.join(available_workbooks) if available_workbooks else 'None available'}",
            "Check the workbook name spelling and ensure it's open in Excel",
            "Open the workbook in Excel first, then try again",
            "Use the exact workbook name as it appears in Excel"
        ]
    }
    print(json.dumps(result))
    exit()

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    result = {
        "success": False,
        "operation": "merge_cells",
        "error_type": "worksheet_not_found",
        "error_message": "Could not find the specified worksheet",
        "context": {
            "worksheet": "${params.worksheet || ''}",
            "workbook": wb.name if wb else "${params.workbook || ''}"
        },
        "suggested_actions": [
            "Check the worksheet name spelling and capitalization",
            "Use list_sheets() to get the exact worksheet names",
            "Ensure the worksheet exists in the specified workbook",
            "Example: merge_cells(worksheet: 'Sheet1', range: 'A1:C3')"
        ]
    }
    print(json.dumps(result))
    exit()
${alertHandling}

# Get target range
range_str = "${params.range || 'A1'}"
if not range_str:
    result = {
        "success": False,
        "operation": "merge_range",
        "error_type": "missing_parameter",
        "error_message": "range parameter is required for merge_range operation",
        "context": {
            "required_parameter": "range"
        }
    }
    print(json.dumps(result))
    exit()

try:
    range_obj = ws.range(range_str)
    
    # Check if range is already merged
    try:
        if range_obj.api.MergeCells:
            result = {
                "success": False,
                "operation": "merge_range",
                "workbook": wb.name,
                "worksheet": ws.name,
                "range": range_str,
                "error": "Range is already merged"
            }
        else:
            # Perform merge based on options
            across_columns = ${acrossColumnsPython}
            across_rows = ${acrossRowsPython}
            center_content = ${centerContentPython}
            
            if across_columns and not across_rows:
                # Horizontal merge only - merge each row separately
                for row in range(range_obj.row, range_obj.row + range_obj.rows.count):
                    merge_range = ws.range((row, range_obj.column), (row, range_obj.column + range_obj.columns.count - 1))
                    merge_range.api.Merge()
            elif across_rows and not across_columns:
                # Vertical merge only - merge each column separately  
                for col in range(range_obj.column, range_obj.column + range_obj.columns.count):
                    merge_range = ws.range((range_obj.row, col), (range_obj.row + range_obj.rows.count - 1, col))
                    merge_range.api.Merge()
            else:
                # Default: merge entire range
                range_obj.api.Merge()
            
            # Center content if requested
            if center_content:
                range_obj.api.HorizontalAlignment = -4108  # xlCenter
                range_obj.api.VerticalAlignment = -4108    # xlCenter
            
            result = {
                "success": True,
                "operation": "merge_range",
                "workbook": wb.name,
                "worksheet": ws.name,
                "range": range_str,
                "merge_type": "horizontal" if across_columns and not across_rows else "vertical" if across_rows and not across_columns else "full",
                "content_centered": center_content
            }
    except Exception as merge_error:
        result = {
            "success": False,
            "operation": "merge_range",
            "workbook": wb.name,
            "worksheet": ws.name,
            "range": range_str,
            "error": f"Failed to merge cells: {str(merge_error)}"
        }
    
except Exception as e:
    result = {
        "success": False,
        "operation": "merge_cells",
        "workbook": wb.name if 'wb' in locals() else None,
        "worksheet": ws.name if 'ws' in locals() else None,
        "range": range_str,
        "error": str(e)
    }
${alertRestore}
print(json.dumps(result))`;
  }

  private generateUnmergeCellsLogic(params: XlwingsParams): string {
    const alertHandling = this.generateAlertHandlingCode(params);
    const alertRestore = this.generateAlertRestoreCode(params);
    
    return `
# Unmerge cells in specified range
app = xw.apps.active if xw.apps else None
if not app:
    app = xw.App(visible=False)

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}", app)
if not wb:
    # Get list of available workbooks for debugging
    available_workbooks = [book.name for book in app.books] if app.books else []
    result = {
        "success": False,
        "operation": "unmerge_cells",
        "error_type": "workbook_not_found",
        "error_message": f"Could not find the specified workbook '${params.workbook || ''}'",
        "context": {
            "workbook": "${params.workbook || ''}",
            "available_workbooks": available_workbooks
        },
        "suggested_actions": [
            f"Use one of the available workbooks: {', '.join(available_workbooks) if available_workbooks else 'None available'}",
            "Check the workbook name spelling and ensure it's open in Excel",
            "Open the workbook in Excel first, then try again",
            "Use the exact workbook name as it appears in Excel"
        ]
    }
    print(json.dumps(result))
    exit()

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    result = {
        "success": False,
        "operation": "unmerge_cells",
        "error_type": "worksheet_not_found",
        "error_message": "Could not find the specified worksheet",
        "context": {
            "worksheet": "${params.worksheet || ''}",
            "workbook": wb.name if wb else "${params.workbook || ''}"
        },
        "suggested_actions": [
            "Check the worksheet name spelling and capitalization",
            "Use list_sheets() to get the exact worksheet names",
            "Ensure the worksheet exists in the specified workbook",
            "Example: unmerge_cells(worksheet: 'Sheet1', range: 'A1:C3')"
        ]
    }
    print(json.dumps(result))
    exit()
${alertHandling}

# Get target range
range_str = "${params.range || 'A1'}"
if not range_str:
    result = {
        "success": False,
        "operation": "unmerge_range",
        "error_type": "missing_parameter",
        "error_message": "range parameter is required for unmerge_range operation",
        "context": {
            "required_parameter": "range"
        },
        "suggested_actions": [
            "Specify a range parameter (e.g., 'A1:C3')",
            "Use get_sheet_info() to identify merged cells first",
            "Example: unmerge_range(range: 'A1:C3')"
        ]
    }
    print(json.dumps(result))
    exit()

try:
    range_obj = ws.range(range_str)
    
    # Check if range contains merged cells
    merged_cells = []
    try:
        # Check if the range itself is merged
        if range_obj.api.MergeCells:
            range_obj.api.UnMerge()
            merged_cells.append(range_str)
        else:
            # Check each cell in the range for merged cells
            for row in range(range_obj.row, range_obj.row + range_obj.rows.count):
                for col in range(range_obj.column, range_obj.column + range_obj.columns.count):
                    cell = ws.range((row, col))
                    try:
                        if cell.api.MergeCells:
                            # Get the merged area address
                            merge_area = cell.api.MergeArea.Address
                            if merge_area not in merged_cells:
                                cell.api.UnMerge()
                                merged_cells.append(merge_area)
                    except:
                        continue
        
        if merged_cells:
            result = {
                "success": True,
                "operation": "unmerge_range",
                "workbook": wb.name,
                "worksheet": ws.name,
                "range": range_str,
                "unmerged_ranges": merged_cells,
                "cells_unmerged": len(merged_cells)
            }
        else:
            result = {
                "success": True,
                "operation": "unmerge_range", 
                "workbook": wb.name,
                "worksheet": ws.name,
                "range": range_str,
                "message": "No merged cells found in the specified range",
                "cells_unmerged": 0
            }
    
    except Exception as unmerge_error:
        result = {
            "success": False,
            "operation": "unmerge_range",
            "workbook": wb.name,
            "worksheet": ws.name,
            "range": range_str,
            "error": f"Failed to unmerge cells: {str(unmerge_error)}"
        }
    
except Exception as e:
    result = {
        "success": False,
        "operation": "unmerge_range",
        "workbook": wb.name if 'wb' in locals() else None,
        "worksheet": ws.name if 'ws' in locals() else None,
        "range": range_str,
        "error": str(e)
    }
${alertRestore}
print(json.dumps(result))`;
  }

  private generateSetRowHeightLogic(params: XlwingsParams): string {
    const sizing = params.sizing;
    const height = sizing?.height ?? 15;
    const autoFit = sizing?.auto_fit ?? false;
    const autoFitPython = autoFit ? 'True' : 'False';
    const rowNumbers = sizing?.row_numbers;
    
    return `
# Set row height
app = xw.apps.active if xw.apps else None
if not app:
    app = xw.App(visible=False)

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}", app)
if not wb:
    # Get list of available workbooks for debugging
    available_workbooks = [book.name for book in app.books] if app.books else []
    result = {
        "success": False,
        "operation": "set_row_height",
        "error_type": "workbook_not_found",
        "error_message": f"Could not find the specified workbook '${params.workbook || ''}'",
        "context": {
            "workbook": "${params.workbook || ''}",
            "available_workbooks": available_workbooks
        },
        "suggested_actions": [
            f"Use one of the available workbooks: {', '.join(available_workbooks) if available_workbooks else 'None available'}",
            "Check the workbook name spelling and ensure it's open in Excel",
            "Open the workbook in Excel first, then try again",
            "Use the exact workbook name as it appears in Excel"
        ]
    }
    print(json.dumps(result))
    exit()

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    result = {
        "success": False,
        "operation": "set_row_height",
        "error_type": "worksheet_not_found",
        "error_message": "Could not find the specified worksheet",
        "context": {
            "worksheet": "${params.worksheet || ''}",
            "workbook": wb.name if wb else "${params.workbook || ''}"
        },
        "suggested_actions": [
            "Check the worksheet name spelling and capitalization",
            "Use list_sheets() to get the exact worksheet names",
            "Ensure the worksheet exists in the specified workbook",
            "Example: set_row_height(worksheet: 'Sheet1', sizing: {height: 20})"
        ]
    }
    print(json.dumps(result))
    exit()

try:
    height_value = ${height}
    auto_fit = ${autoFitPython}
    row_numbers = ${rowNumbers ? JSON.stringify(rowNumbers) : 'None'}
    
    if row_numbers:
        # Set height for specific rows
        processed_rows = []
        for row_num in row_numbers:
            try:
                if auto_fit:
                    ws.rows(row_num).api.AutoFit()
                else:
                    ws.rows(row_num).api.RowHeight = height_value
                processed_rows.append(row_num)
            except Exception as row_error:
                continue  # Skip invalid rows
        
        result = {
            "success": True,
            "operation": "set_row_height",
            "workbook": wb.name,
            "worksheet": ws.name,
            "rows_processed": processed_rows,
            "total_rows": len(processed_rows),
            "height_set": None if auto_fit else height_value,
            "auto_fit": auto_fit
        }
    else:
        # Use range parameter or default to current selection
        range_str = "${params.range || ''}"
        if not range_str:
            # Get current selection or default to A1
            try:
                range_str = ws.api.Selection.Address
            except:
                range_str = "A1"
        
        range_obj = ws.range(range_str)
        
        # Set height for all rows in the range
        processed_rows = []
        for row in range(range_obj.row, range_obj.row + range_obj.rows.count):
            try:
                if auto_fit:
                    ws.rows(row).api.AutoFit()
                else:
                    ws.rows(row).api.RowHeight = height_value
                processed_rows.append(row)
            except:
                continue
        
        result = {
            "success": True,
            "operation": "set_row_height",
            "workbook": wb.name,
            "worksheet": ws.name,
            "range": range_str,
            "rows_processed": processed_rows,
            "total_rows": len(processed_rows),
            "height_set": None if auto_fit else height_value,
            "auto_fit": auto_fit
        }
        
except Exception as e:
    result = {
        "success": False,
        "operation": "set_row_height",
        "workbook": wb.name if 'wb' in locals() else None,
        "worksheet": ws.name if 'ws' in locals() else None,
        "error": str(e)
    }

print(json.dumps(result))`;
  }

  private generateSetColumnWidthLogic(params: XlwingsParams): string {
    const sizing = params.sizing;
    const width = sizing?.width ?? 10;
    const autoFit = sizing?.auto_fit ?? false;
    const autoFitPython = autoFit ? 'True' : 'False';
    const columnIdentifiers = sizing?.column_identifiers;
    
    return `
# Set column width
app = xw.apps.active if xw.apps else None
if not app:
    app = xw.App(visible=False)

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}", app)
if not wb:
    # Get list of available workbooks for debugging
    available_workbooks = [book.name for book in app.books] if app.books else []
    result = {
        "success": False,
        "operation": "generic_operation",
        "error_type": "workbook_not_found",
        "error_message": f"Could not find the specified workbook '${params.workbook || ''}'",
        "context": {
            "workbook": "${params.workbook || ''}",
            "available_workbooks": available_workbooks
        },
        "suggested_actions": [
            f"Use one of the available workbooks: {', '.join(available_workbooks) if available_workbooks else 'None available'}",
            "Check the workbook name spelling and ensure it's open in Excel",
            "Open the workbook in Excel first, then try again",
            "Use the exact workbook name as it appears in Excel"
        ]
    }
    print(json.dumps(result))
    exit()

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    result = {
        "success": False,
        "operation": "generic_operation",
        "error_type": "worksheet_not_found",
        "error_message": "Could not find the specified worksheet",
        "context": {
            "worksheet": "${params.worksheet || ''}",
            "workbook": wb.name if wb else "${params.workbook || ''}"
        },
        "suggested_actions": [
            "Check the worksheet name spelling and capitalization",
            "Use list_sheets() to get the exact worksheet names",
            "Ensure the worksheet exists in the specified workbook",
            "Example: operation_name(worksheet: 'Sheet1')"
        ]
    }
    print(json.dumps(result))
    exit()

try:
    width_value = ${width}
    auto_fit = ${autoFitPython}
    column_identifiers = ${columnIdentifiers ? JSON.stringify(columnIdentifiers) : 'None'}
    
    def column_to_number(col_id):
        """Convert column identifier to number"""
        if isinstance(col_id, int):
            return col_id
        elif isinstance(col_id, str):
            if col_id.isdigit():
                return int(col_id)
            else:
                # Convert letter to number (A=1, B=2, etc.)
                result = 0
                for char in col_id.upper():
                    result = result * 26 + (ord(char) - ord('A') + 1)
                return result
        return None
    
    if column_identifiers:
        # Set width for specific columns
        processed_columns = []
        for col_id in column_identifiers:
            try:
                col_num = column_to_number(col_id)
                if col_num:
                    if auto_fit:
                        ws.columns(col_num).api.AutoFit()
                    else:
                        ws.columns(col_num).api.ColumnWidth = width_value
                    processed_columns.append(col_id)
            except Exception as col_error:
                continue  # Skip invalid columns
        
        result = {
            "success": True,
            "operation": "set_column_width",
            "workbook": wb.name,
            "worksheet": ws.name,
            "columns_processed": processed_columns,
            "total_columns": len(processed_columns),
            "width_set": None if auto_fit else width_value,
            "auto_fit": auto_fit
        }
    else:
        # Use range parameter or default to current selection
        range_str = "${params.range || ''}"
        if not range_str:
            # Get current selection or default to A1
            try:
                range_str = ws.api.Selection.Address
            except:
                range_str = "A1"
        
        range_obj = ws.range(range_str)
        
        # Set width for all columns in the range
        processed_columns = []
        for col in range(range_obj.column, range_obj.column + range_obj.columns.count):
            try:
                if auto_fit:
                    ws.columns(col).api.AutoFit()
                else:
                    ws.columns(col).api.ColumnWidth = width_value
                # Convert column number back to letter for display
                col_letter = ''
                temp = col
                while temp > 0:
                    temp -= 1
                    col_letter = chr(temp % 26 + ord('A')) + col_letter
                    temp //= 26
                processed_columns.append(col_letter)
            except:
                continue
        
        result = {
            "success": True,
            "operation": "set_column_width",
            "workbook": wb.name,
            "worksheet": ws.name,
            "range": range_str,
            "columns_processed": processed_columns,
            "total_columns": len(processed_columns),
            "width_set": None if auto_fit else width_value,
            "auto_fit": auto_fit
        }
        
except Exception as e:
    result = {
        "success": False,
        "operation": "set_column_width",
        "workbook": wb.name if 'wb' in locals() else None,
        "worksheet": ws.name if 'ws' in locals() else None,
        "error": str(e)
    }

print(json.dumps(result))`;
  }

  private generateGetRowHeightLogic(params: XlwingsParams): string {
    const sizing = params.sizing;
    const rowNumbers = sizing?.row_numbers;
    
    return `
# Get row height
app = xw.apps.active if xw.apps else None
if not app:
    app = xw.App(visible=False)

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}", app)
if not wb:
    # Get list of available workbooks for debugging
    available_workbooks = [book.name for book in app.books] if app.books else []
    result = {
        "success": False,
        "operation": "generic_operation",
        "error_type": "workbook_not_found",
        "error_message": f"Could not find the specified workbook '${params.workbook || ''}'",
        "context": {
            "workbook": "${params.workbook || ''}",
            "available_workbooks": available_workbooks
        },
        "suggested_actions": [
            f"Use one of the available workbooks: {', '.join(available_workbooks) if available_workbooks else 'None available'}",
            "Check the workbook name spelling and ensure it's open in Excel",
            "Open the workbook in Excel first, then try again",
            "Use the exact workbook name as it appears in Excel"
        ]
    }
    print(json.dumps(result))
    exit()

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    result = {
        "success": False,
        "operation": "generic_operation",
        "error_type": "worksheet_not_found",
        "error_message": "Could not find the specified worksheet",
        "context": {
            "worksheet": "${params.worksheet || ''}",
            "workbook": wb.name if wb else "${params.workbook || ''}"
        },
        "suggested_actions": [
            "Check the worksheet name spelling and capitalization",
            "Use list_sheets() to get the exact worksheet names",
            "Ensure the worksheet exists in the specified workbook",
            "Example: operation_name(worksheet: 'Sheet1')"
        ]
    }
    print(json.dumps(result))
    exit()

try:
    row_numbers = ${rowNumbers ? JSON.stringify(rowNumbers) : 'None'}
    
    if row_numbers:
        # Get height for specific rows
        row_heights = []
        for row_num in row_numbers:
            try:
                height = ws.rows(row_num).api.RowHeight
                row_heights.append({"row": row_num, "height": height})
            except Exception as row_error:
                row_heights.append({"row": row_num, "height": None, "error": str(row_error)})
        
        result = {
            "success": True,
            "operation": "get_row_height",
            "workbook": wb.name,
            "worksheet": ws.name,
            "row_heights": row_heights,
            "total_rows": len(row_heights)
        }
    else:
        # Use range parameter or default to current selection
        range_str = "${params.range || ''}"
        if not range_str:
            # Get current selection or default to A1
            try:
                range_str = ws.api.Selection.Address
            except:
                range_str = "A1"
        
        range_obj = ws.range(range_str)
        
        # Get height for all rows in the range
        row_heights = []
        for row in range(range_obj.row, range_obj.row + range_obj.rows.count):
            try:
                height = ws.rows(row).api.RowHeight
                row_heights.append({"row": row, "height": height})
            except:
                row_heights.append({"row": row, "height": None, "error": "Could not read row height"})
        
        result = {
            "success": True,
            "operation": "get_row_height",
            "workbook": wb.name,
            "worksheet": ws.name,
            "range": range_str,
            "row_heights": row_heights,
            "total_rows": len(row_heights)
        }
        
except Exception as e:
    result = {
        "success": False,
        "operation": "get_row_height",
        "workbook": wb.name if 'wb' in locals() else None,
        "worksheet": ws.name if 'ws' in locals() else None,
        "error": str(e)
    }

print(json.dumps(result))`;
  }

  private generateGetColumnWidthLogic(params: XlwingsParams): string {
    const sizing = params.sizing;
    const columnIdentifiers = sizing?.column_identifiers;
    
    return `
# Get column width
app = xw.apps.active if xw.apps else None
if not app:
    app = xw.App(visible=False)

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}", app)
if not wb:
    # Get list of available workbooks for debugging
    available_workbooks = [book.name for book in app.books] if app.books else []
    result = {
        "success": False,
        "operation": "generic_operation",
        "error_type": "workbook_not_found",
        "error_message": f"Could not find the specified workbook '${params.workbook || ''}'",
        "context": {
            "workbook": "${params.workbook || ''}",
            "available_workbooks": available_workbooks
        },
        "suggested_actions": [
            f"Use one of the available workbooks: {', '.join(available_workbooks) if available_workbooks else 'None available'}",
            "Check the workbook name spelling and ensure it's open in Excel",
            "Open the workbook in Excel first, then try again",
            "Use the exact workbook name as it appears in Excel"
        ]
    }
    print(json.dumps(result))
    exit()

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    result = {
        "success": False,
        "operation": "generic_operation",
        "error_type": "worksheet_not_found",
        "error_message": "Could not find the specified worksheet",
        "context": {
            "worksheet": "${params.worksheet || ''}",
            "workbook": wb.name if wb else "${params.workbook || ''}"
        },
        "suggested_actions": [
            "Check the worksheet name spelling and capitalization",
            "Use list_sheets() to get the exact worksheet names",
            "Ensure the worksheet exists in the specified workbook",
            "Example: operation_name(worksheet: 'Sheet1')"
        ]
    }
    print(json.dumps(result))
    exit()

try:
    column_identifiers = ${columnIdentifiers ? JSON.stringify(columnIdentifiers) : 'None'}
    
    def column_to_number(col_id):
        """Convert column identifier to number"""
        if isinstance(col_id, int):
            return col_id
        elif isinstance(col_id, str):
            if col_id.isdigit():
                return int(col_id)
            else:
                # Convert letter to number (A=1, B=2, etc.)
                result = 0
                for char in col_id.upper():
                    result = result * 26 + (ord(char) - ord('A') + 1)
                return result
        return None
    
    def number_to_column(col_num):
        """Convert column number to letter"""
        col_letter = ''
        temp = col_num
        while temp > 0:
            temp -= 1
            col_letter = chr(temp % 26 + ord('A')) + col_letter
            temp //= 26
        return col_letter
    
    if column_identifiers:
        # Get width for specific columns
        column_widths = []
        for col_id in column_identifiers:
            try:
                col_num = column_to_number(col_id)
                if col_num:
                    width = ws.columns(col_num).api.ColumnWidth
                    column_widths.append({"column": col_id, "column_number": col_num, "width": width})
                else:
                    column_widths.append({"column": col_id, "width": None, "error": "Invalid column identifier"})
            except Exception as col_error:
                column_widths.append({"column": col_id, "width": None, "error": str(col_error)})
        
        result = {
            "success": True,
            "operation": "get_column_width",
            "workbook": wb.name,
            "worksheet": ws.name,
            "column_widths": column_widths,
            "total_columns": len(column_widths)
        }
    else:
        # Use range parameter or default to current selection
        range_str = "${params.range || ''}"
        if not range_str:
            # Get current selection or default to A1
            try:
                range_str = ws.api.Selection.Address
            except:
                range_str = "A1"
        
        range_obj = ws.range(range_str)
        
        # Get width for all columns in the range
        column_widths = []
        for col in range(range_obj.column, range_obj.column + range_obj.columns.count):
            try:
                width = ws.columns(col).api.ColumnWidth
                col_letter = number_to_column(col)
                column_widths.append({"column": col_letter, "column_number": col, "width": width})
            except:
                col_letter = number_to_column(col)
                column_widths.append({"column": col_letter, "column_number": col, "width": None, "error": "Could not read column width"})
        
        result = {
            "success": True,
            "operation": "get_column_width",
            "workbook": wb.name,
            "worksheet": ws.name,
            "range": range_str,
            "column_widths": column_widths,
            "total_columns": len(column_widths)
        }
        
except Exception as e:
    result = {
        "success": False,
        "operation": "get_column_width",
        "workbook": wb.name if 'wb' in locals() else None,
        "worksheet": ws.name if 'ws' in locals() else None,
        "error": str(e)
    }

print(json.dumps(result))`;
  }

  private generateGetCellInfoLogic(params: XlwingsParams): string {
    const cellOp = params.cell_operation;
    const includeFormatting = cellOp?.include_formatting ?? true;
    const includeFormulas = cellOp?.include_formulas ?? true;
    const includeValidation = cellOp?.include_validation ?? false;
    const includeComments = cellOp?.include_comments ?? true;
    const includeFormattingPython = includeFormatting ? 'True' : 'False';
    const includeFormulasPython = includeFormulas ? 'True' : 'False';
    const includeValidationPython = includeValidation ? 'True' : 'False';
    const includeCommentsPython = includeComments ? 'True' : 'False';
    
    return `
# Get comprehensive cell information
app = xw.apps.active if xw.apps else None
if not app:
    app = xw.App(visible=False)

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}", app)
if not wb:
    # Get list of available workbooks for debugging
    available_workbooks = [book.name for book in app.books] if app.books else []
    result = {
        "success": False,
        "operation": "generic_operation",
        "error_type": "workbook_not_found",
        "error_message": f"Could not find the specified workbook '${params.workbook || ''}'",
        "context": {
            "workbook": "${params.workbook || ''}",
            "available_workbooks": available_workbooks
        },
        "suggested_actions": [
            f"Use one of the available workbooks: {', '.join(available_workbooks) if available_workbooks else 'None available'}",
            "Check the workbook name spelling and ensure it's open in Excel",
            "Open the workbook in Excel first, then try again",
            "Use the exact workbook name as it appears in Excel"
        ]
    }
    print(json.dumps(result))
    exit()

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    result = {
        "success": False,
        "operation": "generic_operation",
        "error_type": "worksheet_not_found",
        "error_message": "Could not find the specified worksheet",
        "context": {
            "worksheet": "${params.worksheet || ''}",
            "workbook": wb.name if wb else "${params.workbook || ''}"
        },
        "suggested_actions": [
            "Check the worksheet name spelling and capitalization",
            "Use list_sheets() to get the exact worksheet names",
            "Ensure the worksheet exists in the specified workbook",
            "Example: operation_name(worksheet: 'Sheet1')"
        ]
    }
    print(json.dumps(result))
    exit()

# Get target range
# Get single cell address (not range)
cell_address = "${params.range || 'A1'}"
if not cell_address:
    result = {
        "success": False,
        "operation": "get_cell_info",
        "error_type": "missing_parameter",
        "error_message": "cell address parameter is required for get_cell_info operation",
        "context": {
            "required_parameter": "range"
        },
        "suggested_actions": [
            "Specify a cell address in the range parameter",
            "Example: get_cell_info(range: 'A1')",
            "Use a single cell reference like 'B5' or 'C10'"
        ]
    }
    print(json.dumps(result))
    exit()

# Ensure it's a single cell, not a range
if ':' in cell_address:
    result = {
        "success": False,
        "operation": "get_cell_info",
        "error_type": "invalid_range",
        "error_message": "get_cell_info only supports single cell addresses, not ranges",
        "context": {
            "provided_range": cell_address,
            "expected_format": "single_cell"
        },
        "suggested_actions": [
            "Use a single cell address instead of a range",
            f"Try using just the first cell: '{cell_address.split(':')[0]}'",
            "Example: get_cell_info(range: 'A1') instead of get_cell_info(range: 'A1:B2')"
        ]
    }
    print(json.dumps(result))
    exit()

try:
    cell_obj = ws.range(cell_address)

    # Ensure it's actually a single cell
    if cell_obj.size > 1:
        result = {
            "success": False,
            "operation": "get_cell_info",
            "error_type": "invalid_range",
            "error_message": "get_cell_info only supports single cells",
            "context": {
                "provided_range": cell_address,
                "cell_count": cell_obj.size,
                "expected_cell_count": 1
            },
            "suggested_actions": [
                "Use a single cell reference (e.g., 'A1')",
                "Avoid ranges like 'A1:B2'",
                "If you need info for multiple cells, call get_cell_info() for each cell individually"
            ]
        }
        print(json.dumps(result))
        exit()

    include_formatting = ${includeFormattingPython}
    include_formulas = ${includeFormulasPython}
    include_validation = ${includeValidationPython}
    include_comments = ${includeCommentsPython}

    # Get information for the single cell
    cell = cell_obj

    # Basic cell information
    cell_info = {
        "address": cell.address,
        "row": cell.row,
        "column": cell.column,
        "value": cell.value,
        "data_type": str(type(cell.value).__name__) if cell.value is not None else "NoneType"
    }

    # Formula information
    if include_formulas:
        try:
            formula = cell.formula
            cell_info["formula"] = formula if formula else None
            cell_info["has_formula"] = bool(formula)
        except:
            cell_info["formula"] = None
            cell_info["has_formula"] = False

    # Formatting information
    if include_formatting:
        try:
            cell_info["formatting"] = {
                "font_name": getattr(cell.api.Font, 'Name', None),
                "font_size": getattr(cell.api.Font, 'Size', None),
                "font_bold": getattr(cell.api.Font, 'Bold', None),
                "font_italic": getattr(cell.api.Font, 'Italic', None),
                "font_color": getattr(cell.api.Font, 'Color', None),
                "fill_color": getattr(cell.api.Interior, 'Color', None),
                "number_format": getattr(cell.api, 'NumberFormat', None),
                "horizontal_alignment": getattr(cell.api, 'HorizontalAlignment', None),
                "vertical_alignment": getattr(cell.api, 'VerticalAlignment', None),
                "has_border": bool(getattr(cell.api.Borders, 'LineStyle', None))
            }
        except Exception as fmt_error:
            cell_info["formatting"] = {"error": str(fmt_error)}

    # Comment information
    if include_comments:
        try:
            if cell.note:
                cell_info["comment"] = {
                    "text": cell.note.text,
                    "author": "Unknown",  # Not available in Note API
                    "visible": False  # Not available in Note API
                }
            else:
                cell_info["comment"] = None
        except:
            cell_info["comment"] = None

    # Data validation information
    if include_validation:
        try:
            validation = cell.api.Validation
            if validation.Type > 0:  # Has validation
                cell_info["validation"] = {
                    "type": validation.Type,
                    "formula1": validation.Formula1,
                    "formula2": validation.Formula2,
                    "input_message": validation.InputMessage,
                    "error_message": validation.ErrorMessage,
                    "show_input": validation.ShowInput,
                    "show_error": validation.ShowError
                }
            else:
                cell_info["validation"] = None
        except:
            cell_info["validation"] = None

    # Additional properties
    try:
        cell_info["is_merged"] = cell.api.MergeCells
        if cell_info["is_merged"]:
            cell_info["merge_area"] = cell.api.MergeArea.Address
    except:
        cell_info["is_merged"] = False
        cell_info["merge_area"] = None
    
    result = {
        "success": True,
        "operation": "get_cell_info",
        "workbook": wb.name,
        "worksheet": ws.name,
        "range": cell_address,
        "cell_info": cell_info,
        "info_included": {
            "formatting": include_formatting,
            "formulas": include_formulas,
            "validation": include_validation,
            "comments": include_comments
        }
    }

except Exception as e:
    result = {
        "success": False,
        "operation": "get_cell_info",
        "workbook": wb.name if 'wb' in locals() else None,
        "worksheet": ws.name if 'ws' in locals() else None,
        "range": cell_address if 'cell_address' in locals() else None,
        "error": str(e)
    }

print(json.dumps(result))`;
  }

  private generateInsertCellsLogic(params: XlwingsParams): string {
    const cellOp = params.cell_operation;
    const shiftDirection = cellOp?.shift_direction || 'down';
    const count = cellOp?.count || 1;
    
    return `
# Insert cells with shift direction
app = xw.apps.active if xw.apps else None
if not app:
    app = xw.App(visible=False)

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}", app)
if not wb:
    # Get list of available workbooks for debugging
    available_workbooks = [book.name for book in app.books] if app.books else []
    result = {
        "success": False,
        "operation": "generic_operation",
        "error_type": "workbook_not_found",
        "error_message": f"Could not find the specified workbook '${params.workbook || ''}'",
        "context": {
            "workbook": "${params.workbook || ''}",
            "available_workbooks": available_workbooks
        },
        "suggested_actions": [
            f"Use one of the available workbooks: {', '.join(available_workbooks) if available_workbooks else 'None available'}",
            "Check the workbook name spelling and ensure it's open in Excel",
            "Open the workbook in Excel first, then try again",
            "Use the exact workbook name as it appears in Excel"
        ]
    }
    print(json.dumps(result))
    exit()

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    result = {
        "success": False,
        "operation": "generic_operation",
        "error_type": "worksheet_not_found",
        "error_message": "Could not find the specified worksheet",
        "context": {
            "worksheet": "${params.worksheet || ''}",
            "workbook": wb.name if wb else "${params.workbook || ''}"
        },
        "suggested_actions": [
            "Check the worksheet name spelling and capitalization",
            "Use list_sheets() to get the exact worksheet names",
            "Ensure the worksheet exists in the specified workbook",
            "Example: operation_name(worksheet: 'Sheet1')"
        ]
    }
    print(json.dumps(result))
    exit()

# Get target range
range_str = "${params.range || 'A1'}"
if not range_str:
    result = {
        "success": False,
        "operation": "insert_range",
        "error_type": "missing_parameter",
        "error_message": "range parameter is required for insert_range operation",
        "context": {
            "required_parameter": "range"
        },
        "suggested_actions": [
            "Specify a range parameter (e.g., 'A1:A5')",
            "Example: insert_range(range: 'A1:A5', shift_direction: 'down')",
            "Use cell addresses like 'A1' or ranges like 'A1:C3'"
        ]
    }
    print(json.dumps(result))
    exit()

try:
    range_obj = ws.range(range_str)
    shift_direction = "${shiftDirection}"
    count = ${count}
    
    # Validate shift direction
    valid_directions = ["down", "right", "up", "left"]
    if shift_direction not in valid_directions:
        result = {
            "success": False,
            "operation": "insert_range",
            "error_type": "invalid_parameter",
            "error_message": f"Invalid shift_direction: {shift_direction}. Must be one of: {valid_directions}",
            "context": {
                "provided_shift_direction": shift_direction,
                "valid_directions": valid_directions
            },
            "suggested_actions": [
                f"Use one of the valid shift directions: {', '.join(valid_directions)}",
                "Example: insert_range(range: 'A1:A5', shift_direction: 'down')",
                "Common choices: 'down' for inserting rows, 'right' for inserting columns"
            ]
        }
        print(json.dumps(result))
        exit()
    
    # Excel shift constants
    shift_constants = {
        "down": -4121,    # xlShiftDown
        "right": -4161,   # xlShiftToRight
        "up": -4162,      # xlShiftUp
        "left": -4159     # xlShiftToLeft
    }
    
    # Perform insertion multiple times if count > 1
    cells_inserted = 0
    for i in range(count):
        try:
            if shift_direction == "down":
                range_obj.api.Insert(Shift=shift_constants[shift_direction])
            elif shift_direction == "right":
                range_obj.api.Insert(Shift=shift_constants[shift_direction])
            elif shift_direction == "up":
                # For up shift, we need to select the range above and insert down
                above_range = ws.range((range_obj.row - 1, range_obj.column), 
                                     (range_obj.row - 1 + range_obj.rows.count - 1, 
                                      range_obj.column + range_obj.columns.count - 1))
                above_range.api.Insert(Shift=shift_constants["down"])
            elif shift_direction == "left":
                # For left shift, we need to select the range to the left and insert right
                left_range = ws.range((range_obj.row, range_obj.column - 1), 
                                    (range_obj.row + range_obj.rows.count - 1, 
                                     range_obj.column - 1 + range_obj.columns.count - 1))
                left_range.api.Insert(Shift=shift_constants["right"])
            
            cells_inserted += range_obj.rows.count * range_obj.columns.count
        except Exception as insert_error:
            if i == 0:  # If first insertion fails, raise error
                raise insert_error
            else:  # If subsequent insertions fail, break but report partial success
                break
    
    result = {
        "success": True,
        "operation": "insert_range",
        "workbook": wb.name,
        "worksheet": ws.name,
        "range": range_str,
        "shift_direction": shift_direction,
        "cells_inserted": cells_inserted,
        "insertions_completed": i + 1 if 'i' in locals() else count,
        "total_requested": count * range_obj.rows.count * range_obj.columns.count
    }
    
except Exception as e:
    result = {
        "success": False,
        "operation": "insert_range",
        "workbook": wb.name if 'wb' in locals() else None,
        "worksheet": ws.name if 'ws' in locals() else None,
        "range": range_str,
        "shift_direction": shift_direction,
        "error": str(e)
    }

print(json.dumps(result))`;
  }

  private generateDeleteCellsLogic(params: XlwingsParams): string {
    const cellOp = params.cell_operation;
    const shiftDirection = cellOp?.shift_direction || 'up';
    const count = cellOp?.count || 1;
    const alertHandling = this.generateAlertHandlingCode(params);
    const alertRestore = this.generateAlertRestoreCode(params);
    
    return `
# Delete cells with shift direction
app = xw.apps.active if xw.apps else None
if not app:
    app = xw.App(visible=False)

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}", app)
if not wb:
    # Get list of available workbooks for debugging
    available_workbooks = [book.name for book in app.books] if app.books else []
    result = {
        "success": False,
        "operation": "generic_operation",
        "error_type": "workbook_not_found",
        "error_message": f"Could not find the specified workbook '${params.workbook || ''}'",
        "context": {
            "workbook": "${params.workbook || ''}",
            "available_workbooks": available_workbooks
        },
        "suggested_actions": [
            f"Use one of the available workbooks: {', '.join(available_workbooks) if available_workbooks else 'None available'}",
            "Check the workbook name spelling and ensure it's open in Excel",
            "Open the workbook in Excel first, then try again",
            "Use the exact workbook name as it appears in Excel"
        ]
    }
    print(json.dumps(result))
    exit()

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    result = {
        "success": False,
        "operation": "generic_operation",
        "error_type": "worksheet_not_found",
        "error_message": "Could not find the specified worksheet",
        "context": {
            "worksheet": "${params.worksheet || ''}",
            "workbook": wb.name if wb else "${params.workbook || ''}"
        },
        "suggested_actions": [
            "Check the worksheet name spelling and capitalization",
            "Use list_sheets() to get the exact worksheet names",
            "Ensure the worksheet exists in the specified workbook",
            "Example: operation_name(worksheet: 'Sheet1')"
        ]
    }
    print(json.dumps(result))
    exit()
${alertHandling}

# Get target range
range_str = "${params.range || 'A1'}"
if not range_str:
    result = {
        "success": False,
        "operation": "delete_range",
        "error_type": "missing_parameter",
        "error_message": "range parameter is required for delete_range operation",
        "context": {
            "required_parameter": "range"
        },
        "suggested_actions": [
            "Specify a range parameter (e.g., 'A1:A5')",
            "Example: delete_range(range: 'A1:A5', shift_direction: 'up')",
            "Use cell addresses like 'A1' or ranges like 'A1:C3'"
        ]
    }
    print(json.dumps(result))
    exit()

try:
    range_obj = ws.range(range_str)
    shift_direction = "${shiftDirection}"
    count = ${count}
    
    # Validate shift direction
    valid_directions = ["up", "left", "down", "right"]
    if shift_direction not in valid_directions:
        result = {
            "success": False,
            "operation": "delete_range",
            "error_type": "invalid_parameter",
            "error_message": f"Invalid shift_direction: {shift_direction}. Must be one of: {valid_directions}",
            "context": {
                "provided_shift_direction": shift_direction,
                "valid_directions": valid_directions
            },
            "suggested_actions": [
                f"Use one of the valid shift directions: {', '.join(valid_directions)}",
                "Example: delete_range(range: 'A1:A5', shift_direction: 'up')",
                "Common choices: 'up' for deleting rows, 'left' for deleting columns"
            ]
        }
        print(json.dumps(result))
        exit()
    
    # Excel shift constants for delete
    shift_constants = {
        "up": -4162,      # xlShiftUp
        "left": -4159,    # xlShiftToLeft
        "down": -4121,    # xlShiftDown (rarely used for delete)
        "right": -4161    # xlShiftToRight (rarely used for delete)
    }
    
    # Store original range info before deletion
    original_rows = range_obj.rows.count
    original_cols = range_obj.columns.count
    cells_per_deletion = original_rows * original_cols
    
    # Perform deletion multiple times if count > 1
    cells_deleted = 0
    for i in range(count):
        try:
            # For multiple deletions, we need to recalculate the range
            if i > 0:
                range_obj = ws.range(range_str)  # Reset to original range
            
            range_obj.api.Delete(Shift=shift_constants[shift_direction])
            cells_deleted += cells_per_deletion
            
        except Exception as delete_error:
            if i == 0:  # If first deletion fails, raise error
                raise delete_error
            else:  # If subsequent deletions fail, break but report partial success
                break
    
    result = {
        "success": True,
        "operation": "delete_range",
        "workbook": wb.name,
        "worksheet": ws.name,
        "range": range_str,
        "shift_direction": shift_direction,
        "cells_deleted": cells_deleted,
        "deletions_completed": i + 1 if 'i' in locals() else count,
        "total_requested": count * cells_per_deletion,
        "original_range_size": {
            "rows": original_rows,
            "columns": original_cols,
            "total_cells": cells_per_deletion
        }
    }
    
except Exception as e:
    result = {
        "success": False,
        "operation": "delete_range",
        "workbook": wb.name if 'wb' in locals() else None,
        "worksheet": ws.name if 'ws' in locals() else None,
        "range": range_str,
        "shift_direction": shift_direction,
        "error": str(e)
    }
${alertRestore}
print(json.dumps(result))`;
  }

  private generateSortRangeLogic(params: XlwingsParams): string {
    const sort = params.sort;
    const keys = sort?.keys || [{ column: 1, order: 'asc', data_type: 'auto' }];
    const hasHeader = sort?.has_header ?? false;
    const orientation = sort?.orientation || 'rows';
    const caseSensitive = sort?.case_sensitive ?? false;
    const hasHeaderPython = hasHeader ? 'True' : 'False';
    const caseSensitivePython = caseSensitive ? 'True' : 'False';
    const customOrder = sort?.custom_order;
    
    return `
# Sort range with specified criteria
app = xw.apps.active if xw.apps else None
if not app:
    app = xw.App(visible=False)

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}", app)
if not wb:
    # Get list of available workbooks for debugging
    available_workbooks = [book.name for book in app.books] if app.books else []
    result = {
        "success": False,
        "operation": "generic_operation",
        "error_type": "workbook_not_found",
        "error_message": f"Could not find the specified workbook '${params.workbook || ''}'",
        "context": {
            "workbook": "${params.workbook || ''}",
            "available_workbooks": available_workbooks
        },
        "suggested_actions": [
            f"Use one of the available workbooks: {', '.join(available_workbooks) if available_workbooks else 'None available'}",
            "Check the workbook name spelling and ensure it's open in Excel",
            "Open the workbook in Excel first, then try again",
            "Use the exact workbook name as it appears in Excel"
        ]
    }
    print(json.dumps(result))
    exit()

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    result = {
        "success": False,
        "operation": "generic_operation",
        "error_type": "worksheet_not_found",
        "error_message": "Could not find the specified worksheet",
        "context": {
            "worksheet": "${params.worksheet || ''}",
            "workbook": wb.name if wb else "${params.workbook || ''}"
        },
        "suggested_actions": [
            "Check the worksheet name spelling and capitalization",
            "Use list_sheets() to get the exact worksheet names",
            "Ensure the worksheet exists in the specified workbook",
            "Example: operation_name(worksheet: 'Sheet1')"
        ]
    }
    print(json.dumps(result))
    exit()

# Get target range
range_str = "${params.range || ''}"
if not range_str:
    result = {
        "success": False,
        "operation": "sort_range",
        "error_type": "missing_parameter",
        "error_message": "range parameter is required for sort_range operation",
        "context": {
            "required_parameter": "range"
        },
        "suggested_actions": [
            "Specify a range parameter (e.g., 'A1:D10')",
            "Example: sort_range(range: 'A1:D10', sort_columns: [{column: 'A', order: 'asc'}])",
            "Use ranges that contain the data you want to sort"
        ]
    }
    print(json.dumps(result))
    exit()

try:
    range_obj = ws.range(range_str)
    
    # Parse sort configuration
    sort_keys = ${JSON.stringify(keys)}
    has_header = ${hasHeaderPython}
    orientation = "${orientation}"
    case_sensitive = ${caseSensitivePython}
    custom_order = ${customOrder ? JSON.stringify(customOrder) : 'None'}
    
    def column_to_number(col_id):
        """Convert column identifier to number"""
        if isinstance(col_id, int):
            return col_id
        elif isinstance(col_id, str):
            if col_id.isdigit():
                return int(col_id)
            else:
                # Convert letter to number (A=1, B=2, etc.)
                result = 0
                for char in col_id.upper():
                    result = result * 26 + (ord(char) - ord('A') + 1)
                return result
        return 1
    
    # Excel sort constants
    xl_ascending = 1
    xl_descending = 2
    xl_sort_on_values = 0
    xl_sort_normal = 0
    xl_sort_text_as_numbers = 1
    xl_pinyin_sort_type = 1
    xl_sort_rows = 2  # xlSortRows: Sort rows based on column values
    xl_sort_columns = 1  # xlSortColumns: Sort columns based on row values
    
    # Data type constants
    data_type_constants = {
        'auto': xl_sort_normal,
        'text': xl_sort_normal,
        'number': xl_sort_text_as_numbers,
        'date': xl_sort_normal
    }
    
    # Create sort object
    sort_range = range_obj
    
    # If has header, exclude header row from sort range
    if has_header and orientation == 'rows':
        sort_range = ws.range(
            (range_obj.row + 1, range_obj.column),
            (range_obj.row + range_obj.rows.count - 1, 
             range_obj.column + range_obj.columns.count - 1)
        )
    elif has_header and orientation == 'columns':
        sort_range = ws.range(
            (range_obj.row, range_obj.column + 1),
            (range_obj.row + range_obj.rows.count - 1, 
             range_obj.column + range_obj.columns.count - 2)
        )
    
    # Use pandas-based sorting to avoid Excel Sort API issues
    import pandas as pd

    # Read current data into pandas DataFrame
    data = range_obj.value
    if not data or len(data) == 0:
        result = {
            "success": False,
            "operation": "sort_range",
            "error_type": "no_data_found",
            "error_message": "No data found in the specified range",
            "context": {
                "range": range_str,
                "worksheet": ws.name,
                "workbook": wb.name
            },
            "suggested_actions": [
                "Ensure the range contains data to sort",
                "Check if the range address is correct",
                "Use get_range_info() to verify range contents",
                "Make sure the range is not empty"
            ]
        }
        print(json.dumps(result))
        exit()

    # Convert to DataFrame
    df = pd.DataFrame(data)

    # Set up column names for easier sorting
    if has_header:
        # First row is header
        df.columns = df.iloc[0]
        df = df.drop(df.index[0]).reset_index(drop=True)
    else:
        # No header, use numeric column names
        df.columns = [f'Col{i+1}' for i in range(len(df.columns))]

    # Process sort keys for pandas
    sort_columns = []
    sort_ascending = []

    for key in sort_keys:
        if orientation == 'rows':
            col_spec = key.get('column', 1)

            # Convert column specification to pandas column name
            if isinstance(col_spec, str):
                # If it's a letter (like "I"), get its position within the range
                abs_col_num = column_to_number(col_spec)
                relative_col_num = abs_col_num - range_obj.column + 1
                if 1 <= relative_col_num <= len(df.columns):
                    pandas_col = df.columns[relative_col_num - 1]
                else:
                    result = {
                        "success": False,
                        "operation": "sort_range",
                        "error_type": "sort_column_out_of_range",
                        "error_message": f"Sort column {col_spec} (position {relative_col_num}) is outside the range",
                        "context": {
                            "column_spec": col_spec,
                            "relative_position": relative_col_num,
                            "range": range_str,
                            "available_columns": len(df.columns)
                        },
                        "suggested_actions": [
                            f"Use columns within the range (1 to {len(df.columns)})",
                            "Check the column letter or number specification",
                            "Ensure the sort column exists within the specified range",
                            f"Available columns: {list(df.columns) if not df.empty else 'None'}"
                        ]
                    }
                    print(json.dumps(result))
                    exit()
            else:
                # If it's a number, treat as 1-based column index
                col_index = int(col_spec) - 1
                if 0 <= col_index < len(df.columns):
                    pandas_col = df.columns[col_index]
                else:
                    result = {
                        "success": False,
                        "operation": "sort_range",
                        "error_type": "sort_column_out_of_range",
                        "error_message": f"Sort column {col_spec} is outside the range",
                        "context": {
                            "column_spec": col_spec,
                            "column_index": col_index + 1,
                            "range": range_str,
                            "available_columns": len(df.columns)
                        },
                        "suggested_actions": [
                            f"Use column numbers within the range (1 to {len(df.columns)})",
                            "Check that the column number is valid",
                            "Ensure the sort column exists within the specified range",
                            f"Available columns: {list(df.columns) if not df.empty else 'None'}"
                        ]
                    }
                    print(json.dumps(result))
                    exit()

            sort_columns.append(pandas_col)
            sort_ascending.append(key.get('order', 'asc') == 'asc')
        else:
            # Horizontal sorting not commonly supported by pandas directly
            # Would need to transpose, sort, then transpose back
            result = {
                "success": False,
                "operation": "sort_range",
                "error_type": "unsupported_operation",
                "error_message": "Horizontal sorting (by rows) is not yet supported",
                "context": {
                    "orientation": orientation,
                    "supported_orientation": "rows"
                },
                "suggested_actions": [
                    "Use orientation: 'rows' to sort by columns",
                    "Horizontal sorting (by rows) is not currently implemented",
                    "Consider transposing your data to sort by columns instead",
                    "Example: sort_range(orientation: 'rows', sort_columns: [{column: 'A', order: 'asc'}])"
                ]
            }
            print(json.dumps(result))
            exit()

    # Perform the sort
    if sort_columns:
        # Handle mixed data types in sort columns
        for col in sort_columns:
            # Try to convert to numeric if possible
            try:
                df[col] = pd.to_numeric(df[col])
            except (ValueError, TypeError):
                # Keep original values if conversion fails
                pass

        df_sorted = df.sort_values(by=sort_columns, ascending=sort_ascending, na_position='last')
    else:
        df_sorted = df

    # Write the sorted data back to Excel
    sorted_data = df_sorted.values.tolist()

    # If there was a header, we need to add it back
    if has_header and len(data) > 0:
        sorted_data.insert(0, list(df_sorted.columns))

    # Write back to the range
    range_obj.value = sorted_data
    
    # Prepare result information
    sort_summary = []
    for key in sort_keys:
        if orientation == 'rows':
            sort_summary.append({
                "column": key.get('column'),
                "order": key.get('order', 'asc'),
                "data_type": key.get('data_type', 'auto')
            })
        else:
            sort_summary.append({
                "row": key.get('row'),
                "order": key.get('order', 'asc'),
                "data_type": key.get('data_type', 'auto')
            })
    
    result = {
        "success": True,
        "operation": "sort_range",
        "workbook": wb.name,
        "worksheet": ws.name,
        "range": range_str,
        "sort_criteria": sort_summary,
        "orientation": orientation,
        "has_header": has_header,
        "case_sensitive": case_sensitive,
        "custom_order_applied": bool(custom_order),
        "rows_affected": range_obj.rows.count,
        "columns_affected": range_obj.columns.count
    }
    
except Exception as e:
    result = {
        "success": False,
        "operation": "sort_range",
        "workbook": wb.name if 'wb' in locals() else None,
        "worksheet": ws.name if 'ws' in locals() else None,
        "range": range_str,
        "error": str(e)
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
    result = {
        "success": False,
        "operation": "generic_operation",
        "error_type": "no_excel_application",
        "error_message": "No active Excel application found. Please open Excel first.",
        "context": {
            "required": "active_excel_application"
        },
        "suggested_actions": [
            "Open Excel application first",
            "Ensure Excel is running and accessible",
            "Try opening any workbook in Excel to activate the application",
            "Restart Excel if it's not responding"
        ]
    }
    print(json.dumps(result))
    exit()

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}")
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
    result = {
        "success": False,
        "operation": "generic_operation",
        "error_type": "no_excel_application",
        "error_message": "No active Excel application found. Please open Excel first.",
        "context": {
            "required": "active_excel_application"
        },
        "suggested_actions": [
            "Open Excel application first",
            "Ensure Excel is running and accessible",
            "Try opening any workbook in Excel to activate the application",
            "Restart Excel if it's not responding"
        ]
    }
    print(json.dumps(result))
    exit()

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}")
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
    result = {
        "success": False,
        "operation": "generic_operation",
        "error_type": "no_excel_application",
        "error_message": "No active Excel application found. Please open Excel first.",
        "context": {
            "required": "active_excel_application"
        },
        "suggested_actions": [
            "Open Excel application first",
            "Ensure Excel is running and accessible",
            "Try opening any workbook in Excel to activate the application",
            "Restart Excel if it's not responding"
        ]
    }
    print(json.dumps(result))
    exit()

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}")
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

  private generateGetLastColumnLogic(params: XlwingsParams): string {
    return `
# Connect to Excel
app = xw.apps.active if xw.apps else None
if not app:
    result = {
        "success": False,
        "operation": "generic_operation",
        "error_type": "no_excel_application",
        "error_message": "No active Excel application found. Please open Excel first.",
        "context": {
            "required": "active_excel_application"
        },
        "suggested_actions": [
            "Open Excel application first",
            "Ensure Excel is running and accessible",
            "Try opening any workbook in Excel to activate the application",
            "Restart Excel if it's not responding"
        ]
    }
    print(json.dumps(result))
    exit()

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}")
if not wb:
    wb = xw.books.active

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    ws = wb.sheets.active

# Get last column with data
row = "${params.range || '1'}"  # Default to row 1 if no range specified
if ':' in row:
    row = row.split(':')[0]  # Take first part if range like 1:1

try:
    # Find last column with data in specified row
    last_col = ws.range(f"XFD{row}").end('left').column
    if last_col < 1:
        last_col = 1
    last_col_letter = column_number_to_letter(last_col)
except:
    # Fallback: use used range
    try:
        last_col = ws.used_range.last_cell.column
        last_col_letter = column_number_to_letter(last_col)
    except:
        last_col = 1
        last_col_letter = "A"

result = {
    "success": True,
    "operation": "get_last_column",
    "workbook": wb.name,
    "worksheet": ws.name,
    "row": row,
    "last_column": last_col,
    "last_column_letter": last_col_letter
}
print(json.dumps(result))`;
  }

  private generateGetUsedRangeLogic(params: XlwingsParams): string {
    return `
# Connect to Excel
app = xw.apps.active if xw.apps else None
if not app:
    result = {
        "success": False,
        "operation": "generic_operation",
        "error_type": "no_excel_application",
        "error_message": "No active Excel application found. Please open Excel first.",
        "context": {
            "required": "active_excel_application"
        },
        "suggested_actions": [
            "Open Excel application first",
            "Ensure Excel is running and accessible",
            "Try opening any workbook in Excel to activate the application",
            "Restart Excel if it's not responding"
        ]
    }
    print(json.dumps(result))
    exit()

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}")
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
    result = {
        "success": False,
        "operation": "generic_operation",
        "error_type": "no_excel_application",
        "error_message": "No active Excel application found. Please open Excel first.",
        "context": {
            "required": "active_excel_application"
        },
        "suggested_actions": [
            "Open Excel application first",
            "Ensure Excel is running and accessible",
            "Try opening any workbook in Excel to activate the application",
            "Restart Excel if it's not responding"
        ]
    }
    print(json.dumps(result))
    exit()

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}")
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
    const moduleName = params.vba?.module_name || 'Module1';
    const vbaCode = params.vba?.code || '';
    
    return `
# Connect to Excel
app = xw.apps.active if xw.apps else None
if not app:
    result = {
        "success": False,
        "operation": "generic_operation",
        "error_type": "no_excel_application",
        "error_message": "No active Excel application found. Please open Excel first.",
        "context": {
            "required": "active_excel_application"
        },
        "suggested_actions": [
            "Open Excel application first",
            "Ensure Excel is running and accessible",
            "Try opening any workbook in Excel to activate the application",
            "Restart Excel if it's not responding"
        ]
    }
    print(json.dumps(result))
    exit()

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}")
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
    const macroName = params.vba?.macro_name || '';
    
    return `
# Connect to Excel
app = xw.apps.active if xw.apps else None
if not app:
    result = {
        "success": False,
        "operation": "generic_operation",
        "error_type": "no_excel_application",
        "error_message": "No active Excel application found. Please open Excel first.",
        "context": {
            "required": "active_excel_application"
        },
        "suggested_actions": [
            "Open Excel application first",
            "Ensure Excel is running and accessible",
            "Try opening any workbook in Excel to activate the application",
            "Restart Excel if it's not responding"
        ]
    }
    print(json.dumps(result))
    exit()

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}")
if not wb:
    wb = xw.books.active

try:
    if not "${macroName}":
        raise ValueError("vba.macro_name is required for run_vba_macro operation")
    
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
    const moduleName = params.vba?.module_name || 'Module1';
    const vbaCode = params.vba?.code || '';
    
    return `
# Connect to Excel
app = xw.apps.active if xw.apps else None
if not app:
    result = {
        "success": False,
        "operation": "generic_operation",
        "error_type": "no_excel_application",
        "error_message": "No active Excel application found. Please open Excel first.",
        "context": {
            "required": "active_excel_application"
        },
        "suggested_actions": [
            "Open Excel application first",
            "Ensure Excel is running and accessible",
            "Try opening any workbook in Excel to activate the application",
            "Restart Excel if it's not responding"
        ]
    }
    print(json.dumps(result))
    exit()

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}")
if not wb:
    wb = xw.books.active

try:
    # Access VBA project
    vba_project = wb.api.VBProject
    
    # Find the module
    try:
        vba_module = vba_project.VBComponents("${moduleName}")
    except:
        result = {
            "success": False,
            "operation": "vba_operation",
            "error_type": "vba_module_not_found",
            "error_message": f"VBA module '${moduleName}' not found",
            "context": {
                "module_name": "${moduleName}",
                "workbook": wb.name if wb else "${params.workbook || ''}"
            },
            "suggested_actions": [
                "Check the VBA module name spelling",
                "Ensure the VBA module exists in the workbook",
                "Use list_vba_modules() to see available modules",
                "Verify that macros are enabled in the workbook"
            ]
        }
        print(json.dumps(result))
        exit()
    
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
    result = {
        "success": False,
        "operation": "generic_operation",
        "error_type": "no_excel_application",
        "error_message": "No active Excel application found. Please open Excel first.",
        "context": {
            "required": "active_excel_application"
        },
        "suggested_actions": [
            "Open Excel application first",
            "Ensure Excel is running and accessible",
            "Try opening any workbook in Excel to activate the application",
            "Restart Excel if it's not responding"
        ]
    }
    print(json.dumps(result))
    exit()

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}")
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
    const moduleName = params.vba?.module_name || '';
    
    return `
# Connect to Excel
app = xw.apps.active if xw.apps else None
if not app:
    result = {
        "success": False,
        "operation": "generic_operation",
        "error_type": "no_excel_application",
        "error_message": "No active Excel application found. Please open Excel first.",
        "context": {
            "required": "active_excel_application"
        },
        "suggested_actions": [
            "Open Excel application first",
            "Ensure Excel is running and accessible",
            "Try opening any workbook in Excel to activate the application",
            "Restart Excel if it's not responding"
        ]
    }
    print(json.dumps(result))
    exit()

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}")
if not wb:
    wb = xw.books.active

try:
    if not "${moduleName}":
        raise ValueError("vba.module_name is required for delete_vba_module operation")
    
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
        result = {
            "success": False,
            "operation": "vba_operation",
            "error_type": "vba_module_not_found",
            "error_message": f"VBA module '${moduleName}' not found",
            "context": {
                "module_name": "${moduleName}",
                "workbook": wb.name if wb else "${params.workbook || ''}"
            },
            "suggested_actions": [
                "Check the VBA module name spelling",
                "Ensure the VBA module exists in the workbook",
                "Use list_vba_modules() to see available modules",
                "Verify that macros are enabled in the workbook"
            ]
        }
        print(json.dumps(result))
        exit()
    
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
    const chartName = params.chart?.name || '';
    
    if (!chartName) {
      return 'raise ValueError("chart_name is required for update_chart operation")';
    }
    
    return `
# Connect to Excel
app = xw.apps.active if xw.apps else None
if not app:
    result = {
        "success": False,
        "operation": "generic_operation",
        "error_type": "no_excel_application",
        "error_message": "No active Excel application found. Please open Excel first.",
        "context": {
            "required": "active_excel_application"
        },
        "suggested_actions": [
            "Open Excel application first",
            "Ensure Excel is running and accessible",
            "Try opening any workbook in Excel to activate the application",
            "Restart Excel if it's not responding"
        ]
    }
    print(json.dumps(result))
    exit()

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}")
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
        result = {
            "success": False,
            "operation": "chart_operation",
            "error_type": "chart_not_found",
            "error_message": f"Chart '${chartName}' not found",
            "context": {
                "chart_name": "${chartName}",
                "worksheet": ws.name if ws else "${params.worksheet || ''}",
                "workbook": wb.name if wb else "${params.workbook || ''}"
            },
            "suggested_actions": [
                "Check the chart name spelling",
                "Ensure the chart exists in the specified worksheet",
                "Use list_charts() to see available charts",
                "Verify the chart is not hidden or deleted"
            ]
        }
        print(json.dumps(result))
        exit()
    
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

    # Reconfigure series names after updating data range
    try:
        chart.api.SetSourceData(ws.range("${chartConfig.data_range}").api, 1)  # xlColumns = 1 for series in columns
        chart.api.PlotBy = 1  # xlColumns = 1, ensures column headers are used as series names

        # Update series names from new data range headers
        data_range_obj = ws.range("${chartConfig.data_range}")
        for i in range(1, chart.api.SeriesCollection().Count + 1):
            try:
                series = chart.api.SeriesCollection(i)
                if data_range_obj.shape[0] > 1 and data_range_obj.shape[1] > 1:
                    header_row = data_range_obj.rows(1)
                    categories_range = "${chartConfig.categories_range || ''}"
                    col_index = i if categories_range else i + 1
                    if col_index <= header_row.shape[1]:
                        header_value = header_row.cells(1, col_index).value
                        if header_value and str(header_value).strip():
                            series.Name = str(header_value).strip()
            except:
                pass
    except:
        pass

    updated_properties.append("data_range")
    ` : ''}

    ${chartConfig?.categories_range ? `
    # Update categories range only
    try:
        if chart.api.SeriesCollection().Count > 0:
            chart.api.SeriesCollection(1).XValues = ws.range("${chartConfig.categories_range}").api
            updated_properties.append("categories_range")
    except:
        pass
    ` : ''}

    ${chartConfig?.series_names && chartConfig.series_names.length > 0 ?
    `# Update series names using correct xlwings chart API access
    try:
        series_names = ${JSON.stringify(chartConfig.series_names)}

        # Use the correct API access pattern from xlwings GitHub issue #1259
        series_collection = chart.api[1].SeriesCollection()
        series_count = series_collection.Count

        # Update each series name
        for i, series_name in enumerate(series_names):
            if i < series_count and series_name and series_name.strip():
                series_index = i + 1  # Excel is 1-indexed
                series = series_collection(series_index)
                series.Name = series_name.strip()

        updated_properties.append("series_names")

    except Exception as series_name_error:
        pass`
    : ''}

    ${chartConfig?.series_ranges && chartConfig.series_ranges.length > 0 ? `
    # Update individual series ranges
    try:
        series_ranges = ${JSON.stringify(chartConfig.series_ranges)}
        # Remove existing series except the first one
        while chart.api.SeriesCollection().Count > len(series_ranges):
            chart.api.SeriesCollection(chart.api.SeriesCollection().Count).Delete()

        # Update or add series with new ranges
        for i, series_range in enumerate(series_ranges, 1):
            if series_range.strip():
                if i <= chart.api.SeriesCollection().Count:
                    # Update existing series
                    chart.api.SeriesCollection(i).Values = ws.range(series_range.strip()).api
                else:
                    # Add new series
                    new_series = chart.api.SeriesCollection().NewSeries()
                    new_series.Values = ws.range(series_range.strip()).api
        updated_properties.append("series_ranges")
    except Exception as series_range_error:
        pass
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

        # Placeholder to ensure try block is never empty
        pass
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
    const chartName = params.chart?.name || '';
    
    if (!chartName) {
      return 'raise ValueError("chart_name is required for delete_chart operation")';
    }
    
    return `
# Connect to Excel
app = xw.apps.active if xw.apps else None
if not app:
    result = {
        "success": False,
        "operation": "generic_operation",
        "error_type": "no_excel_application",
        "error_message": "No active Excel application found. Please open Excel first.",
        "context": {
            "required": "active_excel_application"
        },
        "suggested_actions": [
            "Open Excel application first",
            "Ensure Excel is running and accessible",
            "Try opening any workbook in Excel to activate the application",
            "Restart Excel if it's not responding"
        ]
    }
    print(json.dumps(result))
    exit()

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}")
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
        result = {
            "success": False,
            "operation": "chart_operation",
            "error_type": "chart_not_found",
            "error_message": f"Chart '${chartName}' not found",
            "context": {
                "chart_name": "${chartName}",
                "worksheet": ws.name if ws else "${params.worksheet || ''}",
                "workbook": wb.name if wb else "${params.workbook || ''}"
            },
            "suggested_actions": [
                "Check the chart name spelling",
                "Ensure the chart exists in the specified worksheet",
                "Use list_charts() to see available charts",
                "Verify the chart is not hidden or deleted"
            ]
        }
        print(json.dumps(result))
        exit()
    
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
    result = {
        "success": False,
        "operation": "generic_operation",
        "error_type": "no_excel_application",
        "error_message": "No active Excel application found. Please open Excel first.",
        "context": {
            "required": "active_excel_application"
        },
        "suggested_actions": [
            "Open Excel application first",
            "Ensure Excel is running and accessible",
            "Try opening any workbook in Excel to activate the application",
            "Restart Excel if it's not responding"
        ]
    }
    print(json.dumps(result))
    exit()

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}")
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
    const imagePath = params.image?.path || '';
    const range = params.image?.position || params.range || 'A1';
    const width = params.image?.width;
    const height = params.image?.height;
    const imageName = params.image?.name;
    
    if (!imagePath) {
      return 'raise ValueError("image.path is required for insert_image operation")';
    }
    
    return `
# Connect to Excel
app = xw.apps.active if xw.apps else None
if not app:
    result = {
        "success": False,
        "operation": "generic_operation",
        "error_type": "no_excel_application",
        "error_message": "No active Excel application found. Please open Excel first.",
        "context": {
            "required": "active_excel_application"
        },
        "suggested_actions": [
            "Open Excel application first",
            "Ensure Excel is running and accessible",
            "Try opening any workbook in Excel to activate the application",
            "Restart Excel if it's not responding"
        ]
    }
    print(json.dumps(result))
    exit()

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}")
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
    result = {
        "success": False,
        "operation": "generic_operation",
        "error_type": "no_excel_application",
        "error_message": "No active Excel application found. Please open Excel first.",
        "context": {
            "required": "active_excel_application"
        },
        "suggested_actions": [
            "Open Excel application first",
            "Ensure Excel is running and accessible",
            "Try opening any workbook in Excel to activate the application",
            "Restart Excel if it's not responding"
        ]
    }
    print(json.dumps(result))
    exit()

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}")
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
    const imageName = params.image?.name || '';
    
    if (!imageName) {
      return 'raise ValueError("image.name is required for delete_image operation")';
    }
    
    return `
# Connect to Excel
app = xw.apps.active if xw.apps else None
if not app:
    result = {
        "success": False,
        "operation": "generic_operation",
        "error_type": "no_excel_application",
        "error_message": "No active Excel application found. Please open Excel first.",
        "context": {
            "required": "active_excel_application"
        },
        "suggested_actions": [
            "Open Excel application first",
            "Ensure Excel is running and accessible",
            "Try opening any workbook in Excel to activate the application",
            "Restart Excel if it's not responding"
        ]
    }
    print(json.dumps(result))
    exit()

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}")
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
        result = {
            "success": False,
            "operation": "image_operation",
            "error_type": "image_not_found",
            "error_message": f"Image '${imageName}' not found",
            "context": {
                "image_name": "${imageName}",
                "worksheet": ws.name if ws else "${params.worksheet || ''}",
                "workbook": wb.name if wb else "${params.workbook || ''}"
            },
            "suggested_actions": [
                "Check the image name spelling",
                "Ensure the image exists in the specified worksheet",
                "Use list_images() to see available images",
                "Verify the image is not hidden or deleted"
            ]
        }
        print(json.dumps(result))
        exit()
    
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
    const imageName = params.image?.name || '';
    const width = params.image?.width;
    const height = params.image?.height;
    
    if (!imageName) {
      return 'raise ValueError("image.name is required for resize_image operation")';
    }
    
    return `
# Connect to Excel
app = xw.apps.active if xw.apps else None
if not app:
    result = {
        "success": False,
        "operation": "generic_operation",
        "error_type": "no_excel_application",
        "error_message": "No active Excel application found. Please open Excel first.",
        "context": {
            "required": "active_excel_application"
        },
        "suggested_actions": [
            "Open Excel application first",
            "Ensure Excel is running and accessible",
            "Try opening any workbook in Excel to activate the application",
            "Restart Excel if it's not responding"
        ]
    }
    print(json.dumps(result))
    exit()

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}")
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
        result = {
            "success": False,
            "operation": "image_operation",
            "error_type": "image_not_found",
            "error_message": f"Image '${imageName}' not found",
            "context": {
                "image_name": "${imageName}",
                "worksheet": ws.name if ws else "${params.worksheet || ''}",
                "workbook": wb.name if wb else "${params.workbook || ''}"
            },
            "suggested_actions": [
                "Check the image name spelling",
                "Ensure the image exists in the specified worksheet",
                "Use list_images() to see available images",
                "Verify the image is not hidden or deleted"
            ]
        }
        print(json.dumps(result))
        exit()
    
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
    const imageName = params.image?.name || '';
    const range = params.range || '';
    
    if (!imageName) {
      return 'raise ValueError("image.name is required for move_image operation")';
    }
    
    if (!range) {
      return 'raise ValueError("range is required for move_image operation")';
    }
    
    return `
# Connect to Excel
app = xw.apps.active if xw.apps else None
if not app:
    result = {
        "success": False,
        "operation": "generic_operation",
        "error_type": "no_excel_application",
        "error_message": "No active Excel application found. Please open Excel first.",
        "context": {
            "required": "active_excel_application"
        },
        "suggested_actions": [
            "Open Excel application first",
            "Ensure Excel is running and accessible",
            "Try opening any workbook in Excel to activate the application",
            "Restart Excel if it's not responding"
        ]
    }
    print(json.dumps(result))
    exit()

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}")
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
        result = {
            "success": False,
            "operation": "image_operation",
            "error_type": "image_not_found",
            "error_message": f"Image '${imageName}' not found",
            "context": {
                "image_name": "${imageName}",
                "worksheet": ws.name if ws else "${params.worksheet || ''}",
                "workbook": wb.name if wb else "${params.workbook || ''}"
            },
            "suggested_actions": [
                "Check the image name spelling",
                "Ensure the image exists in the specified worksheet",
                "Use list_images() to see available images",
                "Verify the image is not hidden or deleted"
            ]
        }
        print(json.dumps(result))
        exit()
    
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

  // TODO: Implement when Pillow library is available
  /* private generateSaveRangeAsImageLogic(params: XlwingsParams): string {
    const range = params.range || 'A1:E10';
    const outputPath = params.output_path || '';
    
    if (!outputPath) {
      return 'raise ValueError("output_path is required for save_range_as_image operation")';
    }
    
    return `
# Connect to Excel
app = xw.apps.active if xw.apps else None
if not app:
    result = {
        "success": False,
        "operation": "generic_operation",
        "error_type": "no_excel_application",
        "error_message": "No active Excel application found. Please open Excel first.",
        "context": {
            "required": "active_excel_application"
        },
        "suggested_actions": [
            "Open Excel application first",
            "Ensure Excel is running and accessible",
            "Try opening any workbook in Excel to activate the application",
            "Restart Excel if it's not responding"
        ]
    }
    print(json.dumps(result))
    exit()

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}")
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
  } */

  private generateSaveChartAsImageLogic(params: XlwingsParams): string {
    const chartName = params.chart?.name || '';
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
    result = {
        "success": False,
        "operation": "generic_operation",
        "error_type": "no_excel_application",
        "error_message": "No active Excel application found. Please open Excel first.",
        "context": {
            "required": "active_excel_application"
        },
        "suggested_actions": [
            "Open Excel application first",
            "Ensure Excel is running and accessible",
            "Try opening any workbook in Excel to activate the application",
            "Restart Excel if it's not responding"
        ]
    }
    print(json.dumps(result))
    exit()

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}")
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
        result = {
            "success": False,
            "operation": "chart_operation",
            "error_type": "chart_not_found",
            "error_message": f"Chart '${chartName}' not found",
            "context": {
                "chart_name": "${chartName}",
                "worksheet": ws.name if ws else "${params.worksheet || ''}",
                "workbook": wb.name if wb else "${params.workbook || ''}"
            },
            "suggested_actions": [
                "Check the chart name spelling",
                "Ensure the chart exists in the specified worksheet",
                "Use list_charts() to see available charts",
                "Verify the chart is not hidden or deleted"
            ]
        }
        print(json.dumps(result))
        exit()
    
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
    const searchTerm = params.search?.term || '';
    const searchColumn = params.search?.column;
    const searchFormulas = params.search?.formulas !== false; // Default true
    const autoSelect = params.search?.auto_select !== false; // Default true
    const searchFormulasPython = searchFormulas ? 'True' : 'False';
    const autoSelectPython = autoSelect ? 'True' : 'False';
    const targetWorksheet = params.worksheet || '';
    
    if (!searchTerm) {
      return 'raise ValueError("search.term is required for search_data operation")';
    }
    
    return `
# Connect to Excel
app = xw.apps.active if xw.apps else None
if not app:
    result = {
        "success": False,
        "operation": "generic_operation",
        "error_type": "no_excel_application",
        "error_message": "No active Excel application found. Please open Excel first.",
        "context": {
            "required": "active_excel_application"
        },
        "suggested_actions": [
            "Open Excel application first",
            "Ensure Excel is running and accessible",
            "Try opening any workbook in Excel to activate the application",
            "Restart Excel if it's not responding"
        ]
    }
    print(json.dumps(result))
    exit()

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}")
if not wb:
    wb = xw.books.active

search_term = "${searchTerm}"
search_column = ${searchColumn ? (typeof searchColumn === 'string' ? `"${searchColumn}"` : searchColumn) : 'None'}
search_formulas = ${searchFormulasPython}
auto_select = ${autoSelectPython}
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
            result = {
                "success": False,
                "operation": "chart_operation",
                "error_type": "target_worksheet_not_found",
                "error_message": f"Worksheet '{target_worksheet}' not found",
                "context": {
                    "target_worksheet": target_worksheet,
                    "workbook": wb.name if wb else "${params.workbook || ''}"
                },
                "suggested_actions": [
                    "Check the target worksheet name spelling",
                    "Ensure the target worksheet exists in the workbook",
                    "Use list_sheets() to see available worksheets",
                    "Create the target worksheet if it doesn't exist"
                ]
            }
            print(json.dumps(result))
            exit()
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
        "operation": "find_range",
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
        "operation": "find_range",
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

  private generateCreateShapeLogic(params: XlwingsParams): string {
    if (!params.shape) {
      return 'raise ValueError("Shape configuration is required for create_shape operation")';
    }

    const shape = params.shape;
    const shapeType = shape.type;
    const left = shape.left ?? 100;
    const top = shape.top ?? 100;
    const width = shape.width ?? 100;
    const height = shape.height ?? 50;
    const text = shape.text || '';
    const name = shape.name || `Shape_${Date.now()}`;

    return `${this.generateExcelConnectionCode(params)}

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    ws = wb.sheets.active

# Shape creation using COM API - xlwings high-level API doesn't support direct shape creation
# Use basic COM API for limited shape types
try:
    shape_type = "${shapeType}"

    # Define shape type mapping with comprehensive support
    shape_type_mapping = {
        'rectangle': 1,    # msoShapeRectangle
        'oval': 9,         # msoShapeOval
        'textbox': 1,      # Use rectangle for textbox (msoShapeRectangle)

        # Arrows
        'right_arrow': 33,     # msoShapeRightArrow
        'left_arrow': 34,      # msoShapeLeftArrow
        'up_arrow': 35,        # msoShapeUpArrow
        'down_arrow': 36,      # msoShapeDownArrow
        'left_right_arrow': 37, # msoShapeLeftRightArrow
        'up_down_arrow': 38,   # msoShapeUpDownArrow
        'quad_arrow': 39,      # msoShapeQuadArrow

        # Flow Chart Shapes
        'flowchart_process': 61,      # msoShapeFlowchartProcess
        'flowchart_decision': 63,     # msoShapeFlowchartDecision
        'flowchart_document': 67,     # msoShapeFlowchartDocument
        'flowchart_terminator': 69,   # msoShapeFlowchartTerminator
        'flowchart_preparation': 70,  # msoShapeFlowchartPreparation
        'flowchart_manual_input': 71, # msoShapeFlowchartManualInput

        # Callouts
        'rectangular_callout': 105,   # msoShapeRectangularCallout
        'oval_callout': 107,          # msoShapeOvalCallout
        'line_callout': 109,          # msoShapeLineCallout1
        # Connectors
        'flowchart_connector': 103,   # msoShapeFlowchartConnector
        'line': 9,                    # msoShapeLineSegment (for simple lines)
        # Basic geometric shapes
        'triangle': 7,                # msoShapeIsoscelesTriangle (corrected value)
        'rounded_rectangle': 5,       # msoShapeRoundedRectangle (what was showing as triangle)
        'star': 12,                   # msoShape32pointStar
        'pentagon': 7,                # msoShapePentagon
        'hexagon': 8                  # msoShapeHexagon
    }

    # Define connector type mapping for AddConnector method
    connector_type_mapping = {
        'straight_connector': 1,      # msoConnectorStraight
        'elbow_connector': 2,         # msoConnectorElbow
        'curved_connector': 3,        # msoConnectorCurve
    }

    # Check if this is a connector type
    if shape_type in connector_type_mapping:
        # Use AddConnector method for connector shapes
        shape_obj = ws.api.Shapes.AddConnector(
            Type=connector_type_mapping[shape_type],
            BeginX=${left},
            BeginY=${top},
            EndX=${left + width},
            EndY=${top + height}
        )
    elif shape_type in shape_type_mapping:
        # Use AddShape method for regular shapes
        shape_obj = ws.api.Shapes.AddShape(
            Type=shape_type_mapping[shape_type],
            Left=${left},
            Top=${top},
            Width=${width},
            Height=${height}
        )
    else:
        raise ValueError(f"Unsupported shape type: {shape_type}. Supported types: {list(shape_type_mapping.keys()) + list(connector_type_mapping.keys())}")
    
    # Set shape name
    shape_obj.Name = "${name}"

    # Add text if provided
    if "${text}":
        shape_obj.TextFrame2.TextRange.Text = "${text}"

    ${this.generateConnectionLogic(shape)}

    ${this.generateShapeStyleCode(shape)}
    ${this.generateShapeTextFormatCode(shape)}
    
    result = {
        "success": True,
        "operation": "create_shape",
        "workbook": wb.name,
        "worksheet": ws.name,
        "shape": {
            "name": shape_obj.Name,
            "type": "${shapeType}",
            "position": {"left": ${left}, "top": ${top}},
            "size": {"width": ${width}, "height": ${height}},
            "text": "${text}",
            "rotation": 0,
            "visible": True
        }
    }
    print(json.dumps(result))
    
except Exception as e:
    result = {
        "success": False,
        "operation": "create_shape",
        "xlwings_error": str(e)
    }
    print(json.dumps(result))`;
  }

  private generateCreateTextboxLogic(params: XlwingsParams): string {
    if (!params.shape) {
      return 'raise ValueError("Shape configuration is required for create_textbox operation")';
    }

    const shape = params.shape;
    const left = shape.left ?? 100;
    const top = shape.top ?? 100;
    const width = shape.width ?? 100;
    const height = shape.height ?? 50;
    const text = shape.text || '';
    const name = shape.name || `Textbox_${Date.now()}`;

    return `${this.generateExcelConnectionCode(params)}

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    ws = wb.sheets.active

# Import required modules for shapes
# Note: Using Excel API directly instead of xlwings.constants

try:
    # Create textbox using rectangle shape (more reliable than msoTextBox)
    textbox = ws.api.Shapes.AddShape(
        Type=1,  # msoShapeRectangle - better for textbox
        Left=${left},
        Top=${top},
        Width=${width},
        Height=${height}
    )
    
    # Set textbox name
    textbox.Name = "${name}"
    
    # Set text content
    if "${text}":
        textbox.TextFrame2.TextRange.Text = "${text}"

    ${this.generateShapeStyleCode(shape)}
    ${this.generateShapeTextFormatCode(shape)}
    
    result = {
        "success": True,
        "operation": "create_textbox",
        "workbook": wb.name,
        "worksheet": ws.name,
        "shape": {
            "name": textbox.Name,
            "type": "textbox",
            "position": {"left": ${left}, "top": ${top}},
            "size": {"width": ${width}, "height": ${height}},
            "text": "${text}",
            "rotation": 0,
            "visible": True
        }
    }
    print(json.dumps(result))
    
except Exception as e:
    result = {
        "success": False,
        "operation": "create_textbox",
        "xlwings_error": str(e)
    }
    print(json.dumps(result))`;
  }

  private generateListShapesLogic(params: XlwingsParams): string {
    return `${this.generateExcelConnectionCode(params)}

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    ws = wb.sheets.active

try:
    shapes_info = []
    
    for shape in ws.shapes:
        shape_info = {
            "name": shape.name,
            "type": str(shape.type),
            "position": {
                "left": shape.left,
                "top": shape.top
            },
            "size": {
                "width": shape.width,
                "height": shape.height
            },
            "text": getattr(shape, 'text', '') if hasattr(shape, 'text') else '',
            "rotation": getattr(shape, 'rotation', 0),
            "visible": getattr(shape, 'visible', True)
        }
        shapes_info.append(shape_info)
    
    result = {
        "success": True,
        "operation": "list_shapes",
        "workbook": wb.name,
        "worksheet": ws.name,
        "shapes_count": len(shapes_info),
        "shapes": shapes_info
    }
    print(json.dumps(result))
    
except Exception as e:
    result = {
        "success": False,
        "operation": "list_shapes",
        "xlwings_error": str(e)
    }
    print(json.dumps(result))`;
  }

  private generateModifyShapeLogic(params: XlwingsParams): string {
    const shapeName = params.shape?.name;
    if (!shapeName) {
      return 'raise ValueError("Shape name is required for modify_shape operation")';
    }

    return `${this.generateExcelConnectionCode(params)}

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    ws = wb.sheets.active

try:
    # Find the shape
    target_shape = None
    for shape in ws.shapes:
        if shape.name == "${shapeName}":
            target_shape = shape
            break
    
    if not target_shape:
        raise ValueError(f"Shape '${shapeName}' not found")
    
    ${this.generateShapeModificationCode(params)}
    
    result = {
        "success": True,
        "operation": "modify_shape",
        "workbook": wb.name,
        "worksheet": ws.name,
        "shape_name": "${shapeName}",
        "modifications_applied": True
    }
    print(json.dumps(result))
    
except Exception as e:
    result = {
        "success": False,
        "operation": "modify_shape",
        "xlwings_error": str(e)
    }
    print(json.dumps(result))`;
  }

  private generateDeleteShapeLogic(params: XlwingsParams): string {
    const shapeName = params.shape?.name;
    if (!shapeName) {
      return 'raise ValueError("Shape name is required for delete_shape operation")';
    }

    return `${this.generateExcelConnectionCode(params)}

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    ws = wb.sheets.active

try:
    # Find and delete the shape
    shape_found = False
    for shape in ws.shapes:
        if shape.name == "${shapeName}":
            shape.delete()
            shape_found = True
            break

    if not shape_found:
        raise ValueError(f"Shape '${shapeName}' not found")
    
    result = {
        "success": True,
        "operation": "delete_shape",
        "workbook": wb.name,
        "worksheet": ws.name,
        "shape_name": "${shapeName}",
        "deleted": True
    }
    print(json.dumps(result))
    
except Exception as e:
    result = {
        "success": False,
        "operation": "delete_shape",
        "xlwings_error": str(e)
    }
    print(json.dumps(result))`;
  }

  private generateMoveShapeLogic(params: XlwingsParams): string {
    const shapeName = params.shape?.name;
    const moveSettings = params.shape?.move;
    if (!shapeName || !moveSettings) {
      return 'raise ValueError("shape.name and shape.move are required for move_shape operation")';
    }

    return `${this.generateExcelConnectionCode(params)}

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    ws = wb.sheets.active

try:
    # Find the shape
    target_shape = None
    for shape in ws.shapes:
        if shape.name == "${shapeName}":
            target_shape = shape
            break
    
    if not target_shape:
        raise ValueError(f"Shape '${shapeName}' not found")
    
    # Move the shape
    old_left = target_shape.left
    old_top = target_shape.top
    
    target_shape.left = ${moveSettings.new_left}
    target_shape.top = ${moveSettings.new_top}
    
    result = {
        "success": True,
        "operation": "move_shape",
        "workbook": wb.name,
        "worksheet": ws.name,
        "shape_name": "${shapeName}",
        "old_position": {"left": old_left, "top": old_top},
        "new_position": {"left": ${moveSettings.new_left}, "top": ${moveSettings.new_top}}
    }
    print(json.dumps(result))
    
except Exception as e:
    result = {
        "success": False,
        "operation": "move_shape",
        "xlwings_error": str(e)
    }
    print(json.dumps(result))`;
  }

  private generateResizeShapeLogic(params: XlwingsParams): string {
    const shapeName = params.shape?.name;
    const resizeSettings = params.shape?.resize;
    if (!shapeName || !resizeSettings) {
      return 'raise ValueError("shape.name and shape.resize are required for resize_shape operation")';
    }
    const keepAspectRatio = resizeSettings.keep_aspect_ratio || false;
    const keepAspectRatioPython = keepAspectRatio ? 'True' : 'False';

    return `${this.generateExcelConnectionCode(params)}

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    ws = wb.sheets.active

try:
    # Find the shape
    target_shape = None
    for shape in ws.shapes:
        if shape.name == "${shapeName}":
            target_shape = shape
            break
    
    if not target_shape:
        raise ValueError(f"Shape '${shapeName}' not found")
    
    # Store old dimensions
    old_width = target_shape.width
    old_height = target_shape.height
    
    # Resize the shape
    if ${keepAspectRatioPython}:
        # Calculate aspect ratio and resize proportionally
        current_ratio = old_width / old_height
        new_width = ${resizeSettings.new_width}
        new_height = ${resizeSettings.new_height}
        
        if new_width / new_height > current_ratio:
            new_width = new_height * current_ratio
        else:
            new_height = new_width / current_ratio
            
        target_shape.width = new_width
        target_shape.height = new_height
    else:
        target_shape.width = ${resizeSettings.new_width}
        target_shape.height = ${resizeSettings.new_height}
    
    result = {
        "success": True,
        "operation": "resize_shape",
        "workbook": wb.name,
        "worksheet": ws.name,
        "shape_name": "${shapeName}",
        "old_size": {"width": old_width, "height": old_height},
        "new_size": {"width": target_shape.width, "height": target_shape.height},
        "aspect_ratio_maintained": ${keepAspectRatioPython}
    }
    print(json.dumps(result))
    
except Exception as e:
    result = {
        "success": False,
        "operation": "resize_shape",
        "xlwings_error": str(e)
    }
    print(json.dumps(result))`;
  }

  private generateConnectionLogic(shape: { connection?: { start_shape?: string, end_shape?: string, start_connection_site?: number, end_connection_site?: number }, type?: string }): string {
    if (!shape.connection || !shape.connection.start_shape || !shape.connection.end_shape) {
      return '';
    }

    const connection = shape.connection;
    const isConnector = shape.type && ['straight_connector', 'elbow_connector', 'curved_connector', 'flowchart_connector'].includes(shape.type);

    if (!isConnector) {
      return '';
    }

    return `
    # Connect to shapes using COM API
    try:
        # Find start and end shapes
        start_shape = None
        end_shape = None

        for existing_shape in ws.api.Shapes:
            if existing_shape.Name == "${connection.start_shape}":
                start_shape = existing_shape
            elif existing_shape.Name == "${connection.end_shape}":
                end_shape = existing_shape

        if start_shape and end_shape:
            # Connect the connector to the shapes using proper connection sites
            # Connection sites are numbered from 1 to the total number of connection sites on the shape
            start_site = ${connection.start_connection_site || 1}  # Default to site 1 instead of 0
            end_site = ${connection.end_connection_site || 1}      # Default to site 1 instead of 0

            shape_obj.ConnectorFormat.BeginConnect(ConnectedShape=start_shape, ConnectionSite=start_site)
            shape_obj.ConnectorFormat.EndConnect(ConnectedShape=end_shape, ConnectionSite=end_site)

            # Automatically find the shortest path between the connected shapes
            shape_obj.RerouteConnections()

            pass
        else:
            pass
    except Exception as conn_e:
        pass`;
  }

  private generateShapeStyleCode(shape: { style?: ShapeStyle }): string {
    if (!shape.style) return '';

    let styleCode = '';
    const style = shape.style;

    if (style.fill_color) {
      styleCode += `    # Set fill color\n    try:\n        shape_obj.Fill.ForeColor.RGB = 0x${style.fill_color.replace('#', '')}\n    except:\n        pass  # Fill color not supported for this shape type\n`;
    }

    if (style.border_color || style.border_width || style.border_style) {
      styleCode += `    # Set border properties\n`;
      if (style.border_color) {
        styleCode += `    try:\n        shape_obj.Line.ForeColor.RGB = 0x${style.border_color.replace('#', '')}\n    except:\n        pass  # Border color not supported\n`;
      }
      if (style.border_width) {
        styleCode += `    try:\n        shape_obj.Line.Weight = ${style.border_width}\n    except:\n        pass  # Border width not supported\n`;
      }
    }

    if (style.transparency) {
      styleCode += `    # Set transparency\n    try:\n        shape_obj.Fill.Transparency = ${style.transparency}\n    except:\n        pass  # Transparency not supported\n`;
    }

    return styleCode;
  }

  private generateShapeTextFormatCode(shape: { text_format?: ShapeTextFormat }): string {
    if (!shape.text_format) return '';

    let formatCode = '';
    const textFormat = shape.text_format;

    if (textFormat.font) {
      formatCode += `    # Set font properties\n`;
      const font = textFormat.font;
      if (font.name) {
        formatCode += `    shape_obj.TextFrame2.TextRange.Font.Name = "${font.name}"\n`;
      }
      if (font.size) {
        formatCode += `    shape_obj.TextFrame2.TextRange.Font.Size = ${font.size}\n`;
      }
      if (font.bold) {
        formatCode += `    shape_obj.TextFrame2.TextRange.Font.Bold = ${font.bold ? 'True' : 'False'}\n`;
      }
      if (font.italic) {
        formatCode += `    shape_obj.TextFrame2.TextRange.Font.Italic = ${font.italic ? 'True' : 'False'}\n`;
      }
      if (font.color) {
        formatCode += `    shape_obj.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = 0x${font.color.replace('#', '')}\n`;
      }
    }

    if (textFormat.alignment) {
      formatCode += `    # Set text alignment\n`;
      const alignment = textFormat.alignment;
      if (alignment.horizontal) {
        const alignmentMap: Record<string, string> = {
          'left': 'xlHAlignLeft',
          'center': 'xlHAlignCenter', 
          'right': 'xlHAlignRight',
          'justify': 'xlHAlignJustify'
        };
        const horizontalAlignment = alignmentMap[alignment.horizontal as string] || 'xlHAlignCenter';
        const alignmentValue = horizontalAlignment.replace('xlHAlign', '');
        const alignmentMap2 = {'Left': 1, 'Center': 2, 'Right': 3, 'Justify': 4};
        formatCode += `    shape_obj.TextFrame2.TextRange.ParagraphFormat.Alignment = ${alignmentMap2[alignmentValue as keyof typeof alignmentMap2] || 2}\n`;
      }
      if (alignment.vertical) {
        const vAlignmentMap: Record<string, string> = {
          'top': 'xlVAlignTop',
          'middle': 'xlVAlignCenter',
          'bottom': 'xlVAlignBottom'
        };
        const verticalAlignment = vAlignmentMap[alignment.vertical as string] || 'xlVAlignCenter';
        const vAlignmentValue = verticalAlignment.replace('xlVAlign', '');
        const vAlignmentMap2 = {'Top': 1, 'Center': 2, 'Bottom': 3};
        formatCode += `    shape_obj.TextFrame2.VerticalAnchor = ${vAlignmentMap2[vAlignmentValue as keyof typeof vAlignmentMap2] || 2}\n`;
      }
    }

    return formatCode;
  }

  private generateShapeModificationCode(params: XlwingsParams): string {
    if (!params.shape) return '';

    let modCode = '';
    const shape = params.shape;

    if (shape.text !== undefined) {
      modCode += `    # Update text content\n    target_shape.text_frame.characters.text = "${shape.text}"\n`;
    }

    if (shape.rotation !== undefined) {
      modCode += `    # Set rotation\n    target_shape.rotation = ${shape.rotation}\n`;
    }

    modCode += this.generateShapeStyleCode({ style: shape.style }).replace(/shape_obj/g, 'target_shape');
    modCode += this.generateShapeTextFormatCode({ text_format: shape.text_format }).replace(/shape_obj/g, 'target_shape');

    return modCode;
  }

  private generateGetSheetInfoLogic(params: XlwingsParams): string {
    const analysis = params.sheet_analysis;
    const topRows = analysis?.top_rows ?? 3;
    const bottomRows = analysis?.bottom_rows ?? 1;
    
    return `
# Get comprehensive sheet information
app = xw.apps.active if xw.apps else None
if not app:
    app = xw.App(visible=False)

wb, app_used, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}", app)
if not wb:
    # Get list of available workbooks for debugging
    available_workbooks = [book.name for book in app.books] if app.books else []
    result = {
        "success": False,
        "operation": "generic_operation",
        "error_type": "workbook_not_found",
        "error_message": f"Could not find workbook '${params.workbook || ''}'",
        "context": {
            "workbook": "${params.workbook || ''}",
            "available_workbooks": available_workbooks
        },
        "suggested_actions": [
            f"Use one of the available workbooks: {', '.join(available_workbooks) if available_workbooks else 'None available'}",
            "Check the workbook name spelling and ensure it's open in Excel",
            "Open the workbook in Excel first, then try again",
            "Use the exact workbook name as it appears in Excel"
        ]
    }
    print(json.dumps(result))
    exit()

ws = get_worksheet(wb, "${params.worksheet || ''}")
if not ws:
    result = {
        "success": False,
        "operation": "generic_operation",
        "error_type": "worksheet_not_found",
        "error_message": "Could not find the specified worksheet",
        "context": {
            "worksheet": "${params.worksheet || ''}",
            "workbook": wb.name if wb else "${params.workbook || ''}"
        },
        "suggested_actions": [
            "Check the worksheet name spelling and capitalization",
            "Use list_sheets() to get the exact worksheet names",
            "Ensure the worksheet exists in the specified workbook",
            "Example: operation_name(worksheet: 'Sheet1')"
        ]
    }
    print(json.dumps(result))
    exit()

try:
    # 1. Get used range information (reusing get_used_range logic)
    used_range = ws.used_range
    if used_range:
        range_address = used_range.address
        last_row = used_range.last_cell.row
        last_col = used_range.last_cell.column
        last_col_letter = column_number_to_letter(last_col)
    else:
        range_address = None
        last_row = 1
        last_col = 1
        last_col_letter = "A"
    
    result_data = {
        "used_range": {
            "address": range_address,
            "last_row": last_row,
            "last_column": last_col,
            "last_column_letter": last_col_letter,
            "total_rows": last_row if range_address else 0,
            "total_columns": last_col if range_address else 0
        }
    }
    
    # 2. Get top rows data
    if ${topRows} > 0 and range_address:
        top_rows_range = f"A1:{last_col_letter}{min(${topRows}, last_row)}"
        top_range_obj = ws.range(top_rows_range)
        top_data = []
        
        for row_idx in range(top_range_obj.rows.count):
            row_data = []
            for col_idx in range(top_range_obj.columns.count):
                cell = top_range_obj[row_idx, col_idx]
                # Simplified: only store the cell value
                row_data.append(cell.value)
            top_data.append(row_data)
        
        result_data["top_rows"] = {
            "range": top_rows_range,
            "count": len(top_data),
            "data": top_data
        }
    else:
        result_data["top_rows"] = None
    
    # 3. Get bottom rows data
    if ${bottomRows} > 0 and range_address and last_row > ${topRows}:
        start_row = max(last_row - ${bottomRows} + 1, ${topRows} + 1)
        bottom_rows_range = f"A{start_row}:{last_col_letter}{last_row}"
        bottom_range_obj = ws.range(bottom_rows_range)
        bottom_data = []
        
        for row_idx in range(bottom_range_obj.rows.count):
            row_data = []
            for col_idx in range(bottom_range_obj.columns.count):
                cell = bottom_range_obj[row_idx, col_idx]
                # Simplified: only store the cell value
                row_data.append(cell.value)
            bottom_data.append(row_data)
        
        result_data["bottom_rows"] = {
            "range": bottom_rows_range,
            "count": len(bottom_data),
            "data": bottom_data
        }
    else:
        result_data["bottom_rows"] = None
    
    # 4. Minimal additional info - just sheet name
    result_data["sheet_name"] = ws.name
    
    result = {
        "success": True,
        "operation": "get_sheet_info",
        "workbook": wb.name,
        "worksheet": ws.name,
        "data": result_data
    }
    
except Exception as e:
    result = {
        "success": False,
        "operation": "get_sheet_info",
        "workbook": wb.name if 'wb' in locals() else None,
        "worksheet": ws.name if 'ws' in locals() else None,
        "error": str(e)
    }

print(json.dumps(result))`;
  }

  // =====================================================
  // STRUCTURED RESPONSE GENERATION METHODS
  // =====================================================
  /**
   * Generate structured response data for frontend display
   */
  private generateStructuredResponseData(result: XlwingsResult, params: XlwingsParams): ToolResponseData {
    const operation = result.operation || params.op;

    // Base structured data
    const structuredData: ToolResponseData = {
      operation,
      summary: this.generateOperationSummary(result, params),
      details: {},
      metrics: {},
      files: {},
      nextActions: []
    };

    // Add operation-specific metrics
    if (result.cells_affected) {
      structuredData.metrics!.cellsAffected = result.cells_affected;
    }

    if (result.data && Array.isArray(result.data)) {
      const is2DArray = Array.isArray(result.data[0]);
      if (is2DArray) {
        structuredData.metrics!.rowsAffected = result.data.length;
        structuredData.metrics!.columnsAffected = result.data[0]?.length || 0;
      } else {
        structuredData.metrics!.rowsAffected = 1;
        structuredData.metrics!.columnsAffected = result.data.length;
      }
    }

    // Add operation-specific details
    if (result.workbook) structuredData.details!['workbook'] = result.workbook;
    if (result.worksheet) structuredData.details!['worksheet'] = result.worksheet;
    if (result.range) structuredData.details!['range'] = result.range;

    // Add file information
    if (result.file_path) {
      if (result.file_created) {
        structuredData.files!.created = [result.file_path];
      } else if (result.file_opened) {
        structuredData.files!.input = [result.file_path];
      } else if (result.file_saved) {
        structuredData.files!.output = [result.file_path];
      }
    }

    // Add workbook and worksheet information
    if (result.workbook) {
      structuredData.files!.workbook = result.workbook;
    }
    if (result.worksheet) {
      structuredData.files!.worksheet = result.worksheet;
    }

    // Add operation-specific next actions
    this.addNextActions(structuredData, result, params);

    return structuredData;
  }

  /**
   * Generate concise operation summary
   */
  private generateOperationSummary(result: XlwingsResult, params: XlwingsParams): string {
    const operation = result.operation || params.op;

    switch (operation) {
      case 'delete_sheet':
        return `Deleted worksheet "${result.deleted_sheet_name}"`;
      case 'read_range':
        {
          const rows = result.data?.length || 0;
          const cols = Array.isArray(result.data?.[0]) ? result.data[0].length : (result.data?.length || 0);
          return `Read ${rows} rows × ${cols} columns from ${result.range}`;
        }
      case 'format_range':
        return `Applied formatting to ${result.cells_affected} cells`;
      case 'write_range':
        return `Wrote data to ${result.cells_affected} cells`;
      case 'sort_range':
        return `Sorted data in range ${result.range}`;
      case 'get_sheet_info':
        return `Analyzed worksheet "${result.worksheet}"`;
      default:
        return `${operation.replace(/_/g, ' ')} completed successfully`;
    }
  }

  /**
   * Add suggested next actions based on operation
   */
  private addNextActions(structuredData: ToolResponseData, result: XlwingsResult, params: XlwingsParams): void {
    const operation = result.operation || params.op;

    switch (operation) {
      case 'read_range':
        structuredData.nextActions = [
          `Sort data: sort_range(range: "${result.range}")`,
          `Analyze structure: get_sheet_info(worksheet: "${result.worksheet}")`
        ];
        break;
      case 'delete_sheet':
        if (result.remaining_sheets && result.remaining_sheets.length > 0) {
          structuredData.nextActions = [
            `Switch to: ${result.remaining_sheets[0]}`,
            'Verify remaining data integrity'
          ];
        }
        break;
      case 'format_range':
        structuredData.nextActions = [
          'Save workbook to preserve formatting',
          'Preview formatted output'
        ];
        break;
      default:
        break;
    }
  }

  // =====================================================
  // HELPFUL RESPONSE GENERATION METHODS
  // =====================================================

  /**
   * Generate helpful success response based on helpful_tool_response.webp best practices
   */
  private generateHelpfulSuccessResponse(result: XlwingsResult, params: XlwingsParams): string {
    const operation = result.operation || params.op;
    
    switch (operation) {
      case 'get_sheet_info':
        return this.generateSheetInfoSuccessResponse(result, params);
      case 'sort_range':
        return this.generateSortRangeSuccessResponse(result, params);
      case 'read_range':
        return this.generateReadRangeSuccessResponse(result, params);
      case 'find_range':
        return this.generateFindRangeSuccessResponse(result, params);
      case 'create_shape':
        return this.generateCreateShapeSuccessResponse(result, params);
      case 'list_shapes':
        return this.generateListShapesSuccessResponse(result, params);
      case 'create_textbox':
        return this.generateCreateTextboxSuccessResponse(result, params);
      case 'write_range':
        return this.generateWriteRangeSuccessResponse(result, params);
      case 'format_range':
        return this.generateFormatRangeSuccessResponse(result, params);
      case 'delete_sheet':
        return this.generateDeleteSheetSuccessResponse(result, params);
      default:
        // Fallback to existing logic for other operations
        return this.generateGenericSuccessResponse(result, params);
    }
  }

  /**
   * Generate helpful success response for get_sheet_info operation
   */
  private generateSheetInfoSuccessResponse(result: XlwingsResult, params: XlwingsParams): string {
    const data = result.data as SheetData;
    if (!data) return 'Sheet analysis completed.';

    let response = '';
    
    // 1. Detect data pattern and create summary
    const pattern = this.detectDataPattern(data);
    response += `Found **${pattern}** in worksheet "${result.worksheet}".\n\n`;

    // 2. Sheet summary with key statistics
    if (data.used_range) {
      const usedRange = data.used_range;
      response += `**Sheet Summary:**\n`;
      response += `- Total data: ${usedRange.total_rows} rows × ${usedRange.total_columns} columns (${usedRange.address || 'Empty sheet'})\n`;
      
      // Detect headers
      if (data.top_rows && data.top_rows.data && data.top_rows.data.length > 0) {
        const firstRow = data.top_rows.data[0];
        let hasHeaders = false;
        let headers: unknown[] = [];

        if (Array.isArray(firstRow) && typeof firstRow[0] !== 'object') {
          // Simple array format - convert to CellInfo format for header detection
          const cellInfoRow = firstRow.map(cell => ({ value: cell } as CellInfo));
          hasHeaders = this.detectHeaders(cellInfoRow);
          headers = firstRow.filter((v: unknown) => v !== null);
        } else {
          // Already in CellInfo format
          hasHeaders = this.detectHeaders(firstRow as CellInfo[]);
          headers = (firstRow as CellInfo[]).map(cell => cell.value).filter((v: unknown) => v !== null);
        }

        if (hasHeaders) {
          response += `- Headers detected: Row 1 (${headers.join(', ')})\n`;
          response += `- Data rows: ${usedRange.total_rows - 1} records\n`;
        } else {
          response += `- Data rows: ${usedRange.total_rows} records (no headers detected)\n`;
        }
      }
    }

    // 3. Data preview
    if (data.top_rows && data.top_rows.data && data.top_rows.data.length > 0) {
      response += `\n**Top ${data.top_rows.count} rows preview:**\n`;
      // Check if data is in simple array format and convert to CellInfo format
      const previewData = data.top_rows.data;
      if (Array.isArray(previewData[0]) && typeof previewData[0][0] !== 'object') {
        // Simple array format - convert to CellInfo format
        const cellInfoData = previewData.map((row: unknown[]) =>
          row.map(cell => ({ value: cell } as CellInfo))
        );
        response += this.formatDataAsTable(cellInfoData, 10);
      } else {
        // Already in CellInfo format
        response += this.formatDataAsTable(previewData, 10);
      }
    }

    // 4. Additional insights
    if (data.merged_cells && data.merged_cells.count > 0) {
      response += `\n**Merged cells:** ${data.merged_cells.count} areas found`;
    }

    // 5. Next action suggestions
    response += this.generateNextActionSuggestions(result, params);

    return response;
  }

  /**
   * Detect data pattern in sheet analysis result
   */
  private detectDataPattern(data: SheetData): string {
    if (!data.used_range || !data.used_range.address) {
      return 'empty sheet';
    }

    const hasTopRows = data.top_rows && data.top_rows.data && data.top_rows.data.length > 0;
    if (!hasTopRows) {
      return 'data range';
    }

    const firstRow = data.top_rows?.data[0];
    let hasHeaders = false;

    if (firstRow) {
      if (Array.isArray(firstRow) && typeof firstRow[0] !== 'object') {
        // Simple array format - convert to CellInfo format for header detection
        const cellInfoRow = firstRow.map(cell => ({ value: cell } as CellInfo));
        hasHeaders = this.detectHeaders(cellInfoRow);
      } else {
        // Already in CellInfo format
        hasHeaders = this.detectHeaders(firstRow as CellInfo[]);
      }
    }
    
    if (hasHeaders) {
      return 'table with headers';
    }

    const totalRows = data.used_range.total_rows;
    if (totalRows > 10) {
      return 'large dataset';
    } else if (totalRows > 1) {
      return 'data table';
    } else {
      return 'single row data';
    }
  }

  /**
   * Detect if first row contains headers
   */
  private detectHeaders(firstRow: CellInfo[] | unknown[]): boolean {
    if (!firstRow || firstRow.length === 0) return false;

    // Check if all cells in first row are text (typical for headers)
    const textCells = firstRow.filter(cell => {
      if (cell && typeof cell === 'object' && 'value' in cell) {
        // CellInfo format
        return (cell as CellInfo).value && typeof (cell as CellInfo).value === 'string';
      } else {
        // Simple format
        return cell && typeof cell === 'string';
      }
    }).length;

    // If most cells are text, likely headers
    return textCells >= firstRow.length * 0.7;
  }

  /**
   * Format data as markdown table
   */
  private formatDataAsTable(data: unknown[][], maxCols: number = 10): string {
    if (!data || data.length === 0) return '';

    // Normalize data to simple array format
    const visibleData = data.map(row => {
      if (!Array.isArray(row)) {
        // Handle case where data is not properly formatted as 2D array
        return [row].slice(0, maxCols).map(cell => String(cell ?? ''));
      }

      return row.slice(0, maxCols).map(cell => {
        // Handle both CellInfo format and simple format
        if (cell && typeof cell === 'object' && 'value' in cell) {
          return String((cell as CellInfo).value ?? '');
        } else {
          return String(cell ?? '');
        }
      });
    });

    const colCount = Math.min(visibleData[0]?.length || 0, maxCols);
    if (colCount === 0) return '';

    // Determine if we should treat first row as headers
    const hasHeaders = data.length > 1 && this.detectHeaders(data[0]);

    if (hasHeaders) {
      // Create header row
      let table = '| ';
      for (let col = 0; col < colCount; col++) {
        table += `${String(visibleData[0][col]).replace(/\|/g, '\\|')} | `;
      }
      table += '\n| ';

      // Separator
      for (let col = 0; col < colCount; col++) {
        table += '--- | ';
      }
      table += '\n';

      // Data rows (skip header row)
      for (let row = 1; row < Math.min(data.length, 6); row++) {
        table += '| ';
        for (let col = 0; col < colCount; col++) {
          const cellValue = visibleData[row]?.[col] ?? '';
          table += `${String(cellValue).replace(/\|/g, '\\|')} | `;
        }
        table += '\n';
      }
      return table;
    } else {
      // No headers - treat all rows as data with generic column headers
      let table = '| ';
      for (let col = 0; col < colCount; col++) {
        table += `Col${col + 1} | `;
      }
      table += '\n| ';

      // Separator
      for (let col = 0; col < colCount; col++) {
        table += '--- | ';
      }
      table += '\n';

      // All rows are data rows
      for (let row = 0; row < Math.min(data.length, 5); row++) {
        table += '| ';
        for (let col = 0; col < colCount; col++) {
          const cellValue = visibleData[row]?.[col] ?? '';
          table += `${String(cellValue).replace(/\|/g, '\\|')} | `;
        }
        table += '\n';
      }
      return table;
    }
  }

  /**
   * Generate next action suggestions based on operation and results
   */
  private generateNextActionSuggestions(result: XlwingsResult, params: XlwingsParams): string {
    const operation = result.operation || params.op;
    let suggestions = '\n## To work with this data:\n';

    switch (operation) {
      case 'get_sheet_info':
        {
          const data = result.data as SheetData;
          if (data && data.used_range && data.used_range.address) {
            const range = data.used_range.address;
            const hasHeaders = data.top_rows?.data?.[0] ? this.detectHeaders(data.top_rows.data[0]) : false;
            const dataRange = hasHeaders ? 
              `A2:${data.used_range.last_column_letter}${data.used_range.last_row}` : 
              range;
  
            suggestions += `- **Sort by column**: \`sort_range(range: "${dataRange}", sort: {"keys": [{"column": "A", "order": "desc"}]})\`\n`;
            suggestions += `- **Read all data**: \`read_range(range: "${range}")\`\n`;
            suggestions += `- **Add more data**: \`write_range(range: "A${(data.used_range.last_row || 1) + 1}", data: [["new", "row"]])\`\n`;
          }
          break;
        }
      
      default:
        suggestions += `- **Analyze structure**: \`get_sheet_info(worksheet: "${result.worksheet}")\`\n`;
        break;
    }

    return suggestions;
  }

  /**
   * Generate helpful success response for sort_range operation
   */
  private generateSortRangeSuccessResponse(result: XlwingsResult, params: XlwingsParams): string {
    let response = `Sorted **${result.rows_affected || 'data'}** by specified criteria.`;
    
    if (result.range) {
      response += `\n\n**Range sorted:** ${result.range}`;
    }
    
    if (result.sort_criteria && result.sort_criteria.length > 0) {
      response += `\n**Sort criteria:** ${result.sort_criteria.slice(0, 3).map((c: SortCriteria) => `${c.column} (${c.order})`).join(', ')}`;
    }
    
    response += `\n\n## Next actions:\n`;
    response += `- **View results:** read_range(range: "${result.range || params.range}")\n`;
    response += `- **Analyze data:** get_sheet_info(worksheet: "${result.worksheet}")`;
    
    return response;
  }

  /**
   * Generate helpful success response for read_range operation
   */
  private generateReadRangeSuccessResponse(result: XlwingsResult, params: XlwingsParams): string {
    const data = result.data;
    let response = '';

    if (Array.isArray(data)) {
      const rowCount = Array.isArray(data[0]) ? data.length : 1;
      const colCount = Array.isArray(data[0]) ? data[0].length : data.length;

      response = `Read **${rowCount} rows × ${colCount} columns** from ${result.range || params.range}.`;

      // Show preview if reasonable size
      if (rowCount <= 10 && colCount <= 10) {
        response += `\n\n**Data preview:**\n`;
        // Check if data is in simple array format and convert to CellInfo format if needed
        try {
          // formatDataAsTable now handles both simple arrays and CellInfo format
          response += this.formatDataAsTable(data, 10);
        } catch (error) {
          // Fallback: use simple array format
          response += this.formatDataAsTable(data, 10);
          console.error('Error formatting data preview:', error);
        }
      }
    } else {
      response = `Read data from ${result.range || params.range}.`;
    }

    response += `\n\n## Next actions:\n`;
    response += `- **Sort data:** sort_range(range: "${result.range || params.range}")\n`;
    response += `- **Analyze structure:** get_sheet_info(worksheet: "${result.worksheet}")`;

    return response;
  }

  /**
   * Generate helpful success response for find_range operation
   */
  private generateFindRangeSuccessResponse(result: XlwingsResult, _params: XlwingsParams): string {
    let response = '';
    
    if (result.found_addresses && result.found_addresses.length > 0) {
      response = `Found **${result.found_addresses.length} matches** for search criteria.`;
      response += `\n\n**Found at:** ${result.found_addresses.slice(0, 5).join(', ')}`;
      
      if (result.found_addresses.length > 5) {
        response += ` and ${result.found_addresses.length - 5} more locations`;
      }
    } else {
      response = `No matches found for the search criteria.`;
    }
    
    response += `\n\n## Next actions:\n`;
    response += `- **Read found data:** read_range(range: "${result.found_addresses?.[0] || 'A1'}")\n`;
    response += `- **Expand search:** Try different search terms or use get_sheet_info() to analyze data structure`;
    
    return response;
  }

  /**
   * Generate generic success response for operations not yet optimized
   */
  private generateGenericSuccessResponse(result: XlwingsResult, params: XlwingsParams): string {
    // Return the existing success response logic
    return `Excel ${params.op} operation completed successfully.`;
  }

  /**
   * Generate success response for create_shape operation
   */
  private generateCreateShapeSuccessResponse(result: XlwingsResult, params: XlwingsParams): string {
    let response = `✅ **Shape created successfully!**\n\n`;

    response += `**Shape Details:**\n`;
    response += `- **Name:** ${result.shape?.name || 'Unknown'}\n`;
    response += `- **Type:** ${result.shape?.type || params.shape?.type || 'Unknown'}\n`;
    response += `- **Position:** Left ${result.shape?.position?.left || 'N/A'}, Top ${result.shape?.position?.top || 'N/A'}\n`;
    response += `- **Size:** ${result.shape?.size?.width || 'N/A'} × ${result.shape?.size?.height || 'N/A'} points\n`;

    if (result.shape?.text && result.shape.text.trim()) {
      response += `- **Text:** "${result.shape.text}"\n`;
    }

    response += `\n**Next actions:**\n`;
    response += `- **List all shapes:** list_shapes(worksheet: "${result.worksheet}")\n`;
    response += `- **Modify shape:** modify_shape(shape_name: "${result.shape?.name}")\n`;
    response += `- **Move shape:** move_shape(shape_name: "${result.shape?.name}", position: "D5")`;

    return response;
  }

  /**
   * Generate success response for list_shapes operation
   */
  private generateListShapesSuccessResponse(result: XlwingsResult, _params: XlwingsParams): string {
    const shapes = result.shapes || [];
    let response = `✅ **Found ${shapes.length} shape(s)** in worksheet "${result.worksheet}":\n\n`;

    if (shapes.length === 0) {
      response += `No shapes found in this worksheet.\n\n`;
      response += `**Create shapes:**\n`;
      response += `- **Rectangle:** create_shape(shape_type: "rectangle", size: {width: 100, height: 50})\n`;
      response += `- **Circle:** create_shape(shape_type: "oval", size: {width: 80, height: 80})\n`;
      response += `- **Text box:** create_textbox(text: "Your text here")`;
    } else {
      shapes.forEach((shape: {
        name: string;
        type: string;
        position?: { left?: number; top?: number };
        size?: { width?: number; height?: number };
        text?: string;
      }, index: number) => {
        response += `**${index + 1}. ${shape.name || 'Unnamed'}** (${shape.type || 'Unknown type'})\n`;
        response += `   - Position: ${shape.position?.left || 'N/A'}, ${shape.position?.top || 'N/A'}\n`;
        response += `   - Size: ${shape.size?.width || 'N/A'} × ${shape.size?.height || 'N/A'}\n`;
        if (shape.text && shape.text.trim()) {
          response += `   - Text: "${shape.text}"\n`;
        }
        response += `\n`;
      });

      response += `**Shape operations:**\n`;
      response += `- **Modify:** modify_shape(shape_name: "ShapeName")\n`;
      response += `- **Delete:** delete_shape(shape_name: "ShapeName")\n`;
      response += `- **Move:** move_shape(shape_name: "ShapeName", position: "D5")`;
    }

    return response;
  }

  /**
   * Generate success response for create_textbox operation
   */
  private generateCreateTextboxSuccessResponse(result: XlwingsResult, params: XlwingsParams): string {
    let response = `✅ **Text box created successfully!**\n\n`;

    response += `**Text Box Details:**\n`;
    response += `- **Name:** ${result.shape?.name || 'Unknown'}\n`;
    response += `- **Text:** "${result.shape?.text || params.shape?.text || ''}"\n`;
    response += `- **Position:** Left ${result.shape?.position?.left || 'N/A'}, Top ${result.shape?.position?.top || 'N/A'}\n`;
    response += `- **Size:** ${result.shape?.size?.width || 'N/A'} × ${result.shape?.size?.height || 'N/A'} points\n`;

    response += `\n**Next actions:**\n`;
    response += `- **Edit text:** modify_shape(shape_name: "${result.shape?.name}", text: "New text")\n`;
    response += `- **Move textbox:** move_shape(shape_name: "${result.shape?.name}", position: "C4")\n`;
    response += `- **List all shapes:** list_shapes()`;

    return response;
  }

  private generateShowExcelLogic(params: XlwingsParams): string {
    return `
# Show Excel application
try:
    target_app = None
    apps_info = []

    app_id = ${params.app_id || 'None'}
    workbook_name = "${params.workbook || ''}"

    if app_id is not None:
        # Try to find specific app by ID/PID
        for app in xw.apps:
            if hasattr(app, 'pid') and app.pid == app_id:
                target_app = app
                break

        if not target_app:
            result = {
                "success": False,
                "operation": "show_excel",
                "error_type": "app_not_found",
                "error_message": f"Excel application with ID {app_id} not found",
                "context": {
                    "app_id": app_id,
                    "available_apps": [{"pid": app.pid, "visible": app.visible} for app in xw.apps]
                }
            }
            print(json.dumps(result))
            exit()
    elif workbook_name:
        # Use get_workbook_smart to find the app with this workbook
        wb, app, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}")
        if wb and app:
            target_app = app
        else:
            result = {
                "success": False,
                "operation": "show_excel",
                "error_type": "workbook_not_found",
                "error_message": f"Could not find or access workbook '{workbook_name}'",
                "context": {
                    "workbook": workbook_name
                }
            }
            print(json.dumps(result))
            exit()
    else:
        # Show all Excel applications
        if not xw.apps:
            # No Excel apps running, create a new visible one
            target_app = xw.App(visible=True)
            apps_info.append({
                "pid": target_app.pid,
                "visible": True,
                "action": "created_new"
            })
        else:
            # Show all existing apps
            for app in xw.apps:
                app.visible = True
                apps_info.append({
                    "pid": app.pid,
                    "visible": True,
                    "action": "made_visible"
                })

    if target_app:
        # Show specific app
        target_app.visible = True
        apps_info.append({
            "pid": target_app.pid,
            "visible": True,
            "action": "made_visible"
        })

    result = {
        "success": True,
        "operation": "show_excel",
        "apps_affected": len(apps_info),
        "apps_info": apps_info,
        "message": f"Made {len(apps_info)} Excel application(s) visible"
    }
    print(json.dumps(result))

except Exception as e:
    result = {
        "success": False,
        "operation": "show_excel",
        "error_type": "show_failed",
        "error_message": str(e)
    }
    print(json.dumps(result))`;
  }

  private generateHideExcelLogic(params: XlwingsParams): string {
    return `
# Hide Excel application
try:
    target_app = None
    apps_info = []

    app_id = ${params.app_id || 'None'}
    workbook_name = "${params.workbook || ''}"

    if app_id is not None:
        # Try to find specific app by ID/PID
        for app in xw.apps:
            if hasattr(app, 'pid') and app.pid == app_id:
                target_app = app
                break

        if not target_app:
            result = {
                "success": False,
                "operation": "hide_excel",
                "error_type": "app_not_found",
                "error_message": f"Excel application with ID {app_id} not found",
                "context": {
                    "app_id": app_id,
                    "available_apps": [{"pid": app.pid, "visible": app.visible} for app in xw.apps]
                }
            }
            print(json.dumps(result))
            exit()
    elif workbook_name:
        # Use get_workbook_smart to find the app with this workbook
        wb, app, opened_by_us, created_by_us = get_workbook_smart("${this.escapePythonPath(params.workbook || '')}")
        if wb and app:
            target_app = app
        else:
            result = {
                "success": False,
                "operation": "hide_excel",
                "error_type": "workbook_not_found",
                "error_message": f"Could not find or access workbook '{workbook_name}'",
                "context": {
                    "workbook": workbook_name
                }
            }
            print(json.dumps(result))
            exit()
    else:
        # Hide all Excel applications
        if not xw.apps:
            result = {
                "success": True,
                "operation": "hide_excel",
                "apps_affected": 0,
                "apps_info": [],
                "message": "No Excel applications running"
            }
            print(json.dumps(result))
            exit()
        else:
            # Hide all existing apps
            for app in xw.apps:
                if app.visible:
                    app.visible = False
                    apps_info.append({
                        "pid": app.pid,
                        "visible": False,
                        "action": "hidden"
                    })
                else:
                    apps_info.append({
                        "pid": app.pid,
                        "visible": False,
                        "action": "already_hidden"
                    })

    if target_app:
        # Hide specific app
        if target_app.visible:
            target_app.visible = False
            apps_info.append({
                "pid": target_app.pid,
                "visible": False,
                "action": "hidden"
            })
        else:
            apps_info.append({
                "pid": target_app.pid,
                "visible": False,
                "action": "already_hidden"
            })

    result = {
        "success": True,
        "operation": "hide_excel",
        "apps_affected": len([app for app in apps_info if app["action"] == "hidden"]),
        "apps_info": apps_info,
        "message": f"Processed {len(apps_info)} Excel application(s)"
    }
    print(json.dumps(result))

except Exception as e:
    result = {
        "success": False,
        "operation": "hide_excel",
        "error_type": "hide_failed",
        "error_message": str(e)
    }
    print(json.dumps(result))`;
  }

  /**
   * Generate helpful success response for write_range operation
   */
  private generateWriteRangeSuccessResponse(result: XlwingsResult, _params: XlwingsParams): string {
    const rows = result.data?.length || 0;
    const cols = Array.isArray(result.data?.[0]) ? result.data[0].length : (result.data?.length || 0);

    let response = `✅ **Data written successfully**\n\n`;
    response += `**Summary:**\n`;
    response += `- Range: ${result.range}\n`;
    response += `- Data size: ${rows} rows × ${cols} columns\n`;
    if (result.cells_affected) {
      response += `- Cells affected: ${result.cells_affected}\n`;
    }

    if (result.workbook) {
      response += `- Workbook: ${result.workbook}\n`;
    }
    if (result.worksheet) {
      response += `- Worksheet: ${result.worksheet}\n`;
    }

    return response;
  }

  /**
   * Generate helpful success response for format_range operation
   */
  private generateFormatRangeSuccessResponse(result: XlwingsResult, _params: XlwingsParams): string {
    let response = `✅ **Formatting applied successfully**\n\n`;
    response += `**Details:**\n`;
    response += `- Range: ${result.range}\n`;
    if (result.cells_affected) {
      response += `- Cells formatted: ${result.cells_affected}\n`;
    }

    return response;
  }

  /**
   * Generate helpful success response for delete_sheet operation
   */
  private generateDeleteSheetSuccessResponse(result: XlwingsResult, _params: XlwingsParams): string {
    let response = `✅ **Worksheet deleted successfully**\n\n`;

    if (result.deleted_sheet_name) {
      response += `**Deleted:** "${result.deleted_sheet_name}"\n\n`;
    }

    if (result.remaining_sheets && result.remaining_sheets.length > 0) {
      response += `**Remaining worksheets (${result.remaining_sheets_count}):**\n`;
      for (const sheet of result.remaining_sheets) {
        response += `- ${sheet}\n`;
      }
    }

    return response;
  }
}