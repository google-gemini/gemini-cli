/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import Parser from 'tree-sitter';
import Python from 'tree-sitter-python';
import Java from 'tree-sitter-java';
import Go from 'tree-sitter-go';
import CSharp from 'tree-sitter-c-sharp';
import TreeSitterTypeScript from 'tree-sitter-typescript';
import Rust from 'tree-sitter-rust'; // Added
import fs from 'fs/promises';
import path from 'path';
import { BaseTool, ToolResult, ToolCallConfirmationDetails } from './tools.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { makeRelative, shortenPath } from '../utils/paths.js'; // Removed isWithinRoot
import { Config } from '../config/config.js';

type TreeSitterLanguage = Parameters<typeof Parser.prototype.setLanguage>[0];

export interface CodeParserToolParams {
  path: string;
  ignore?: string[];
  languages?: string[];
}

export class CodeParserTool extends BaseTool<CodeParserToolParams, ToolResult> {
  static readonly Name = 'code_parser';

  private parser: Parser;

  constructor(
    private rootDirectory: string,
    private config: Config,
  ) {
    super(
      CodeParserTool.Name,
      'CodeParser',
      'Parses the code in the specified directory path or a single file to generate AST representations. This should be used to get a better understanding of the codebase when refactoring and building out new features.',
      {
        properties: {
          path: {
            type: 'string',
            description:
              'The absolute path to the directory or file to parse (must be absolute, not relative)',
          },
          languages: {
            type: 'array',
            description:
              'Optional: specific languages to parse (e.g., ["python", "java", "go", "csharp", "typescript", "tsx", "javascript", "rust"]). Defaults to supported languages.',
            items: {
              type: 'string',
            },
          },
        },
        required: ['path'],
        type: 'object',
      },
    );
    this.rootDirectory = path.resolve(rootDirectory);
    this.parser = new Parser();
  }

  // Added private isWithinRoot method
  private isWithinRoot(dirpath: string): boolean {
    const normalizedPath = path.normalize(dirpath);
    const normalizedRoot = path.normalize(this.rootDirectory);
    const rootWithSep = normalizedRoot.endsWith(path.sep)
      ? normalizedRoot
      : normalizedRoot + path.sep;
    return (
      normalizedPath === normalizedRoot ||
      normalizedPath.startsWith(rootWithSep)
    );
  }

  private getLanguageParser(language: string): TreeSitterLanguage | undefined {
    switch (language.toLowerCase()) {
      case 'python':
        return Python;
      case 'java':
        return Java;
      case 'go':
        return Go;
      case 'csharp':
        return CSharp;
      case 'typescript':
        return TreeSitterTypeScript.typescript;
      case 'tsx':
        return TreeSitterTypeScript.tsx;
      case 'javascript': // Use TypeScript parser for JS as it handles modern JS well
        return TreeSitterTypeScript.typescript;
      case 'rust': // Added
        return Rust; // Added
      default:
        console.warn(
          `Language '${language}' is not supported by the CodeParserTool.`,
        );
        return undefined;
    }
  }

  validateToolParams(params: CodeParserToolParams): string | null {
    if (
      this.schema.parameters &&
      !SchemaValidator.validate(
        this.schema.parameters as Record<string, unknown>,
        params,
      )
    ) {
      return 'Parameters failed schema validation.';
    }
    if (!path.isAbsolute(params.path)) {
      return `Path must be absolute: ${params.path}`;
    }
    if (!this.isWithinRoot(params.path)) {
      // Use the class method
      return `Path must be within the root directory (${this.rootDirectory}): ${params.path}`;
    }
    if (
      params.languages &&
      (!Array.isArray(params.languages) ||
        !params.languages.every((lang) => typeof lang === 'string'))
    ) {
      return 'Languages parameter must be an array of strings.';
    }
    return null;
  }

  getDescription(params: CodeParserToolParams): string {
    const relativePath = makeRelative(params.path, this.rootDirectory);
    return `Parse ${shortenPath(relativePath)}`;
  }

  private errorResult(llmContent: string, returnDisplay: string): ToolResult {
    return {
      llmContent,
      returnDisplay: `Error: ${returnDisplay}`,
    };
  }

  private async parseFile(
    filePath: string,
    language: string,
    maxFileSize?: number,
  ): Promise<string | null> {
    const langParser = this.getLanguageParser(language);
    if (!langParser) {
      return null;
    }
    this.parser.setLanguage(langParser);

    try {
      const stats = await fs.stat(filePath);
      if (maxFileSize && stats.size > maxFileSize) {
        console.warn(
          `File ${filePath} exceeds maxFileSize (${stats.size} > ${maxFileSize}), skipping.`,
        );
        return null;
      }

      const fileContent = await fs.readFile(filePath, 'utf8');
      const tree = this.parser.parse(fileContent);
      return this.formatTree(tree.rootNode, 0);
    } catch (error) {
      console.error(
        `Error parsing file ${filePath} with language ${language}:`,
        error,
      );
      return null;
    }
  }

  // Helper function to format the AST similar to the Go version
  private formatTree(node: Parser.SyntaxNode, level: number): string {
    let formattedTree = '';
    const indent = '  '.repeat(level);
    const sexp = node.toString(); // tree-sitter's Node.toString() returns S-expression
    const maxLength = 100;

    if (sexp.length < maxLength) {
      // MODIFIED LINE: Removed !sexp.includes('\n')
      formattedTree += `${indent}${sexp}\n`;
      return formattedTree;
    }

    // Expand full format if the S-expression is complex or long
    formattedTree += `${indent}(${node.type}\n`;

    for (const child of node.namedChildren) {
      formattedTree += this.formatTree(child, level + 1);
    }

    // Iterating all children (named and unnamed) to be closer to Go's formatTree.
    // The original Go code iterates `node.NamedChildCount()` and then `node.ChildCount()`
    // which implies it processes named children and then all children (including named again).
    // Here, we iterate named, then iterate all, but skip if already processed as named.
    // This logic might need further refinement if the exact Go output for unnamed nodes is critical.
    // For now, focusing on named children as per the Go code's primary loop in formatTree.
    // If a more exact match for unnamed nodes is needed, the iteration logic for `node.children`
    // and skipping already processed namedChildren would be added here.

    formattedTree += `${indent})\n`;
    return formattedTree;
  }

