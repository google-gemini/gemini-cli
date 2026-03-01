/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../confirmation-bus/message-bus.js';
import path from 'node:path';
import { makeRelative, shortenPath } from '../utils/paths.js';
import type { ToolInvocation, ToolLocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import { ToolErrorType } from './tool-error.js';

import {
  processSingleFileContent,
  getSpecificMimeType,
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
}
class ReadFileToolInvocation extends BaseToolInvocation<
  ReadFileToolParams,
  ToolResult
> {
  private readonly resolvedPath: string;

  constructor(
    private readonly config: Config,
    params: ReadFileToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
    isSensitive?: boolean,
  ) {
    super(
      params,
      messageBus,
      _toolName,
      _toolDisplayName,
      undefined,
      undefined,
      isSensitive,
    );
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
    try {
      const result = await processSingleFileContent(
        this.resolvedPath,
        this.config.getTargetDir(),
        this.config.getFileSystemService(),
        this.params.start_line,
        this.params.end_line,
      );

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

      let llmContent = result.llmContent;

      if (result.isTruncated && typeof llmContent === 'string') {
        const [startLine, endLine] = result.linesShown || [1, 0];
        llmContent = `
IMPORTANT: The file content has been truncated.
Status: Showing lines ${startLine}-${endLine} of ${result.originalLineCount} total lines.
Action: To read more of the file, you can use the 'start_line' and 'end_line' parameters in a subsequent 'read_file' call. For example, to read the next section of the file, use start_line: ${
          endLine + 1
        }.

--- FILE CONTENT (truncated) ---
${llmContent}
`;
      }

      const programming_language = getProgrammingLanguage({
        file_path: this.resolvedPath,
      });

      logFileOperation(
        this.config,
        new FileOperationEvent(
          this._toolName || READ_FILE_TOOL_NAME,
          FileOperation.READ,
          result.originalLineCount,
          getSpecificMimeType(this.resolvedPath),
          path.extname(this.resolvedPath),
          programming_language,
        ),
      );

      const finalResult: ToolResult = {
        llmContent,
        returnDisplay: result.returnDisplay || '',
      };
      return finalResult;
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      const errorMessage = String(error.message);
      const toolResult: ToolResult = {
        llmContent: [
          {
            text: `Error reading file: ${errorMessage}`,
          },
        ],
        returnDisplay: `Error: ${errorMessage}`,
        error: {
          message: errorMessage,
          type: ToolErrorType.EXECUTION_FAILED,
        },
      };
      return toolResult;
    }
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
      undefined,
      undefined,
      true,
    );
    this.fileDiscoveryService = new FileDiscoveryService(
      config.getTargetDir(),
      config.getFileFilteringOptions(),
    );
  }

  protected override validateToolParamValues(
    params: ReadFileToolParams,
  ): string | null {
    if (!params.file_path) {
      return "The 'file_path' parameter must be non-empty.";
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
    isSensitive?: boolean,
  ): ToolInvocation<ReadFileToolParams, ToolResult> {
    return new ReadFileToolInvocation(
      this.config,
      params,
      messageBus,
      _toolName,
      _toolDisplayName,
      isSensitive,
    );
  }

  override getSchema(modelId?: string) {
    return resolveToolDeclaration(READ_FILE_DEFINITION, modelId);
  }
}
