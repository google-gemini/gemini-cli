/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { LSTool } from './ls.js';
import { ReadFileTool } from './read-file.js';
import { GrepTool } from './grep.js';
import { RipGrepTool } from './ripGrep.js';
import { GlobTool } from './glob.js';
import { EditTool } from './edit.js';
import { WriteFileTool } from './write-file.js';
// import { WebFetchTool } from './web-fetch.js';
import { ReadManyFilesTool } from './read-many-files.js';
import { ShellTool } from './shell.js';
import { MemoryTool } from './memoryTool.js';
// import { WebSearchTool } from './web-search.js';
// import { ExcelTool } from './excel-tool.js';
import { ExcelTool } from './excel-dotnet-tool.js';
import { PDFTool } from './pdf-tool.js';
import { ZipTool } from './zip-tool.js';
import { FileTool } from './file-tool.js';
import { WebTool } from './web-tool.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolClass = any;

const ROLE_TOOLSET_MAP: Record<string, ToolClass[]> = {
  software_engineer: [
    LSTool,
    ReadFileTool,
    RipGrepTool,
    GlobTool,
    EditTool,
    WriteFileTool,
    ShellTool,
    GrepTool,
    ReadManyFilesTool,
    MemoryTool
  ],
  office_assistant: [
    LSTool,
    ReadFileTool,
    WriteFileTool,
    FileTool,
    ShellTool,
    WebTool,
    // WebSearchTool,
    ExcelTool,
    PDFTool,
    ZipTool
  ],
  translator: [
    ReadFileTool,
    WriteFileTool,
    EditTool,
    // WebSearchTool
  ],
  creative_writer: [
    ReadFileTool,
    WriteFileTool,
    EditTool,
    // WebSearchTool
  ],
  data_analyst: [
    ReadFileTool,
    WriteFileTool,
    EditTool,
    ShellTool,
    RipGrepTool,
    // WebSearchTool,
    ExcelTool
  ]
};


export class ToolsetManager {

  getToolsForRole(roleId: string): ToolClass[] {
    return ROLE_TOOLSET_MAP[roleId] || [];
  }

  getSupportedRoles(): string[] {
    return Object.keys(ROLE_TOOLSET_MAP);
  }
}