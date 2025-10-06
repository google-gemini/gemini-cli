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
// import { ExcelTool } from './excel-dotnet-tool.js';
import { PDFTool } from './pdf-tool.js';
import { ZipTool } from './zip-tool.js';
import { FileTool } from './file-tool.js';
import { WebTool } from './web-tool.js';
import { TodoTool } from './todo-tool.js';
import { PythonEmbeddedTool } from './python-embedded-tool.js';
import { XlwingsTool } from './xlwings-tool.js';
import { MarkItDownTool } from './markitdown-tool.js';
import { GeminiSearchTool } from './gemini-search-tool.js';
import { JPXInvestorTool } from './jpx-investor-tool.js';
import { EconomicCalendarTool } from './economic-calendar-tool.js';
import { FinancialAnalyzer } from './financial-analyzer-tool.js';
import { EconomicNewsTool } from './economic-news-tool.js';
import { KnowledgeBaseTool } from './knowledge-base-tool.js';
import { XlwingsDocTool } from './xlwings-doc-tool.js';

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
    MemoryTool,
    PythonEmbeddedTool,
    XlwingsTool,
    MarkItDownTool,
    KnowledgeBaseTool
  ],
  office_assistant: [
    LSTool,
    // ReadFileTool,
    // WriteFileTool,
    FileTool,
    ShellTool,
    WebTool,
    // XlwingsTool,
    XlwingsDocTool,
    MarkItDownTool,
    KnowledgeBaseTool,
    PDFTool,
    ZipTool,
    TodoTool,
    MemoryTool,
    PythonEmbeddedTool,
    GeminiSearchTool
  ],
  translator: [
    ReadFileTool,
    WriteFileTool,
    EditTool,
    GeminiSearchTool,
    // WebSearchTool
  ],
  creative_writer: [
    ReadFileTool,
    WriteFileTool,
    EditTool,
    GeminiSearchTool,
    // WebSearchTool
  ],
  data_analyst: [
    ReadFileTool,
    WriteFileTool,
    EditTool,
    ShellTool,
    RipGrepTool,
    GeminiSearchTool,
    // WebSearchTool,
    XlwingsTool,
    MarkItDownTool
  ],
  financial_analyst: [
    // ReadFileTool,
    // WriteFileTool,
    // EditTool,
    // ShellTool,
    GeminiSearchTool,
    WebTool,
    PythonEmbeddedTool,
    JPXInvestorTool,
    EconomicCalendarTool,
    FinancialAnalyzer,
    EconomicNewsTool,
    // MarkItDownTool,
    MemoryTool
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