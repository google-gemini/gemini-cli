/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { PythonEmbeddedTool } from '../tools/python-embedded-tool.js';
import type { Config } from '../config/config.js';

interface WorkbookInfo {
  name: string;
  path?: string;
}

interface WorksheetInfo {
  index: number;
  name: string;
}

interface ExcelAppInfo {
  pid: number;
  visible: boolean;
  workbooks: WorkbookInfo[];
}

export interface ExcelToolResult {
  success: boolean;
  error?: string;
  apps?: ExcelAppInfo[];
  workbooks?: WorkbookInfo[];
  worksheets?: WorksheetInfo[];
}

/**
 * Direct Excel tool for frontend integration using xlwings
 */
export class ExcelTool {
  private pythonTool: PythonEmbeddedTool;

  constructor(config: Config) {
    this.pythonTool = new PythonEmbeddedTool(config);
  }

  /**
   * Execute Python code and parse JSON result
   */
  private async executePythonCode(pythonCode: string): Promise<ExcelToolResult> {
    try {
      const invocation = this.pythonTool.build({ code: pythonCode });
      const result = await invocation.execute(new AbortController().signal);

      if (result.returnDisplay && typeof result.returnDisplay === 'string') {
        // Extract JSON from the last line that looks like JSON
        const lines = result.returnDisplay.trim().split('\n');
        const lastLine = lines[lines.length - 1];

        if (lastLine.startsWith('{') && lastLine.endsWith('}')) {
          const parsed = JSON.parse(lastLine) as ExcelToolResult;
          return parsed;
        } else {
          return {
            success: false,
            error: 'No valid JSON output from Python tool'
          };
        }
      } else {
        return {
          success: false,
          error: 'No output from Python tool'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * List all Excel application instances with their workbooks
   */
  async listApps(): Promise<ExcelToolResult> {
    const pythonCode = `
import xlwings as xw
import json

try:
    apps_info = []

    # Check if there are any Excel apps running
    if not xw.apps:
        result = {
            "success": True,
            "apps": []
        }
    else:
        for app in xw.apps:
            app_info = {
                "pid": app.pid,
                "visible": app.visible,
                "workbooks": []
            }

            # Get workbooks for this app
            for book in app.books:
                workbook_info = {
                    "name": book.name,
                    "path": book.fullname if hasattr(book, 'fullname') else None
                }
                app_info["workbooks"].append(workbook_info)

            apps_info.append(app_info)

        result = {
            "success": True,
            "apps": apps_info
        }

    print(json.dumps(result), flush=True)

except Exception as e:
    result = {
        "success": False,
        "error": str(e)
    }
    print(json.dumps(result), flush=True)
`;

    return this.executePythonCode(pythonCode);
  }

  /**
   * List all open workbooks across all Excel instances
   */
  async listWorkbooks(): Promise<ExcelToolResult> {
    const pythonCode = `
import xlwings as xw
import json

try:
    workbooks = []

    # Check if there are any Excel apps running
    if not xw.apps:
        result = {
            "success": True,
            "workbooks": []
        }
    else:
        # Collect workbooks from all apps
        for app in xw.apps:
            for book in app.books:
                workbook_info = {
                    "name": book.name,
                    "path": book.fullname if hasattr(book, 'fullname') else None
                }
                workbooks.append(workbook_info)

        result = {
            "success": True,
            "workbooks": workbooks
        }

    print(json.dumps(result), flush=True)

except Exception as e:
    result = {
        "success": False,
        "error": str(e)
    }
    print(json.dumps(result), flush=True)
`;

    return this.executePythonCode(pythonCode);
  }

  /**
   * List worksheets in a specific workbook
   */
  async listWorksheets(workbookName: string): Promise<ExcelToolResult> {
    const pythonCode = `
import xlwings as xw
import json

try:
    target_workbook = "${workbookName.replace(/"/g, '\\"')}"
    worksheets = []
    found_workbook = None

    # Check if there are any Excel apps running
    if not xw.apps:
        result = {
            "success": False,
            "error": "No Excel applications are running"
        }
    else:
        # Find the specified workbook across all apps
        for app in xw.apps:
            for book in app.books:
                if book.name == target_workbook:
                    found_workbook = book
                    break
            if found_workbook:
                break

        if not found_workbook:
            result = {
                "success": False,
                "error": f"Workbook '{target_workbook}' not found"
            }
        else:
            # Get worksheets from the found workbook
            for i, sheet in enumerate(found_workbook.sheets):
                worksheet_info = {
                    "index": i,
                    "name": sheet.name
                }
                worksheets.append(worksheet_info)

            result = {
                "success": True,
                "workbook": target_workbook,
                "worksheets": worksheets
            }

    print(json.dumps(result), flush=True)

except Exception as e:
    result = {
        "success": False,
        "error": str(e)
    }
    print(json.dumps(result), flush=True)
`;

    return this.executePythonCode(pythonCode);
  }
}