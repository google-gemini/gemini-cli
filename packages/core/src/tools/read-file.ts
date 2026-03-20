/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../confirmation-bus/message-bus.js';
import path from 'node:path';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { makeRelative, shortenPath } from '../utils/paths.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolInvocation,
  type ToolLocation,
  type ToolResult,
  type PolicyUpdateOptions,
  type ToolConfirmationOutcome,
} from './tools.js';
import { ToolErrorType } from './tool-error.js';
import { buildFilePathArgsPattern } from '../policy/utils.js';

import type { PartListUnion } from '@google/genai';
import {
  processSingleFileContent,
  getSpecificMimeType,
  detectFileType,
  type ProcessedFileReadResult,
} from '../utils/fileUtils.js';
import type { Config } from '../config/config.js';
import { FileOperation } from '../telemetry/metrics.js';
import { getProgrammingLanguage } from '../telemetry/telemetry-utils.js';
import { logFileOperation } from '../telemetry/loggers.js';
import { FileOperationEvent } from '../telemetry/types.js';
import { READ_FILE_TOOL_NAME, READ_FILE_DISPLAY_NAME } from './tool-names.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import { READ_FILE_DEFINITION } from './definitions/coreTools.js';
import { resolveToolDeclaration } from './definitions/resolver.js';
import { MAX_FILE_SIZE_MB } from '../utils/constants.js';
import {
  discoverJitContext,
  appendJitContext,
  appendJitContextToParts,
} from './jit-context.js';

/**
 * Parameters for the ReadFile tool
 */
export interface ReadFileToolParams {
  /**
   * The path to the file to read
   */
  file_path: string;

  /**
   * The line number to start reading from (optional, 1-based)
   */
  start_line?: number;

  /**
   * The line number to end reading at (optional, 1-based, inclusive)
   */
  end_line?: number;

  /**
   * If true, returns the full file contents.
   * If false (default), large files may be summarized for efficiency.
   */
  full?: boolean;
}

class ReadFileToolInvocation extends BaseToolInvocation<
  ReadFileToolParams,
  ToolResult
