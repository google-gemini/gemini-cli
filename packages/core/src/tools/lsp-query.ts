/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolResult,
} from './tools.js';
import type { Config } from '../config/config.js';
import { ToolErrorType } from './tool-error.js';
import { LSP_QUERY_TOOL_NAME } from './tool-names.js';
import { LSP_QUERY_DEFINITION } from './definitions/coreTools.js';
import { resolveToolDeclaration } from './definitions/resolver.js';
import { formatDiagnostics, formatSymbolSummary } from '../lsp/enrichment.js';
import type { Hover, Location } from '../lsp/types.js';

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

interface LspQueryParams {
  operation:
    | 'diagnostics'
    | 'hover'
    | 'definition'
    | 'references'
    | 'document_symbols'
    | 'workspace_symbols';
  file_path: string;
  line?: number;
  character?: number;
  query?: string;
}

// ---------------------------------------------------------------------------
// Invocation
// ---------------------------------------------------------------------------

class LspQueryInvocation extends BaseToolInvocation<
  LspQueryParams,
  ToolResult
> {
  private readonly resolvedPath: string;

  constructor(
    private readonly config: Config,
    params: LspQueryParams,
    messageBus: MessageBus,
  ) {
    super(params, messageBus, LSP_QUERY_TOOL_NAME, 'LSP Query');
    this.resolvedPath = path.resolve(config.getTargetDir(), params.file_path);
  }

  /**
   * Convert 1-based line/character from the model to 0-based for LSP.
   * If character is omitted, defaults to the first non-whitespace
   * character on that line (reads from disk).
   */
  private async getPosition(): Promise<{ line: number; character: number }> {
    const line = Math.max(0, (this.params.line ?? 1) - 1);
    if (this.params.character !== undefined) {
      return { line, character: Math.max(0, this.params.character - 1) };
    }
    // Default to first non-whitespace character on the line.
    try {
      const content = await fs.readFile(this.resolvedPath, 'utf-8');
      const lines = content.split('\n');
      if (line < lines.length) {
        const lineText = lines[line];
        const match = lineText.match(/\S/);
        if (match?.index !== undefined) {
          return { line, character: match.index };
        }
      }
    } catch {
      // Fall through to default.
    }
    return { line, character: 0 };
  }

  getDescription(): string {
    const op = this.params.operation;
    const file = path.basename(this.resolvedPath);
    if (op === 'hover' || op === 'definition' || op === 'references') {
      return `lsp_query ${op} at ${file}:${this.params.line}:${this.params.character ?? '?'}`;
    }
    if (op === 'workspace_symbols') {
      return `lsp_query workspace_symbols "${this.params.query}"`;
    }
    return `lsp_query ${op} on ${file}`;
  }

  async execute(signal: AbortSignal): Promise<ToolResult> {
    const lspMgr = await this.config.getLspManager();
    if (!lspMgr) {
      return {
        llmContent:
          'LSP is not enabled. Enable it in settings with { "tools": { "lsp": { "enabled": true } } } and restart.',
        returnDisplay: 'LSP not enabled.',
        error: {
          message: 'LSP not enabled',
          type: ToolErrorType.EXECUTION_FAILED,
        },
      };
    }

    if (!lspMgr.hasServerFor(this.resolvedPath)) {
      return {
        llmContent: `No language server is configured for ${path.basename(this.resolvedPath)}. LSP supports TypeScript and Python.`,
        returnDisplay: 'No LSP server for this file type.',
        error: {
          message: 'No server for file type',
          type: ToolErrorType.EXECUTION_FAILED,
        },
      };
    }

    try {
      switch (this.params.operation) {
        case 'diagnostics':
          return await this.runDiagnostics(signal);
        case 'hover':
          return await this.runHover(signal);
        case 'definition':
          return await this.runDefinition(signal);
        case 'references':
          return await this.runReferences(signal);
        case 'document_symbols':
          return await this.runDocumentSymbols(signal);
        case 'workspace_symbols':
          return await this.runWorkspaceSymbols(signal);
        default:
          return {
            llmContent: `Unknown operation: ${this.params.operation}`,
            returnDisplay: 'Unknown LSP operation.',
            error: {
              message: `Unknown operation: ${this.params.operation}`,
              type: ToolErrorType.INVALID_TOOL_PARAMS,
            },
          };
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        llmContent: `LSP query failed: ${msg}`,
        returnDisplay: `LSP error: ${msg}`,
        error: { message: msg, type: ToolErrorType.EXECUTION_FAILED },
      };
    }
  }

  private async runDiagnostics(signal: AbortSignal): Promise<ToolResult> {
    const lspMgr = (await this.config.getLspManager())!;
    const content = await fs.readFile(this.resolvedPath, 'utf-8');
    const result = await lspMgr.getDiagnostics(
      this.resolvedPath,
      content,
      signal,
    );

    if (result.timedOut) {
      return {
        llmContent:
          'LSP server timed out. It may still be starting up. Try again shortly.',
        returnDisplay: 'LSP timed out.',
      };
    }

    if (result.diagnostics.length === 0) {
      return {
        llmContent: `No diagnostics for ${path.basename(this.resolvedPath)}.`,
        returnDisplay: 'No diagnostics.',
      };
    }

    return {
      llmContent: formatDiagnostics(result.diagnostics, this.resolvedPath),
      returnDisplay: `${result.diagnostics.length} diagnostic(s).`,
    };
  }

  private async runHover(signal: AbortSignal): Promise<ToolResult> {
    const lspMgr = (await this.config.getLspManager())!;
    const pos = await this.getPosition();
    const hover = await lspMgr.getHover(
      this.resolvedPath,
      pos.line,
      pos.character,
      signal,
    );

    if (!hover) {
      return {
        llmContent: 'No hover information available at this position.',
        returnDisplay: 'No hover info.',
      };
    }

    const text = formatHoverContent(hover);
    return { llmContent: text, returnDisplay: 'Hover info retrieved.' };
  }

  private async runDefinition(signal: AbortSignal): Promise<ToolResult> {
    const lspMgr = (await this.config.getLspManager())!;
    const pos = await this.getPosition();
    const locations = await lspMgr.getDefinition(
      this.resolvedPath,
      pos.line,
      pos.character,
      signal,
    );

    if (locations.length === 0) {
      return {
        llmContent: 'No definition found at this position.',
        returnDisplay: 'No definition found.',
      };
    }

    const text = formatLocations(locations, 'Definition');
    return {
      llmContent: text,
      returnDisplay: `${locations.length} definition(s) found.`,
    };
  }

  private async runReferences(signal: AbortSignal): Promise<ToolResult> {
    const lspMgr = (await this.config.getLspManager())!;
    const pos = await this.getPosition();
    const locations = await lspMgr.getReferences(
      this.resolvedPath,
      pos.line,
      pos.character,
      signal,
    );

    if (locations.length === 0) {
      return {
        llmContent: 'No references found at this position.',
        returnDisplay: 'No references found.',
      };
    }

    const text = formatLocations(locations, 'References');
    return {
      llmContent: text,
      returnDisplay: `${locations.length} reference(s) found.`,
    };
  }

  private async runDocumentSymbols(signal: AbortSignal): Promise<ToolResult> {
    const lspMgr = (await this.config.getLspManager())!;
    const symbols = await lspMgr.getDocumentSymbols(this.resolvedPath, signal);

    if (symbols.length === 0) {
      return {
        llmContent: 'No symbols found in this file.',
        returnDisplay: 'No symbols.',
      };
    }

    const text = formatSymbolSummary(symbols, this.resolvedPath);
    return {
      llmContent: text,
      returnDisplay: `${symbols.length} symbol(s) found.`,
    };
  }

  private async runWorkspaceSymbols(signal: AbortSignal): Promise<ToolResult> {
    const lspMgr = (await this.config.getLspManager())!;
    const query = this.params.query ?? '';
    const symbols = await lspMgr.getWorkspaceSymbols(
      query,
      this.resolvedPath,
      signal,
    );

    if (symbols.length === 0) {
      return {
        llmContent: `No workspace symbols found matching "${query}".`,
        returnDisplay: 'No symbols found.',
      };
    }

    const lines = symbols.slice(0, 50).map((s) => {
      const loc = uriToRelativePath(s.location.uri);
      const line = s.location.range.start.line + 1;
      const container = s.containerName ? ` (in ${s.containerName})` : '';
      return `${s.name}${container} — ${loc}:${line}`;
    });

    const truncated =
      symbols.length > 50 ? `\n(${symbols.length - 50} more omitted)` : '';
    const text = `Found ${symbols.length} symbol(s) matching "${query}":\n\n${lines.join('\n')}${truncated}`;

    return {
      llmContent: text,
      returnDisplay: `${symbols.length} symbol(s) found.`,
    };
  }
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatHoverContent(hover: Hover): string {
  const contents = hover.contents;
  if (typeof contents === 'string') return contents;
  return contents.value;
}

function formatLocations(locations: Location[], label: string): string {
  const lines = locations.slice(0, 50).map((loc) => {
    const file = uriToRelativePath(loc.uri);
    const line = loc.range.start.line + 1;
    const col = loc.range.start.character + 1;
    return `${file}:${line}:${col}`;
  });

  const truncated =
    locations.length > 50 ? `\n(${locations.length - 50} more omitted)` : '';
  return `${label} (${locations.length} location(s)):\n\n${lines.join('\n')}${truncated}`;
}

function uriToRelativePath(uri: string): string {
  try {
    const filePath = new URL(uri).pathname;
    // Remove leading slash on Windows (e.g., /C:/...)
    const normalized =
      process.platform === 'win32' && filePath.startsWith('/')
        ? filePath.substring(1)
        : filePath;
    return decodeURIComponent(normalized);
  } catch {
    return uri;
  }
}

// ---------------------------------------------------------------------------
// Tool class
// ---------------------------------------------------------------------------

const POSITION_OPERATIONS = new Set(['hover', 'definition', 'references']);

export class LspQueryTool extends BaseDeclarativeTool<
  LspQueryParams,
  ToolResult
> {
  static readonly Name = LSP_QUERY_TOOL_NAME;

  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      LspQueryTool.Name,
      'LSP Query',
      LSP_QUERY_DEFINITION.base.description!,
      Kind.Search,
      LSP_QUERY_DEFINITION.base.parametersJsonSchema,
      messageBus,
      true, // canUpdateOutput
      false, // isHidden
    );
  }

  protected override validateToolParamValues(
    params: LspQueryParams,
  ): string | null {
    if (!params.operation) {
      return 'Missing required parameter: operation';
    }
    if (!params.file_path) {
      return 'Missing required parameter: file_path';
    }

    if (POSITION_OPERATIONS.has(params.operation)) {
      if (params.line === undefined) {
        return `Operation "${params.operation}" requires a line parameter.`;
      }
    }

    if (
      params.operation === 'workspace_symbols' &&
      (!params.query || params.query.trim() === '')
    ) {
      return 'Operation "workspace_symbols" requires a non-empty query parameter.';
    }

    const resolvedPath = path.resolve(
      this.config.getTargetDir(),
      params.file_path,
    );
    const validationError = this.config.validatePathAccess(resolvedPath);
    if (validationError) {
      return validationError;
    }

    return null;
  }

  override getSchema(modelId?: string) {
    return resolveToolDeclaration(LSP_QUERY_DEFINITION, modelId);
  }

  protected override createInvocation(
    params: LspQueryParams,
    messageBus: MessageBus,
  ): LspQueryInvocation {
    return new LspQueryInvocation(this.config, params, messageBus);
  }
}
