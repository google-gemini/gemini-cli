/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, ToolResult } from './tools.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { getErrorMessage } from '../utils/errors.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import fg from 'fast-glob';

/**
 * Parameters for the ReadManyFilesTool.
 */
export interface ReadManyFilesParams {
  /**
   * An array of file paths or directory paths to search within.
   * Paths are relative to the tool's configured target directory.
   * Glob patterns can be used directly in these paths.
   */
  paths: string[];

  /**
   * Optional. Glob patterns for files to include.
   * These are effectively combined with the `paths`.
   * Example: ["*.ts", "src/** /*.md"]
   */
  include?: string[];

  /**
   * Optional. Glob patterns for files/directories to exclude.
   * Applied as ignore patterns.
   * Example: ["*.log", "dist/**"]
   */
  exclude?: string[];

  /**
   * Optional. Search directories recursively.
   * This is generally controlled by glob patterns (e.g., `**`).
   * The glob implementation is recursive by default for `**`.
   * For simplicity, we'll rely on `**` for recursion.
   */
  recursive?: boolean;

  /**
   * Optional. Apply default exclusion patterns. Defaults to true.
   */
  useDefaultExcludes?: boolean;
}

/**
 * Default exclusion patterns for commonly ignored directories and binary file types.
 * These are compatible with glob ignore patterns.
 * TODO(adh): Consider making this configurable or extendable through a command line arguement.
 * TODO(adh): Look into sharing this list with the glob tool.
 */
const DEFAULT_EXCLUDES: string[] = [
  '**/node_modules/**',
  '**/.git/**',
  '**/.vscode/**',
  '**/.idea/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/__pycache__/**',
  '**/*.pyc',
  '**/*.pyo',
  '**/*.bin',
  '**/*.exe',
  '**/*.dll',
  '**/*.so',
  '**/*.dylib',
  '**/*.class',
  '**/*.jar',
  '**/*.war',
  '**/*.zip',
  '**/*.tar',
  '**/*.gz',
  '**/*.bz2',
  '**/*.rar',
  '**/*.7z',
  '**/*.png',
  '**/*.jpg',
  '**/*.jpeg',
  '**/*.gif',
  '**/*.bmp',
  '**/*.tiff',
  '**/*.ico',
  '**/*.pdf',
  '**/*.doc',
  '**/*.docx',
  '**/*.xls',
  '**/*.xlsx',
  '**/*.ppt',
  '**/*.pptx',
  '**/*.odt',
  '**/*.ods',
  '**/*.odp',
  '**/*.DS_Store',
  '**/.env',
];

// Default values for encoding and separator format
const DEFAULT_ENCODING: BufferEncoding = 'utf-8';
const DEFAULT_OUTPUT_SEPARATOR_FORMAT = '--- {filePath} ---';

/**
 * Tool implementation for finding and reading multiple text files from the local filesystem
 * within a specified target directory. The content is concatenated.
 * It is intended to run in an environment with access to the local file system (e.g., a Node.js backend).
 */
export class ReadManyFilesTool extends BaseTool<
  ReadManyFilesParams,
  ToolResult
