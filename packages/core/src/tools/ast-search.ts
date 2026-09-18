/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../confirmation-bus/message-bus.js';
import path from 'node:path';
import { resolveDefensiveToolPath, resolveToRealPath } from '../utils/paths.js';
import { ToolErrorType } from './tool-error.js';
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
    const targetDir = this.config.getTargetDir();
    const astService = new ASTAnalysisService(targetDir);

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

      // Validate path stays within workspace boundaries
      const sanitizedPath = resolveDefensiveToolPath(
        this.params.file_path,
        targetDir,
      );
      let resolvedPath: string;
      try {
        resolvedPath = resolveToRealPath(
          path.resolve(targetDir, sanitizedPath),
        );
      } catch {
        resolvedPath = path.resolve(targetDir, sanitizedPath);
      }

      const validationError = this.config.validatePathAccess(
        resolvedPath,
        'read',
      );
      if (validationError) {
        return {
          llmContent: validationError,
          returnDisplay: 'Path not in workspace.',
          error: {
            message: validationError,
            type: ToolErrorType.PATH_NOT_IN_WORKSPACE,
          },
        };
      }

      if (scope === 'outline') {
        return await this.handleOutlineScope(astService, sanitizedPath);
      }

      // Default: symbol scope
      if (!this.params.symbol_name) {
        return {
          llmContent: 'Error: symbol_name is required for "symbol" scope.',
          returnDisplay: 'Missing symbol_name',
        };
      }

      return await this.handleSymbolScope(astService, sanitizedPath);
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
    safePath: string,
  ): Promise<ToolResult> {
    const bounds = await astService.findSymbolBounds(
      safePath,
      this.params.symbol_name!,
    );

    if (!bounds) {
      return {
        llmContent:
          `Symbol "${this.params.symbol_name}" not found in ${safePath}. ` +
          'Try using grep_search for a text-based search, or check the symbol name spelling.',
        returnDisplay: 'Symbol not found',
      };
    }

    const outline = await astService.getFileOutline(safePath);
    const symbol = outline?.symbols
      .flatMap((s) => [s, ...s.children])
      .find((s) => s.name === this.params.symbol_name);

    const result = [
      `Found "${this.params.symbol_name}" in ${safePath}:`,
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
    safePath: string,
  ): Promise<ToolResult> {
    const outline = await astService.getFileOutline(safePath);
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

  protected override validateToolParamValues(
    params: ASTSearchToolParams,
  ): string | null {
    const scope = params.scope ?? 'symbol';

    if (
      scope === 'symbol' &&
      (!params.symbol_name || params.symbol_name.trim() === '')
    ) {
      return "The 'symbol_name' parameter must be non-empty when scope is 'symbol'.";
    }

    if (
      (scope === 'symbol' || scope === 'outline') &&
      (!params.file_path || params.file_path.trim() === '')
    ) {
      return "The 'file_path' parameter must be non-empty for 'symbol' and 'outline' scopes.";
    }

    if (params.file_path) {
      const sanitizedPath = resolveDefensiveToolPath(
        params.file_path,
        this.config.getTargetDir(),
      );
      let resolvedPath: string;
      try {
        resolvedPath = resolveToRealPath(
          path.resolve(this.config.getTargetDir(), sanitizedPath),
        );
      } catch (err) {
        return `Failed to resolve path: ${err instanceof Error ? err.message : String(err)}`;
      }
      const validationError = this.config.validatePathAccess(
        resolvedPath,
        'read',
      );
      if (validationError) {
        return validationError;
      }
    }

    return null;
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