> {
  private readonly resolvedPath: string;
  constructor(
    private config: Config,
    params: ReadFileToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
    this.resolvedPath = path.resolve(
      this.config.getTargetDir(),
      this.params.file_path,
    );
  }

  getDescription(): string {
    const relativePath = makeRelative(
      this.resolvedPath,
      this.config.getTargetDir(),
    );
    return shortenPath(relativePath);
  }

  override toolLocations(): ToolLocation[] {
    return [
      {
        path: this.resolvedPath,
        line: this.params.start_line,
      },
    ];
  }

  override getPolicyUpdateOptions(
    _outcome: ToolConfirmationOutcome,
  ): PolicyUpdateOptions | undefined {
    return {
      argsPattern: buildFilePathArgsPattern(this.params.file_path),
    };
  }

  async execute(): Promise<ToolResult> {
    const validationError = this.config.validatePathAccess(
      this.resolvedPath,
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

    let result: ProcessedFileReadResult;
    if (!fs.existsSync(this.resolvedPath)) {
      result = await processSingleFileContent(
        this.resolvedPath,
        this.config.getTargetDir(),
        this.config.getFileSystemService(),
        this.params.start_line,
        this.params.end_line,
        this.params.full,
      );
    } else {
      const stats = await fs.promises.stat(this.resolvedPath);
      const fileSizeInMB = stats.size / (1024 * 1024);
      if (fileSizeInMB > MAX_FILE_SIZE_MB) {
        result = await processSingleFileContent(
          this.resolvedPath,
          this.config.getTargetDir(),
          this.config.getFileSystemService(),
          this.params.start_line,
          this.params.end_line,
          this.params.full,
        );
      } else {
        const fileType = await detectFileType(this.resolvedPath);
        const fullReadThreshold = parseInt(
          process.env['GEMINI_CLI_FULL_READ_THRESHOLD'] ?? '4096',
          10,
        );

        const isExplicitLineRange =
          (this.params.start_line !== undefined &&
            this.params.start_line !== 1) ||
          this.params.end_line !== undefined;

        const isDirectReadRequired =
          this.params.full === true ||
          isExplicitLineRange ||
          stats.size < fullReadThreshold ||
          fileType !== 'text';
        if (isDirectReadRequired) {
          result = await processSingleFileContent(
            this.resolvedPath,
            this.config.getTargetDir(),
            this.config.getFileSystemService(),
            this.params.start_line,
            this.params.end_line,
            this.params.full,
          );
        } else {
          try {
            const summary = execSync(
              `npx -y tilth --budget 1000 "${this.resolvedPath}"`,
              {
                encoding: 'utf-8',
                stdio: ['ignore', 'pipe', 'pipe'],
              },
            ).toString();
            result = {
              llmContent: summary,
              returnDisplay: `Summarized large file: ${shortenPath(makeRelative(this.resolvedPath, this.config.getTargetDir()))}`,
            };
          } catch (_error) {
            // Fallback to normal read if tilth fails
            result = await processSingleFileContent(
              this.resolvedPath,
              this.config.getTargetDir(),
              this.config.getFileSystemService(),
              this.params.start_line,
              this.params.end_line,
              this.params.full,
            );
          }
        }
      }
    }

    if (result.error) {
      return {
        llmContent: result.llmContent,
        returnDisplay: result.returnDisplay || 'Error reading file',
        error: {
          message: result.error,
          type: result.errorType,
        },
      };
    }

    let llmContent: PartListUnion;
    if (result.isTruncated) {
      const [start, end] = result.linesShown!;
      const total = result.originalLineCount!;

      llmContent = `
IMPORTANT: The file content has been truncated.
Status: Showing lines ${start}-${end} of ${total} total lines.
Action: To read more of the file, you can use the 'start_line' and 'end_line' parameters in a subsequent 'read_file' call. For example, to read the next section of the file, use start_line: ${end + 1}.

--- FILE CONTENT (truncated) ---
${result.llmContent}`;
    } else {
      llmContent = result.llmContent || '';
    }

    const lines =
      typeof result.llmContent === 'string'
        ? result.llmContent.split('\n').length
        : undefined;
    const mimetype = getSpecificMimeType(this.resolvedPath);
    const programming_language = getProgrammingLanguage({
      file_path: this.resolvedPath,
    });
    logFileOperation(
      this.config,
      new FileOperationEvent(
        READ_FILE_TOOL_NAME,
        FileOperation.READ,
        lines,
        mimetype,
        path.extname(this.resolvedPath),
        programming_language,
      ),
    );

    // Discover JIT subdirectory context for the accessed file path
    const jitContext = await discoverJitContext(this.config, this.resolvedPath);
    if (jitContext) {
      if (typeof llmContent === 'string') {
        llmContent = appendJitContext(llmContent, jitContext);
      } else {
        llmContent = appendJitContextToParts(llmContent, jitContext);
      }
    }

    return {
      llmContent,
      returnDisplay: result.returnDisplay || '',
    };
  }
}

/**
 * Implementation of the ReadFile tool logic
 */
export class ReadFileTool extends BaseDeclarativeTool<
  ReadFileToolParams,
  ToolResult
> {
  static readonly Name = READ_FILE_TOOL_NAME;
  private readonly fileDiscoveryService: FileDiscoveryService;

  constructor(
    private config: Config,
    messageBus: MessageBus,
  ) {
    super(
      ReadFileTool.Name,
      READ_FILE_DISPLAY_NAME,
      READ_FILE_DEFINITION.base.description!,
      Kind.Read,
      READ_FILE_DEFINITION.base.parametersJsonSchema,
      messageBus,
      true,
      false,
    );
    this.fileDiscoveryService = new FileDiscoveryService(
      config.getTargetDir(),
      config.getFileFilteringOptions(),
    );
  }

  protected override validateToolParamValues(
    params: ReadFileToolParams,
  ): string | null {
    if (params.file_path.trim() === '') {
      return "The 'file_path' parameter must be non-empty.";
    }

    const resolvedPath = path.resolve(
      this.config.getTargetDir(),
      params.file_path,
    );

    const validationError = this.config.validatePathAccess(
      resolvedPath,
      'read',
    );
    if (validationError) {
      return validationError;
    }

    if (params.start_line !== undefined && params.start_line < 1) {
      return 'start_line must be at least 1';
    }
    if (params.end_line !== undefined && params.end_line < 1) {
      return 'end_line must be at least 1';
    }
    if (
      params.start_line !== undefined &&
      params.end_line !== undefined &&
      params.start_line > params.end_line
    ) {
      return 'start_line cannot be greater than end_line';
    }

    if (params.full !== undefined && typeof params.full !== 'boolean') {
      return 'full must be a boolean';
    }

    const fileFilteringOptions = this.config.getFileFilteringOptions();
    if (
      this.fileDiscoveryService.shouldIgnoreFile(
        resolvedPath,
        fileFilteringOptions,
      )
    ) {
      return `File path '${resolvedPath}' is ignored by configured ignore patterns.`;
    }

    return null;
  }

  protected createInvocation(
    params: ReadFileToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<ReadFileToolParams, ToolResult> {
    return new ReadFileToolInvocation(
      this.config,
      params,
      messageBus,
      _toolName,
      _toolDisplayName,
    );
  }

  override getSchema(modelId?: string) {
    return resolveToolDeclaration(READ_FILE_DEFINITION, modelId);
  }
}
