/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../confirmation-bus/message-bus.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolInvocation,
  type ToolResult,
  type ExecuteOptions,
} from './tools.js';
import type { Config } from '../config/config.js';
import { AST_SEARCH_TOOL_NAME, AST_SEARCH_DISPLAY_NAME } from './tool-names.js';
import { AST_SEARCH_DEFINITION } from './definitions/coreTools.js';
import { resolveToolDeclaration } from './definitions/resolver.js';
import {
  ASTAnalysisService,
  type ASTFileOutline,
} from '../services/astAnalysisService.js';
import { debugLogger } from '../utils/debugLogger.js';

export interface ASTSearchToolParams {
  symbol_name?: string;
  file_path?: string;
  scope?: 'symbol' | 'outline' | 'map';
}

class ASTSearchInvocation extends BaseToolInvocation<
  ASTSearchToolParams,
  ToolResult
> {
  constructor(
    private config: Config,
    params: ASTSearchToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  getDescription(): string {
    const scope = this.params.scope ?? 'symbol';
    if (scope === 'map') return 'Generating codebase structure map';
    if (scope === 'outline')
      return `Outlining ${this.params.file_path ?? '(no file)'}`;
    return `Finding symbol "${this.params.symbol_name ?? ''}" in ${this.params.file_path ?? 'workspace'}`;
  }

  async execute(_options: ExecuteOptions): Promise<ToolResult> {
    const scope = this.params.scope ?? 'symbol';
    const astService = new ASTAnalysisService(this.config.getTargetDir());

    try {
      if (scope === 'map') {
        return await this.handleMapScope(astService);
      }

      if (!this.params.file_path) {
        return {
          llmContent:
            'Error: file_path is required for "symbol" and "outline" scopes.',
          returnDisplay: 'Missing file_path',
        };
      }

      if (scope === 'outline') {
        return await this.handleOutlineScope(astService);
      }

      // Default: symbol scope
      if (!this.params.symbol_name) {
        return {
          llmContent: 'Error: symbol_name is required for "symbol" scope.',
          returnDisplay: 'Missing symbol_name',
        };
      }

      return await this.handleSymbolScope(astService);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      debugLogger.warn('[ASTSearchTool] Error:', msg);
      return {
        llmContent: `AST search error: ${msg}`,
        returnDisplay: 'Error',
      };
    }
  }

  private async handleSymbolScope(
    astService: ASTAnalysisService,
  ): Promise<ToolResult> {
    const bounds = await astService.findSymbolBounds(
      this.params.file_path!,
      this.params.symbol_name!,
    );

    if (!bounds) {
      return {
        llmContent:
          `Symbol "${this.params.symbol_name}" not found in ${this.params.file_path}. ` +
          'Try using grep_search for a text-based search, or check the symbol name spelling.',
        returnDisplay: 'Symbol not found',
      };
    }

    const outline = await astService.getFileOutline(this.params.file_path!);
    const symbol = outline?.symbols
      .flatMap((s) => [s, ...s.children])
      .find((s) => s.name === this.params.symbol_name);

    const result = [
      `Found "${this.params.symbol_name}" in ${this.params.file_path}:`,
      `  Lines: ${bounds.startLine}-${bounds.endLine} (${bounds.endLine - bounds.startLine + 1} lines)`,
      symbol ? `  Kind: ${symbol.kind}` : '',
      symbol ? `  Signature: ${symbol.signature}` : '',
      '',
      `TIP: Use read_file with start_line=${bounds.startLine} and end_line=${bounds.endLine} to read the exact symbol body.`,
    ]
      .filter(Boolean)
      .join('\n');

    return {
      llmContent: result,
      returnDisplay: `${this.params.symbol_name}: L${bounds.startLine}-${bounds.endLine}`,
      display: {
        name: AST_SEARCH_DISPLAY_NAME,
        description: this.getDescription(),
        resultSummary: `L${bounds.startLine}-${bounds.endLine}`,
        result: { type: 'text', text: result },
      },
    };
  }

  private async handleOutlineScope(
    astService: ASTAnalysisService,
  ): Promise<ToolResult> {
    const outline = await astService.getFileOutline(this.params.file_path!);
    if (!outline) {
      return {
        llmContent: `Could not outline "${this.params.file_path}". File may not exist or its language is not supported.`,
        returnDisplay: 'Outline failed',
      };
    }

    const result = formatOutlineResult(outline);
    return {
      llmContent: result,
      returnDisplay: `${outline.symbols.length} symbols`,
      display: {
        name: AST_SEARCH_DISPLAY_NAME,
        description: this.getDescription(),
        resultSummary: `${outline.symbols.length} symbols`,
        result: { type: 'text', text: result },
      },
    };
  }

  private async handleMapScope(
    astService: ASTAnalysisService,
  ): Promise<ToolResult> {
    const map = await astService.getCodebaseMap(this.params.file_path);
    return {
      llmContent: map,
      returnDisplay: 'Codebase map generated',
      display: {
        name: AST_SEARCH_DISPLAY_NAME,
        description: this.getDescription(),
        result: { type: 'text', text: map.slice(0, 500) + '...' },
      },
    };
  }
}

function formatOutlineResult(outline: ASTFileOutline): string {
  const lines: string[] = [];
  lines.push(
    `File: ${outline.filePath} (${outline.language}, ${outline.totalLines} lines)`,
  );
  lines.push(`Symbols: ${outline.symbols.length} top-level declarations`);
  lines.push('');

  for (const sym of outline.symbols) {
    lines.push(
      `  ${sym.kind} ${sym.name} [L${sym.startLine}-${sym.endLine}]: ${sym.signature}`,
    );
    for (const child of sym.children) {
      lines.push(
        `    ${child.kind} ${child.name} [L${child.startLine}-${child.endLine}]: ${child.signature}`,
      );
    }
  }

  return lines.join('\n');
}

export class ASTSearchTool extends BaseDeclarativeTool<
  ASTSearchToolParams,
  ToolResult
> {
  static readonly Name = AST_SEARCH_TOOL_NAME;

  constructor(
    private config: Config,
    messageBus: MessageBus,
  ) {
    super(
      ASTSearchTool.Name,
      AST_SEARCH_DISPLAY_NAME,
      AST_SEARCH_DEFINITION.base.description!,
      Kind.Search,
      AST_SEARCH_DEFINITION.base.parametersJsonSchema,
      messageBus,
      true,
      false,
    );
  }

  protected createInvocation(
    params: ASTSearchToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<ASTSearchToolParams, ToolResult> {
    return new ASTSearchInvocation(
      this.config,
      params,
      messageBus,
      _toolName,
      _toolDisplayName,
    );
  }

  override getSchema(modelId?: string) {
    return resolveToolDeclaration(AST_SEARCH_DEFINITION, modelId);
  }
}
