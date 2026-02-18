/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { ToolInvocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import { getErrorMessage } from '../utils/errors.js';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import { glob, escape } from 'glob';
import type { ProcessedFileReadResult } from '../utils/fileUtils.js';
import {
  detectFileType,
  processSingleFileContent,
  DEFAULT_ENCODING,
  getSpecificMimeType,
} from '../utils/fileUtils.js';
import type { PartListUnion } from '@google/genai';
import {
  type Config,
  DEFAULT_FILE_FILTERING_OPTIONS,
} from '../config/config.js';
import { FileOperation } from '../telemetry/metrics.js';
import { getProgrammingLanguage } from '../telemetry/telemetry-utils.js';
import { logFileOperation } from '../telemetry/loggers.js';
import { FileOperationEvent } from '../telemetry/types.js';
import { ToolErrorType } from './tool-error.js';
import { READ_MANY_FILES_TOOL_NAME } from './tool-names.js';
import { READ_MANY_FILES_DEFINITION } from './definitions/coreTools.js';
import { resolveToolDeclaration } from './definitions/resolver.js';

import { REFERENCE_CONTENT_END } from '../utils/constants.js';

/**
 * Parameters for the ReadManyFilesTool.
 */
export interface ReadManyFilesParams {
  /**
   * Glob patterns for files to include.
   * Example: ["*.ts", "src/** /*.md"]
   */
  include: string[];

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

  /**
   * Whether to respect .gitignore and .geminiignore patterns (optional, defaults to true)
   */
  file_filtering_options?: {
    respect_git_ignore?: boolean;
    respect_gemini_ignore?: boolean;
  };
}

/**
 * Result type for file processing operations
 */
type FileProcessingResult =
  | {
      success: true;
      filePath: string;
      relativePathForDisplay: string;
      fileReadResult: ProcessedFileReadResult;
      reason?: undefined;
    }
  | {
      success: false;
      filePath: string;
      relativePathForDisplay: string;
      fileReadResult?: undefined;
      reason: string;
    };

/**
 * Creates the default exclusion patterns including dynamic patterns.
 * This combines the shared patterns with dynamic patterns like GEMINI.md.
 * TODO(adh): Consider making this configurable or extendable through a command line argument.
 */
function getDefaultExcludes(config?: Config): string[] {
  return config?.getFileExclusions().getReadManyFilesExcludes() ?? [];
}

const DEFAULT_OUTPUT_SEPARATOR_FORMAT = '--- {filePath} ---';
const DEFAULT_OUTPUT_TERMINATOR = `\n${REFERENCE_CONTENT_END}`;

class ReadManyFilesToolInvocation extends BaseToolInvocation<
  ReadManyFilesParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: ReadManyFilesParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  getDescription(): string {
    const pathDesc = `using patterns: 
${this.params.include.join('`, `')}
 (within target directory: 
${this.config.getTargetDir()}
) `;

    // Determine the final list of exclusion patterns exactly as in execute method
    const paramExcludes = this.params.exclude || [];
    const paramUseDefaultExcludes = this.params.useDefaultExcludes !== false;
    const finalExclusionPatternsForDescription: string[] =
      paramUseDefaultExcludes
        ? [...getDefaultExcludes(this.config), ...paramExcludes]
        : [...paramExcludes];

    const excludeDesc = `Excluding: ${
      finalExclusionPatternsForDescription.length > 0
        ? `patterns like 
${finalExclusionPatternsForDescription
  .slice(0, 2)
  .join(
    '`, `',
  )}${finalExclusionPatternsForDescription.length > 2 ? '...`' : '`'}`
        : 'none specified'
    }`;

    return `Will attempt to read and concatenate files ${pathDesc}. ${excludeDesc}. File encoding: ${DEFAULT_ENCODING}. Separator: "${DEFAULT_OUTPUT_SEPARATOR_FORMAT.replace(
      '{filePath}',
      'path/to/file.ext',
    )}".`;
  }

  async execute(signal: AbortSignal): Promise<ToolResult> {
    const { include, exclude = [], useDefaultExcludes = true } = this.params;

    const filesToConsider = new Set<string>();
    const skippedFiles: Array<{ path: string; reason: string }> = [];
    const processedFilesRelativePaths: string[] = [];
    const contentParts: PartListUnion = [];

    const effectiveExcludes = useDefaultExcludes
      ? [...getDefaultExcludes(this.config), ...exclude]
      : [...exclude];

    try {
      const allEntries = new Set<string>();
      const workspaceDirs = this.config.getWorkspaceContext().getDirectories();

      for (const dir of workspaceDirs) {
        const processedPatterns = [];
        for (const p of include) {
          const normalizedP = p.replace(/\\/g, '/');
          const fullPath = path.join(dir, normalizedP);
          let exists = false;
          try {
            await fsPromises.access(fullPath);
            exists = true;
          } catch {
            exists = false;
          }

          if (exists) {
            processedPatterns.push(escape(normalizedP));
          } else {
            // The path does not exist or is not a file, so we treat it as a glob pattern.
            processedPatterns.push(normalizedP);
          }
        }

        const entriesInDir = await glob(processedPatterns, {
          cwd: dir,
          ignore: effectiveExcludes,
          nodir: true,
          dot: true,
          absolute: true,
          nocase: true,
          signal,
        });
        for (const entry of entriesInDir) {
          allEntries.add(entry);
        }
      }
      const relativeEntries = Array.from(allEntries).map((p) =>
        path.relative(this.config.getTargetDir(), p),
      );

      const fileDiscovery = this.config.getFileService();

      const { filteredPaths, ignoredCount } =
        fileDiscovery.filterFilesWithReport(relativeEntries, {
          respectGitIgnore:
            this.params.file_filtering_options?.respect_git_ignore ??
            this.config.getFileFilteringOptions().respectGitIgnore ??
            DEFAULT_FILE_FILTERING_OPTIONS.respectGitIgnore,
          respectGeminiIgnore:
            this.params.file_filtering_options?.respect_gemini_ignore ??
            this.config.getFileFilteringOptions().respectGeminiIgnore ??
            DEFAULT_FILE_FILTERING_OPTIONS.respectGeminiIgnore,
        });

      for (const relativePath of filteredPaths) {
        // Security check: ensure the glob library didn't return something outside the workspace.

        const fullPath = path.resolve(this.config.getTargetDir(), relativePath);

        const validationError = this.config.validatePathAccess(
          fullPath,
          'read',
        );
        if (validationError) {
          skippedFiles.push({
            path: fullPath,
            reason: 'Security: Path not in workspace',
          });
          continue;
        }
        filesToConsider.add(fullPath);
      }

      // Add info about ignored files if any were filtered
      if (ignoredCount > 0) {
        skippedFiles.push({
          path: `${ignoredCount} file(s)`,
          reason: 'ignored by project ignore files',
        });
      }
    } catch (error) {
      const errorMessage = `Error during file search: ${getErrorMessage(error)}`;
      return {
        llmContent: errorMessage,
        returnDisplay: `## File Search Error\n\nAn error occurred while searching for files:\n\`\`\`\n${getErrorMessage(error)}\n\`\`\``,
        error: {
          message: errorMessage,
          type: ToolErrorType.READ_MANY_FILES_SEARCH_ERROR,
        },
      };
    }

    const sortedFiles = Array.from(filesToConsider).sort();

    const fileProcessingPromises = sortedFiles.map(
      async (filePath): Promise<FileProcessingResult> => {
        try {
          const relativePathForDisplay = path
            .relative(this.config.getTargetDir(), filePath)
            .replace(/\\/g, '/');

          const fileType = await detectFileType(filePath);

          if (
            fileType === 'image' ||
            fileType === 'pdf' ||
            fileType === 'audio'
          ) {
            const fileExtension = path.extname(filePath).toLowerCase();
            const fileNameWithoutExtension = path.basename(
              filePath,
              fileExtension,
            );
            const requestedExplicitly = include.some(
              (pattern: string) =>
                pattern.toLowerCase().includes(fileExtension) ||
                pattern.includes(fileNameWithoutExtension),
            );

            if (!requestedExplicitly) {
              return {
                success: false,
                filePath,
                relativePathForDisplay,
                reason:
                  'asset file (image/pdf/audio) was not explicitly requested by name or extension',
              };
            }
          }

          // Use processSingleFileContent for all file types now
          const fileReadResult = await processSingleFileContent(
            filePath,
            this.config.getTargetDir(),
            this.config.getFileSystemService(),
          );

          if (fileReadResult.error) {
            return {
              success: false,
              filePath,
              relativePathForDisplay,
              reason: `Read error: ${fileReadResult.error}`,
            };
          }

          return {
            success: true,
            filePath,
            relativePathForDisplay,
            fileReadResult,
          };
        } catch (error) {
          const relativePathForDisplay = path
            .relative(this.config.getTargetDir(), filePath)
            .replace(/\\/g, '/');

          return {
            success: false,
            filePath,
            relativePathForDisplay,
            reason: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    );

    const results = await Promise.allSettled(fileProcessingPromises);

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const fileResult = result.value;

        if (!fileResult.success) {
          // Handle skipped files (images/PDFs not requested or read errors)
          skippedFiles.push({
            path: fileResult.relativePathForDisplay,
            reason: fileResult.reason,
          });
        } else {
          // Handle successfully processed files
          const { filePath, relativePathForDisplay, fileReadResult } =
            fileResult;

          if (typeof fileReadResult.llmContent === 'string') {
            const separator = DEFAULT_OUTPUT_SEPARATOR_FORMAT.replace(
              '{filePath}',
              filePath,
            );
            let fileContentForLlm = '';
            if (fileReadResult.isTruncated) {
              fileContentForLlm += `[WARNING: This file was truncated. To view the full content, use the 'read_file' tool on this specific file.]\n\n`;
            }
            fileContentForLlm += fileReadResult.llmContent;
            contentParts.push(`${separator}\n\n${fileContentForLlm}\n\n`);
          } else {
            // This is a Part for image/pdf, which we don't add the separator to.
            contentParts.push(fileReadResult.llmContent);
          }

          processedFilesRelativePaths.push(relativePathForDisplay);

          const lines =
            typeof fileReadResult.llmContent === 'string'
              ? fileReadResult.llmContent.split('\n').length
              : undefined;
          const mimetype = getSpecificMimeType(filePath);
          const programming_language = getProgrammingLanguage({
            file_path: filePath,
          });
          logFileOperation(
            this.config,
            new FileOperationEvent(
              READ_MANY_FILES_TOOL_NAME,
              FileOperation.READ,
              lines,
              mimetype,
              path.extname(filePath),
              programming_language,
            ),
          );
        }
      } else {
        // Handle Promise rejection (unexpected errors)
        skippedFiles.push({
          path: 'unknown',
          reason: `Unexpected error: ${result.reason}`,
        });
      }
    }

    let displayMessage = `### ReadManyFiles Result (Target Dir: \`${this.config.getTargetDir()}\`)\n\n`;
    if (processedFilesRelativePaths.length > 0) {
      displayMessage += `Successfully read and concatenated content from **${processedFilesRelativePaths.length} file(s)**.\n`;
      if (processedFilesRelativePaths.length <= 10) {
        displayMessage += `\n**Processed Files:**\n`;
        processedFilesRelativePaths.forEach(
          (p) => (displayMessage += `- \`${p}\`\n`),
        );
      } else {
        displayMessage += `\n**Processed Files (first 10 shown):**\n`;
        processedFilesRelativePaths
          .slice(0, 10)
          .forEach((p) => (displayMessage += `- \`${p}\`\n`));
        displayMessage += `- ...and ${processedFilesRelativePaths.length - 10} more.\n`;
      }
    }

    if (skippedFiles.length > 0) {
      if (processedFilesRelativePaths.length === 0) {
        displayMessage += `No files were read and concatenated based on the criteria.\n`;
      }
      if (skippedFiles.length <= 5) {
        displayMessage += `\n**Skipped ${skippedFiles.length} item(s):**\n`;
      } else {
        displayMessage += `\n**Skipped ${skippedFiles.length} item(s) (first 5 shown):**\n`;
      }
      skippedFiles
        .slice(0, 5)
        .forEach(
          (f) => (displayMessage += `- \`${f.path}\` (Reason: ${f.reason})\n`),
        );
      if (skippedFiles.length > 5) {
        displayMessage += `- ...and ${skippedFiles.length - 5} more.\n`;
      }
    } else if (
      processedFilesRelativePaths.length === 0 &&
      skippedFiles.length === 0
    ) {
      displayMessage += `No files were read and concatenated based on the criteria.\n`;
    }

    if (contentParts.length > 0) {
      contentParts.push(DEFAULT_OUTPUT_TERMINATOR);
    } else {
      contentParts.push(
        'No files matching the criteria were found or all were skipped.',
      );
    }
    return {
      llmContent: contentParts,
      returnDisplay: displayMessage.trim(),
    };
  }
}

/**
 * Tool implementation for finding and reading multiple text files from the local filesystem
 * within a specified target directory. The content is concatenated.
 * It is intended to run in an environment with access to the local file system (e.g., a Node.js backend).
 */
export class ReadManyFilesTool extends BaseDeclarativeTool<
  ReadManyFilesParams,
  ToolResult
> {
  static readonly Name = READ_MANY_FILES_TOOL_NAME;

  constructor(
    private config: Config,
    messageBus: MessageBus,
  ) {
    super(
      ReadManyFilesTool.Name,
      'ReadManyFiles',
      READ_MANY_FILES_DEFINITION.base.description!,
      Kind.Read,
      READ_MANY_FILES_DEFINITION.base.parametersJsonSchema,
      messageBus,
      true, // isOutputMarkdown
      false, // canUpdateOutput
    );
  }

  protected createInvocation(
    params: ReadManyFilesParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<ReadManyFilesParams, ToolResult> {
    return new ReadManyFilesToolInvocation(
      this.config,
      params,
      messageBus,
      _toolName,
      _toolDisplayName,
    );
  }

  override getSchema(modelId?: string) {
    return resolveToolDeclaration(READ_MANY_FILES_DEFINITION, modelId);
  }
}
