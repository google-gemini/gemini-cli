/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  BaseDeclarativeTool,
  type ToolInvocation,
  type ToolResult,
} from './tools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { Kind } from './tools.js';
import { GraphService } from '../services/graphService.js';
import type { Config } from '../config/config.js';
import process from 'node:process';

class GraphInitToolInvocation implements ToolInvocation<object, ToolResult> {
  constructor(
    readonly params: object,
    _config: Config,
    _toolName?: string,
  ) {}

  getDescription(): string {
    return 'Indexes the current project into .gemini/gemini.idx (SQLite graph) and generates .gemini/GEMINI.md. Run this once before using graph_query. Safe to re-run — unchanged files are skipped.';
  }

  toolLocations(): any[] {
    return [];
  }

  async shouldConfirmExecute(): Promise<false> {
    return false;
  }

  async execute(): Promise<ToolResult> {
    const cwd = process.cwd();
    const service = new GraphService(cwd);

    let stats;
    try {
      stats = service.indexProject();
    } finally {
      service.close();
    }

    const text = `Indexed ${stats.files_indexed} file(s) (${stats.files_skipped} unchanged), ${stats.functions} functions, ${stats.classes} classes, ${stats.edges} call edges.
Graph: ${stats.db_path}
Summary: ${cwd}/GEMINI.md  ← auto-loaded by gemini-cli on every session

IMPORTANT — GEMINI.md is loaded in your context but it shows LOCATION ONLY (file + line).
It does NOT contain callers or callees. You must call graph_search to get those.

CODING WORKFLOW — follow this every time you modify a function or class:
1. graph_search("<name>") — get args, callers, callees before touching the symbol
2. graph_query("<name>") — if you need to trace the full call chain
3. read_file — only after you know exactly which file and line to open
4. grep_search — only for non-symbol searches (strings, comments, config values)

NEVER skip step 1. Editing without knowing callers risks silent breakage.

Tool routing:
- "Where is X defined?" → graph_search("X")
- "What calls X? What does X call?" → graph_query("X")
- "Find text/string/comment" → grep_search("X")`;

    return {
      llmContent: [{ text }],
      returnDisplay: text,
    };
  }
}

export class GraphInitTool extends BaseDeclarativeTool<object, ToolResult> {
  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      'graph_init',
      'Graph Init',
      'Index the current project into .gemini/gemini.idx (SQLite graph) and generate .gemini/GEMINI.md.',
      Kind.Edit,
      { type: 'object', properties: {} },
      messageBus,
    );
  }

  protected createInvocation(
    params: object,
    _messageBus: MessageBus,
    toolName?: string,
  ): ToolInvocation<object, ToolResult> {
    return new GraphInitToolInvocation(params, this.config, toolName);
  }
}

export interface GraphQueryParams {
  search: string;
}

class GraphQueryToolInvocation
  implements ToolInvocation<GraphQueryParams, ToolResult>
{
  constructor(
    readonly params: GraphQueryParams,
    _config: Config,
    _toolName?: string,
  ) {}

  getDescription(): string {
    return `Queries the code graph for "${this.params.search}"`;
  }

  toolLocations(): any[] {
    return [];
  }

  async shouldConfirmExecute(): Promise<false> {
    return false;
  }

  async execute(): Promise<ToolResult> {
    const cwd = process.cwd();
    const service = new GraphService(cwd);
    let results: any[];

    try {
      results = service.queryGraph(this.params.search);
    } catch (e: any) {
      if (e.message && e.message.includes('no such table')) {
        return {
          llmContent: [
            {
              text: 'Error: Graph database not found. Please run graph_init first.',
            },
          ],
          returnDisplay:
            'Error: Graph database not found. Please run graph_init first.',
        };
      }
      throw e;
    } finally {
      service.close();
    }

    const text =
      results.length > 0
        ? JSON.stringify(results, null, 2)
        : `No nodes found matching '${this.params.search}'. Run graph_init first if you haven't already.`;

    return {
      llmContent: [{ text }],
      returnDisplay: text,
    };
  }
}

export class GraphQueryTool extends BaseDeclarativeTool<
  GraphQueryParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      'graph_query',
      'Graph Query',
      'Use this when you need to trace the full call chain: what calls X, or what X calls. Returns the complete caller/callee graph — grep_search and read_file cannot provide this. Call this before refactoring any function that may have multiple call sites.',
      Kind.Search,
      {
        type: 'object',
        properties: {
          search: {
            type: 'string',
            description:
              'Name (or partial name) of the function/class to look up',
          },
        },
        required: ['search'],
      },
      messageBus,
      false, // isOutputMarkdown
      false, // canUpdateOutput
    );
  }

  protected createInvocation(
    params: GraphQueryParams,
    _messageBus: MessageBus,
    toolName?: string,
  ): ToolInvocation<GraphQueryParams, ToolResult> {
    return new GraphQueryToolInvocation(params, this.config, toolName);
  }
}

export interface GraphSearchParams {
  keyword: string;
}

class GraphSearchToolInvocation
  implements ToolInvocation<GraphSearchParams, ToolResult>
{
  constructor(
    readonly params: GraphSearchParams,
    _config: Config,
    _toolName?: string,
  ) {}

  getDescription(): string {
    return `Searching code index for "${this.params.keyword}"`;
  }

  toolLocations(): any[] {
    return [];
  }

  async shouldConfirmExecute(): Promise<false> {
    return false;
  }

  async execute(): Promise<ToolResult> {
    const cwd = process.cwd();
    const service = new GraphService(cwd);
    let results: any[];

    try {
      results = service.queryGraph(this.params.keyword);
    } catch (e: any) {
      if (e.message && e.message.includes('no such table')) {
        return {
          llmContent: [
            {
              text: 'Error: Graph database not found. Please run graph_init first.',
            },
          ],
          returnDisplay:
            'Error: Graph database not found. Please run graph_init first.',
        };
      }
      throw e;
    } finally {
      service.close();
    }

    const text =
      results.length > 0
        ? JSON.stringify(results, null, 2)
        : `No symbols found matching '${this.params.keyword}'. Run graph_init first if you haven't already.`;

    return {
      llmContent: [{ text }],
      returnDisplay: text,
    };
  }
}

export class GraphSearchTool extends BaseDeclarativeTool<
  GraphSearchParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      'graph_search',
      'Graph Search',
      'ALWAYS call this before editing any function or class. Returns file, line, arguments, callers (who calls it), and callees (what it calls) — information GEMINI.md does NOT contain. Use this instead of grep_search for any symbol lookup. Partial keyword matching supported.',
      Kind.Search,
      {
        type: 'object',
        properties: {
          keyword: {
            type: 'string',
            description:
              'Keyword to search for in function/class names (partial match supported)',
          },
        },
        required: ['keyword'],
      },
      messageBus,
      false,
      false,
    );
  }

  protected createInvocation(
    params: GraphSearchParams,
    _messageBus: MessageBus,
    toolName?: string,
  ): ToolInvocation<GraphSearchParams, ToolResult> {
    return new GraphSearchToolInvocation(params, this.config, toolName);
  }
}