> {
  static readonly Name: string = 'read_many_files';

  /**
   * Creates an instance of ReadManyFilesTool.
   * @param targetDir The absolute root directory within which this tool is allowed to operate.
   * All paths provided in `params` will be resolved relative to this directory.
   */
  constructor(readonly targetDir: string) {
    const parameterSchema: Record<string, unknown> = {
      type: 'object',
      properties: {
        paths: {
          type: 'array',
          items: { type: 'string' },
          description:
            "Required. An array of glob patterns or paths relative to the tool's target directory. Examples: ['src/**/*.ts'], ['README.md', 'docs/']",
        },
        include: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional. Additional glob patterns to include. These are merged with `paths`. Example: ["*.test.ts"] to specifically add test files if they were broadly excluded.',
          default: [],
        },
        exclude: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional. Glob patterns for files/directories to exclude. Added to default excludes if useDefaultExcludes is true. Example: ["**/*.log", "temp/"]',
          default: [],
        },
        recursive: {
          type: 'boolean',
          description:
            'Optional. Whether to search recursively (primarily controlled by `**` in glob patterns). Defaults to true.',
          default: true,
        },
        useDefaultExcludes: {
          type: 'boolean',
          description:
            'Optional. Whether to apply a list of default exclusion patterns (e.g., node_modules, .git, binary files). Defaults to true.',
          default: true,
        },
      },
      required: ['paths'],
    };

    super(
      ReadManyFilesTool.Name,
      'ReadManyFiles',
      `Reads content from multiple text files specified by paths or glob patterns within a configured target directory and concatenates them into a single string.
This tool is useful when you need to understand or analyze a collection of files, such as:
- Getting an overview of a codebase or parts of it (e.g., all TypeScript files in the 'src' directory).
- Finding where specific functionality is implemented if the user asks broad questions about code.
- Reviewing documentation files (e.g., all Markdown files in the 'docs' directory).
- Gathering context from multiple configuration files.
- When the user asks to "read all files in X directory" or "show me the content of all Y files".

Use this tool when the user's query implies needing the content of several files simultaneously for context, analysis, or summarization.
It uses default UTF-8 encoding and a '--- {filePath} ---' separator between file contents.
Ensure paths are relative to the target directory. Glob patterns like 'src/**/*.js' are supported.
Avoid using for single files if a more specific single-file reading tool is available, unless the user specifically requests to process a list containing just one file via this tool.
This tool should NOT be used for binary files; it attempts to skip them.
Default excludes apply to common non-text files and large dependency directories unless 'useDefaultExcludes' is false.`,
      parameterSchema,
    );
    this.targetDir = path.resolve(targetDir);
  }

  validateParams(params: ReadManyFilesParams): string | null {
    if (
      this.schema.parameters &&
      !SchemaValidator.validate(
        this.schema.parameters as Record<string, unknown>,
        params,
      )
    ) {
      if (
        !params.paths ||
        !Array.isArray(params.paths) ||
        params.paths.length === 0
      ) {
        return 'The "paths" parameter is required and must be a non-empty array of strings/glob patterns.';
      }
      return 'Parameters failed schema validation. Ensure "paths" is a non-empty array and other parameters match their expected types.';
    }
    for (const p of params.paths) {
      if (typeof p !== 'string' || p.trim() === '') {
        return 'Each item in "paths" must be a non-empty string/glob pattern.';
      }
    }
    if (
      params.include &&
      (!Array.isArray(params.include) ||
        !params.include.every((item) => typeof item === 'string'))
    ) {
      return 'If provided, "include" must be an array of strings/glob patterns.';
    }
    if (
      params.exclude &&
      (!Array.isArray(params.exclude) ||
        !params.exclude.every((item) => typeof item === 'string'))
    ) {
      return 'If provided, "exclude" must be an array of strings/glob patterns.';
    }
    return null;
  }

  getDescription(params: ReadManyFilesParams): string {
    const allPatterns = [...params.paths, ...(params.include || [])];
    const pathDesc = `using patterns: \`${allPatterns.join('`, `')}\` (within target directory: \`${this.targetDir}\`)`;

    let effectiveExcludes =
      params.useDefaultExcludes !== false ? [...DEFAULT_EXCLUDES] : [];
    if (params.exclude && params.exclude.length > 0) {
      effectiveExcludes = [...effectiveExcludes, ...params.exclude];
    }
    const excludeDesc = `Excluding: ${effectiveExcludes.length > 0 ? `patterns like \`${effectiveExcludes.slice(0, 2).join('`, `')}${effectiveExcludes.length > 2 ? '...`' : '`'}` : 'none explicitly (beyond default non-text file avoidance).'}`;

    return `Will attempt to read and concatenate files ${pathDesc}. ${excludeDesc}. File encoding: ${DEFAULT_ENCODING}. Separator: "${DEFAULT_OUTPUT_SEPARATOR_FORMAT.replace('{filePath}', 'path/to/file.ext')}".`;
  }

  async execute(
    params: ReadManyFilesParams,
    _signal: AbortSignal,
  ): Promise<ToolResult> {
    const validationError = this.validateParams(params);
    if (validationError) {
      return {
        llmContent: `Error: Invalid parameters for ${this.displayName}. Reason: ${validationError}`,
        returnDisplay: `## Parameter Error\n\n${validationError}`,
      };
    }

    const {
      paths: inputPatterns,
      include = [],
      exclude = [],
      useDefaultExcludes = true,
    } = params;

    const toolBaseDir = this.targetDir;

    const filesToConsider = new Set<string>();
    const skippedFiles: Array<{ path: string; reason: string }> = [];
    const processedFilesRelativePaths: string[] = [];
    let concatenatedContent = '';

    const effectiveExcludes = useDefaultExcludes
      ? [...DEFAULT_EXCLUDES, ...exclude]
      : [...exclude];

    const searchPatterns = [...inputPatterns, ...include];
    if (searchPatterns.length === 0) {
      return {
        llmContent: 'No search paths or include patterns provided.',
        returnDisplay: `## Information\n\nNo search paths or include patterns were specified. Nothing to read or concatenate.`,
      };
    }

    try {
      // Using fast-glob (fg) for file searching based on patterns.
      // The `cwd` option scopes the search to the toolBaseDir.
      // `ignore` handles exclusions.
      // `onlyFiles` ensures only files are returned.
      // `dot` allows matching dotfiles (which can still be excluded by patterns).
      // `absolute` returns absolute paths for consistent handling.
      const entries = await fg(searchPatterns, {
        cwd: toolBaseDir,
        ignore: effectiveExcludes,
        onlyFiles: true,
        dot: true,
        absolute: true,
        caseSensitiveMatch: false,
      });

      for (const absoluteFilePath of entries) {
        // Security check: ensure the glob library didn't return something outside targetDir.
        // This should be guaranteed by `cwd` and the library's sandboxing, but an extra check is good practice.
        if (!absoluteFilePath.startsWith(toolBaseDir)) {
          skippedFiles.push({
            path: absoluteFilePath,
            reason: `Security: Glob library returned path outside target directory. Base: ${toolBaseDir}, Path: ${absoluteFilePath}`,
          });
          continue;
        }
        filesToConsider.add(absoluteFilePath);
      }
    } catch (error) {
      return {
        llmContent: `Error during file search: ${getErrorMessage(error)}`,
        returnDisplay: `## File Search Error\n\nAn error occurred while searching for files:\n\`\`\`\n${getErrorMessage(error)}\n\`\`\``,
      };
    }

    const sortedFiles = Array.from(filesToConsider).sort();

    for (const filePath of sortedFiles) {
      const relativePathForDisplay = path
        .relative(toolBaseDir, filePath)
        .replace(/\\/g, '/');
      try {
        const contentBuffer = await fs.readFile(filePath);
        // Basic binary detection: check for null bytes in the first 1KB
        const sample = contentBuffer.subarray(
          0,
          Math.min(contentBuffer.length, 1024),
        );
        if (sample.includes(0)) {
          skippedFiles.push({
            path: relativePathForDisplay,
            reason: 'Skipped (appears to be binary)',
          });
          continue;
        }
        // Using default encoding
        const fileContent = contentBuffer.toString(DEFAULT_ENCODING);
        // Using default separator format
        const separator = DEFAULT_OUTPUT_SEPARATOR_FORMAT.replace(
          '{filePath}',
          relativePathForDisplay,
        );
        concatenatedContent += `${separator}\n\n${fileContent}\n\n`;
        processedFilesRelativePaths.push(relativePathForDisplay);
      } catch (error) {
        skippedFiles.push({
          path: relativePathForDisplay,
          reason: `Read error: ${getErrorMessage(error)}`,
        });
      }
    }

    let displayMessage = `### ReadManyFiles Result (Target Dir: \`${this.targetDir}\`)\n\n`;
    if (processedFilesRelativePaths.length > 0) {
      displayMessage += `Successfully read and concatenated content from **${processedFilesRelativePaths.length} file(s)**.\n`;
      displayMessage += `\n**Processed Files (up to 10 shown):**\n`;
      processedFilesRelativePaths
        .slice(0, 10)
        .forEach((p) => (displayMessage += `- \`${p}\`\n`));
      if (processedFilesRelativePaths.length > 10) {
        displayMessage += `- ...and ${processedFilesRelativePaths.length - 10} more.\n`;
      }
    } else {
      displayMessage += `No files were read and concatenated based on the criteria.\n`;
    }

    if (skippedFiles.length > 0) {
      displayMessage += `\n**Skipped ${skippedFiles.length} item(s) (up to 5 shown):**\n`;
      skippedFiles
        .slice(0, 5)
        .forEach(
          (f) => (displayMessage += `- \`${f.path}\` (Reason: ${f.reason})\n`),
        );
      if (skippedFiles.length > 5) {
        displayMessage += `- ...and ${skippedFiles.length - 5} more.\n`;
      }
    }
    if (
      concatenatedContent.length === 0 &&
      processedFilesRelativePaths.length === 0
    ) {
      concatenatedContent =
        'No files matching the criteria were found or all were skipped.';
    }

    return {
      llmContent: concatenatedContent,
      returnDisplay: displayMessage,
    };
  }
}
