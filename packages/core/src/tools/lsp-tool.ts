/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolInvocation,
  type ToolResult,
} from './tools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { Config } from '../config/config.js';
import { LspServerManager } from '../lsp/LspServerManager.js';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  LSP_TOOL_NAME,
  LSP_PARAM_OPERATION,
  LSP_PARAM_FILE_PATH,
  LSP_PARAM_LINE,
  LSP_PARAM_CHARACTER,
} from './definitions/base-declarations.js';
import { LSP_DEFINITION } from './definitions/coreTools.js';
import { resolveToolDeclaration } from './definitions/resolver.js';

let globalLspManager: LspServerManager | null = null;

/**
 * Maps common file extensions to standard LSP language identifiers.
 */
const LANGUAGE_ID_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescriptreact',
  '.js': 'javascript',
  '.jsx': 'javascriptreact',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.pyi': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.c': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.h': 'cpp',
  '.sh': 'shellscript',
  '.bash': 'shellscript',
  '.rb': 'ruby',
  '.java': 'java',
  '.lua': 'lua',
  '.php': 'php',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.astro': 'astro',
  '.cs': 'csharp',
  '.clj': 'clojure',
  '.dart': 'dart',
  '.ex': 'elixir',
  '.fs': 'fsharp',
  '.gleam': 'gleam',
  '.hs': 'haskell',
  '.jl': 'julia',
  '.kt': 'kotlin',
  '.nix': 'nix',
  '.ml': 'ocaml',
  '.prisma': 'prisma',
  '.svelte': 'svelte',
  '.swift': 'swift',
  '.tf': 'terraform',
  '.typ': 'typst',
  '.vue': 'vue',
  '.zig': 'zig',
};

/**
 * Resolves the standard LSP language identifier for a given file path.
 */
function getLanguageId(absolutePath: string): string {
  const ext = path.extname(absolutePath).toLowerCase();
  return LANGUAGE_ID_MAP[ext] || ext.substring(1) || 'plaintext';
}

/**
 * Shuts down all active language server processes.
 * Should be called during CLI cleanup to prevent zombie processes.
 */
export async function shutdownLspServers(): Promise<void> {
  if (globalLspManager) {
    await globalLspManager.shutdownAll();
    globalLspManager = null;
  }
}

/**
 * The declarative schema parameters for the LSP tool.
 * Represents the structured input passed from the LLM to the LSP logic.
 */
export interface LspToolParams {
  /**
   * The operation to perform on the target file.
   */
  [LSP_PARAM_OPERATION]:
    | 'definition'
    | 'references'
    | 'hover'
    | 'documentSymbols';
  /**
   * The relative path to the target file.
   */
  [LSP_PARAM_FILE_PATH]: string;
  /**
   * Optional 0-based line coordinate required for targeted queries like hover, definition, and references.
   */
  [LSP_PARAM_LINE]?: number;
  /**
   * Optional 0-based character coordinate required for targeted queries.
   */
  [LSP_PARAM_CHARACTER]?: number;
}

class LspToolInvocation extends BaseToolInvocation<LspToolParams, ToolResult> {
  constructor(
    private readonly config: Config,
    params: LspToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  override getDescription(): string {
    return JSON.stringify(this.params);
  }

  /**
   * Executes the requested LSP operation.
   * 1. Instantiates the global LspServerManager if null.
   * 2. Validates path access to ensure security policies are respected.
   * 3. Simulates opening the file with a 'textDocument/didOpen' notification.
   * 4. Uses a switch statement to route the query to the correct standard LSP method.
   * 5. Formats the JSON response and returns it to the LLM.
   */
  override async execute(_signal: AbortSignal): Promise<ToolResult> {
    if (!globalLspManager) {
      globalLspManager = new LspServerManager(this.config.getTargetDir());
    }

    const operation = this.params[LSP_PARAM_OPERATION];
    const file_path = this.params[LSP_PARAM_FILE_PATH];
    const line = this.params[LSP_PARAM_LINE];
    const character = this.params[LSP_PARAM_CHARACTER];

    // Resolve absolute path
    const absolutePath = path.resolve(this.config.getTargetDir(), file_path);

    // Validate path access
    const validationError = this.config.validatePathAccess(
      absolutePath,
      'read',
    );
    if (validationError) {
      return {
        llmContent: `Error: ${validationError}`,
        returnDisplay: `[LSP Error] ${validationError}`,
      };
    }

    if (!fs.existsSync(absolutePath)) {
      return {
        llmContent: `Error: File not found at ${absolutePath}`,
        returnDisplay: `[LSP Error] File not found: ${file_path}`,
      };
    }

    try {
      const client = await globalLspManager.getClientForFile(absolutePath);
      const uri = pathToFileURL(absolutePath).href;

      // Notify the server about the open document if not already open
      // We can just simulate opening it
      const content = fs.readFileSync(absolutePath, 'utf-8');
      client.sendNotification('textDocument/didOpen', {
        textDocument: {
          uri,
          languageId: getLanguageId(absolutePath),
          version: 1,
          text: content,
        },
      });

      let result: unknown;
      let outputText = '';

      switch (operation) {
        case 'definition':
          if (line === undefined || character === undefined)
            throw new Error('Line and character required for definition');
          result = await client.sendRequest('textDocument/definition', {
            textDocument: { uri },
            position: { line, character },
          });
          outputText = JSON.stringify(result, null, 2);
          break;
        case 'references':
          if (line === undefined || character === undefined)
            throw new Error('Line and character required for references');
          result = await client.sendRequest('textDocument/references', {
            textDocument: { uri },
            position: { line, character },
            context: { includeDeclaration: true },
          });
          outputText = JSON.stringify(result, null, 2);
          break;
        case 'hover':
          if (line === undefined || character === undefined)
            throw new Error('Line and character required for hover');
          result = await client.sendRequest('textDocument/hover', {
            textDocument: { uri },
            position: { line, character },
          });
          outputText = JSON.stringify(result, null, 2);
          break;
        case 'documentSymbols':
          result = await client.sendRequest('textDocument/documentSymbol', {
            textDocument: { uri },
          });
          outputText = JSON.stringify(result, null, 2);
          break;
        default:
          throw new Error(`Unsupported operation: ${operation}`);
      }

      return {
        llmContent: outputText || 'No results found.',
        returnDisplay: `[LSP ${operation}] Request successful.`,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        llmContent: `LSP Error: ${message}`,
        returnDisplay: `[LSP Failed] ${message}`,
      };
    }
  }
}

/**
 * The bridge between the Gemini LLM interface and the LSP core logic.
 * Exposes the declarative schema to the model and delegates to LspToolInvocation for execution.
 */
export class LspTool extends BaseDeclarativeTool<LspToolParams, ToolResult> {
  static readonly Name = LSP_TOOL_NAME;
  static readonly DisplayName = 'LSP Query';

  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    const declaration = resolveToolDeclaration(
      LSP_DEFINITION,
      config.getModel(),
    );
    super(
      LspTool.Name,
      LspTool.DisplayName,
      declaration.description ?? '',
      Kind.Other,
      declaration.parametersJsonSchema,
      messageBus,
      true, // isOutputMarkdown
      false, // canUpdateOutput
    );
  }

  protected override createInvocation(
    params: LspToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _displayName?: string,
  ): ToolInvocation<LspToolParams, ToolResult> {
    return new LspToolInvocation(
      this.config,
      params,
      messageBus,
      _toolName ?? this.name,
      _displayName ?? this.displayName,
    );
  }
}
