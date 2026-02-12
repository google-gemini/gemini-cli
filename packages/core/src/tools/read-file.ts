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
import type { FunctionDeclaration, PartUnion } from '@google/genai';
import {
  processSingleFileContent,
  getSpecificMimeType,
  DEFAULT_MAX_LINES_TEXT_FILE,
} from '../utils/fileUtils.js';
import type { Config } from '../config/config.js';
import { FileOperation } from '../telemetry/metrics.js';
import { getProgrammingLanguage } from '../telemetry/telemetry-utils.js';
import { logFileOperation } from '../telemetry/loggers.js';
import { FileOperationEvent } from '../telemetry/types.js';
import { READ_FILE_TOOL_NAME } from './tool-names.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import {
  isPreviewModel,
  supportsMultimodalFunctionResponse,
} from '../config/models.js';
import { READ_FILE_DEFINITION } from './definitions/coreTools.js';

/**
 * Parameters for the ReadFile tool
 */
export interface ReadFileToolParams {
  /**
   * The path to the file to read
   */
  file_path: string;

  /**
   * The line number to start reading from (optional, 0-based)
   */
  offset?: number;

  /**
   * The number of lines to read (optional)
   */
  limit?: number;

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
        line: this.params.start_line ?? this.params.offset,
      },
    ];
  }

  async execute(): Promise<ToolResult> {
    const activeModel = this.config.getActiveModel();
    const isGemini3 =
      supportsMultimodalFunctionResponse(activeModel) ||
      isPreviewModel(activeModel);

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

    const result = await processSingleFileContent(
      this.resolvedPath,
      this.config.getTargetDir(),
      this.config.getFileSystemService(),
      isGemini3 ? undefined : this.params.offset,
      isGemini3 ? undefined : this.params.limit,
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

    let llmContent: PartUnion;
    if (result.isTruncated) {
      const [start, end] = result.linesShown!;
      const total = result.originalLineCount!;

      if (isGemini3) {
        llmContent = `
IMPORTANT: The file content has been truncated.
Status: Showing lines ${start}-${end} of ${total} total lines.
Action: 
- To find specific patterns, use the 'grep_search' tool.
- For surgical extraction of code blocks (especially ranges larger than 2,000 lines), prefer 'run_shell_command' with 'sed'. For example: 'sed -n "500,600p" ${this.params.file_path}'.
- You can also use other Unix utilities like 'awk', 'head', or 'tail' via 'run_shell_command'.

--- FILE CONTENT (truncated) ---
${result.llmContent}`;
      } else {
        const nextOffset = this.params.offset
          ? this.params.offset + end - start + 1
          : end;
        llmContent = `
IMPORTANT: The file content has been truncated.
Status: Showing lines ${start}-${end} of ${total} total lines.
Action: To read more of the file, you can use the 'offset' and 'limit' parameters in a subsequent 'read_file' call. For example, to read the next section of the file, use offset: ${nextOffset}.

--- FILE CONTENT (truncated) ---
${result.llmContent}`;
      }
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
      'ReadFile',
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

  override getSchema(modelId?: string): FunctionDeclaration {
    const activeModel = modelId ?? this.config.getActiveModel();
    const isGemini3 =
      supportsMultimodalFunctionResponse(activeModel) ||
      isPreviewModel(activeModel);

    const properties: Record<string, unknown> = {
      file_path: {
        description: 'The path to the file to read.',
        type: 'string',
      },
    };

    if (isGemini3) {
      properties['start_line'] = {
        description: 'Optional: The 1-based line number to start reading from.',
        type: 'number',
      };
      properties['end_line'] = {
        description:
          'Optional: The 1-based line number to end reading at (inclusive).',
        type: 'number',
      };
    } else {
      properties['offset'] = {
        description:
          "Optional: For text files, the 0-based line number to start reading from. Requires 'limit' to be set. Use for paginating through large files.",
        type: 'number',
      };
      properties['limit'] = {
        description:
          "Optional: For text files, maximum number of lines to read. Use with 'offset' to paginate through large files. If omitted, reads the entire file (if feasible, up to a default limit).",
        type: 'number',
      };
    }

    return {
      name: this.name,
      description: isGemini3
        ? `Reads a specific range of a file (up to ${DEFAULT_MAX_LINES_TEXT_FILE} lines). **Important:** For high token efficiency, avoid reading large files in their entirety. Use 'grep_search' to find symbols or 'run_shell_command' with 'sed' for surgical block extraction instead of broad file reads. Handles text, images, audio, and PDF files.`
        : `Reads and returns the content of a specified file. If the file is large, the content will be truncated. The tool's response will clearly indicate if truncation has occurred and will provide details on how to read more of the file using the 'offset' and 'limit' parameters. Handles text, images, audio, and PDF files. For text files, it can read specific line ranges.`,
      parametersJsonSchema: {
        properties,
        required: ['file_path'],
        type: 'object',
      },
    };
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

    if (params.offset !== undefined && params.offset < 0) {
      return 'Offset must be a non-negative number';
    }
    if (params.limit !== undefined && params.limit <= 0) {
      return 'Limit must be a positive number';
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
}