  private getFileLanguage(filePath: string): string | undefined {
    const extension = path.extname(filePath).toLowerCase();
    switch (extension) {
      case '.py':
        return 'python';
      case '.java':
        return 'java';
      case '.go':
        return 'go';
      case '.cs':
        return 'csharp';
      case '.ts':
        return 'typescript';
      case '.tsx':
        return 'tsx';
      case '.js':
        return 'javascript';
      case '.jsx': // Treat jsx as tsx for parsing
        return 'tsx';
      case '.mjs':
        return 'javascript';
      case '.cjs':
        return 'javascript';
      case '.rs': // Added
        return 'rust'; // Added
      default:
        return undefined;
    }
  }

  async execute(
    params: CodeParserToolParams,
    _signal: AbortSignal,
  ): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return this.errorResult(
        `Error: Invalid parameters provided. Reason: ${validationError}`,
        'Failed to execute tool.',
      );
    }

    const targetPath = params.path;
    let stats;
    try {
      stats = await fs.stat(targetPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return this.errorResult(
          `Error: Path not found or inaccessible: ${targetPath}`,
          'Path not found or inaccessible.',
        );
      }
      return this.errorResult(
        `Error: Cannot access path: ${(error as Error).message}`,
        'Cannot access path.',
      );
    }

    const defaultLanguages = [
      'python',
      'java',
      'go',
      'csharp',
      'typescript',
      'tsx',
      'javascript',
      'rust', // Added
    ];
    const languagesToParse = (
      params.languages && params.languages.length > 0
        ? params.languages
        : defaultLanguages
    ).map((lang) => lang.toLowerCase());
    const maxFileSize = 1024 * 1024; // 1MB

    const supportedLanguagesToParse = languagesToParse.filter((lang) =>
      this.getLanguageParser(lang),
    );
    if (supportedLanguagesToParse.length === 0) {
      const availableLangs =
        defaultLanguages
          .filter((lang) => this.getLanguageParser(lang))
          .join(', ') || 'none configured';
      return this.errorResult(
        `Error: No supported languages specified for parsing. Requested: ${languagesToParse.join(', ') || 'default'}. Available: ${availableLangs}.`,
        'No supported languages to parse.',
      );
    }

    let parsedCodeOutput = '';
    let filesProcessedCount = 0;

    if (stats.isDirectory()) {
      try {
        const files = await fs.readdir(targetPath);
        if (files.length === 0) {
          return {
            llmContent: `Directory ${targetPath} is empty.`,
            returnDisplay: 'Directory is empty.',
          };
        }

        for (const file of files) {
          const filePath = path.join(targetPath, file);
          let fileStats;
          try {
            fileStats = await fs.stat(filePath);
          } catch {
            console.warn(`Could not stat file ${filePath}, skipping.`);
            continue;
          }

          if (fileStats.isFile()) {
            const fileLang = this.getFileLanguage(filePath);
            if (fileLang && supportedLanguagesToParse.includes(fileLang)) {
              const ast = await this.parseFile(filePath, fileLang, maxFileSize);
              if (ast) {
                parsedCodeOutput += `-------------${filePath}-------------\n`;
                parsedCodeOutput += ast + '\n';
                filesProcessedCount++;
              }
            }
          }
        }
      } catch (error) {
        return this.errorResult(
          `Error listing or processing directory ${targetPath}: ${(error as Error).message}`,
          'Failed to process directory.',
        );
      }
    } else if (stats.isFile()) {
      const fileLang = this.getFileLanguage(targetPath);
      if (fileLang && supportedLanguagesToParse.includes(fileLang)) {
        const ast = await this.parseFile(targetPath, fileLang, maxFileSize);
        if (ast) {
          parsedCodeOutput += `-------------${targetPath}-------------\n`;
          parsedCodeOutput += ast + '\n';
          filesProcessedCount++;
        } else {
          return this.errorResult(
            `Error: Could not parse file ${targetPath}. Language '${fileLang}' is supported but parsing failed. Check logs.`,
            'Failed to parse file.',
          );
        }
      } else {
        return this.errorResult(
          `Error: File ${targetPath} is not of a supported language type for parsing or language not specified. Supported: ${supportedLanguagesToParse.join(', ')}. Detected extension for language: ${fileLang || 'unknown'}.`,
          'Unsupported file type or language.',
        );
      }
    } else {
      return this.errorResult(
        `Error: Path is not a file or directory: ${targetPath}`,
        'Path is not a file or directory.',
      );
    }

    if (filesProcessedCount === 0) {
      return {
        llmContent: `No files were parsed in ${targetPath}. Ensure files match supported languages (${supportedLanguagesToParse.join(', ')}), are not empty or too large, and are not ignored.`,
        returnDisplay: 'No files parsed.',
      };
    }

    const returnDisplay = `Parsed ${filesProcessedCount} file(s).`;
    return {
      llmContent: `Parsed code from ${targetPath}:\n${parsedCodeOutput}`,
      returnDisplay,
    };
  }

  async requiresConfirmation(
    _params: CodeParserToolParams,
  ): Promise<ToolCallConfirmationDetails | null> {
    return null;
  }
}
