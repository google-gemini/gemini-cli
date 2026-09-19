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
  type ASTSymbol,
} from '../services/astAnalysisService.js';
import { debugLogger } from '../utils/debugLogger.js';
import type { FileDiscoveryService } from '../services/fileDiscoveryService.js';

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

    // Use the centralized, cached FileDiscoveryService from config to avoid
    // re-reading and re-parsing .gitignore/.geminiignore on every tool call.
    const fileFilteringOptions = this.config.getFileFilteringOptions();
    const fileDiscoveryService = this.config.getFileService();
    const shouldIgnore = (filePath: string): boolean =>
      fileDiscoveryService.shouldIgnoreFile(filePath, fileFilteringOptions);

    const astService = new ASTAnalysisService(targetDir, shouldIgnore);

    try {
      // Trim params to prevent whitespace-only values and search mismatches
      const filePath = this.params.file_path?.trim();
      const symbolName = this.params.symbol_name?.trim();

      if (scope === 'map') {
        // For map scope, file_path is optional (subdirectory filter)
        let safeMapPath: string | undefined;
        if (filePath) {
          const sanitized = resolveDefensiveToolPath(filePath, targetDir);
          let resolved: string;
          try {
            resolved = resolveToRealPath(path.resolve(targetDir, sanitized));
          } catch {
            resolved = path.resolve(targetDir, sanitized);
          }
          const err = this.config.validatePathAccess(resolved, 'read');
          if (err) {
            return {
              llmContent: err,
              returnDisplay: 'Path not in workspace.',
              error: {
                message: err,
                type: ToolErrorType.PATH_NOT_IN_WORKSPACE,
              },
            };
          }
          safeMapPath = sanitized;
        }
        return await this.handleMapScope(astService, safeMapPath);
      }

      if (!filePath) {
        return {
          llmContent:
            'Error: file_path is required for "symbol" and "outline" scopes.',
          returnDisplay: 'Missing file_path',
        };
      }

      // Validate path stays within workspace boundaries
      const sanitizedPath = resolveDefensiveToolPath(filePath, targetDir);
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
      if (!symbolName) {
        return {
          llmContent: 'Error: symbol_name is required for "symbol" scope.',
          returnDisplay: 'Missing symbol_name',
        };
      }

      return await this.handleSymbolScope(
        astService,
        sanitizedPath,
        symbolName,
      );
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
    symbolName: string,
  ): Promise<ToolResult> {
    // Single getFileOutline call to avoid reading and parsing the file twice
    // (findSymbolBounds internally calls getFileOutline, so calling both is redundant).
    const outline = await astService.getFileOutline(safePath);

    if (!outline) {
      return {
        llmContent: `Could not search "${safePath}". File may not exist, is ignored, or its language is not supported.`,
        returnDisplay: 'File not parsed',
      };
    }

    const findSymbolRecursive = (
      symbols: ASTSymbol[],
    ): ASTSymbol | undefined => {
      for (const s of symbols) {
        if (s.name === symbolName) return s;
        const found = findSymbolRecursive(s.children);
        if (found) return found;
      }
      return undefined;
    };
    const symbol = findSymbolRecursive(outline.symbols);

    if (!symbol) {
      return {
        llmContent:
          `Symbol "${symbolName}" not found in ${safePath}. ` +
          'Try using grep_search for a text-based search, or check the symbol name spelling.',
        returnDisplay: 'Symbol not found',
      };
    }

    const result = [
      `Found "${symbolName}" in ${safePath}:`,
      `  Lines: ${symbol.startLine}-${symbol.endLine} (${symbol.endLine - symbol.startLine + 1} lines)`,
      `  Kind: ${symbol.kind}`,
      `  Signature: ${symbol.signature}`,
      '',
      `TIP: Use read_file with start_line=${symbol.startLine} and end_line=${symbol.endLine} to read the exact symbol body.`,
    ].join('\n');

    return {
      llmContent: result,
      returnDisplay: `${symbolName}: L${symbol.startLine}-${symbol.endLine}`,
      display: {
        name: AST_SEARCH_DISPLAY_NAME,
        description: this.getDescription(),
        resultSummary: `L${symbol.startLine}-${symbol.endLine}`,
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
    safePath?: string,
  ): Promise<ToolResult> {
    const map = await astService.getCodebaseMap(safePath);
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
  private readonly fileDiscoveryService: FileDiscoveryService;

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
    this.fileDiscoveryService = config.getFileService();
  }

  protected override validateToolParamValues(
    params: ASTSearchToolParams,
  ): string | null {
    const scope = params.scope ?? 'symbol';
    const symbolName = params.symbol_name?.trim();
    const filePath = params.file_path?.trim();

    if (scope === 'symbol' && (!symbolName || symbolName === '')) {
      return "The 'symbol_name' parameter must be non-empty when scope is 'symbol'.";
    }

    if (
      (scope === 'symbol' || scope === 'outline') &&
      (!filePath || filePath === '')
    ) {
      return "The 'file_path' parameter must be non-empty for 'symbol' and 'outline' scopes.";
    }

    if (filePath) {
      const sanitizedPath = resolveDefensiveToolPath(
        filePath,
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

      // Enforce .gitignore / .geminiignore patterns, matching ReadFileTool
      const fileFilteringOptions = this.config.getFileFilteringOptions();
      if (
        this.fileDiscoveryService.shouldIgnoreFile(
          sanitizedPath,
          fileFilteringOptions,
        ) ||
        this.fileDiscoveryService.shouldIgnoreFile(
          resolvedPath,
          fileFilteringOptions,
        )
      ) {
        return `File path '${resolvedPath}' is ignored by configured ignore patterns.`;
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
