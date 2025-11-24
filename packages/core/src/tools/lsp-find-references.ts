/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import path from 'node:path';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { IdeClient } from '../ide/ide-client.js';
import { debugLogger } from '../utils/debugLogger.js';
import { ToolErrorType } from './tool-error.js';
import { LSP_FIND_REFERENCES_TOOL_NAME } from './tool-names.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolCallConfirmationDetails,
  type ToolInvocation,
  type ToolResult,
} from './tools.js';

export interface LSPFindReferencesToolParams {
  /**
   * The file path to search for references.
   */
  filePath: string;
  /**
   * The line number to search for references.
   * 1-based.
   */
  line: number;
  /**
   * The character position to search for references.
   * 1-based.
   */
  character: number;
}

class LSPFindReferencesToolInvocation extends BaseToolInvocation<
  LSPFindReferencesToolParams,
  ToolResult
> {
  private readonly resolvedPath: string;
  constructor(
    private config: Config,
    params: LSPFindReferencesToolParams,
    _toolName?: string,
    _toolDisplayName?: string,
    messageBus?: MessageBus,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
    this.resolvedPath = path.resolve(
      this.config.getTargetDir(),
      this.params.filePath,
    );
  }

  override getDescription(): string {
    return `Finding references at ${this.params.filePath}:${this.params.line}:${this.params.character}`;
  }

  override async shouldConfirmExecute(
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    return false;
  }

  override async execute(): Promise<ToolResult> {
    debugLogger.log(
      'Executing LSPFindReferencesTool with params: ',
      JSON.stringify(this.params),
    );
    const ideClient = await IdeClient.getInstance();
    if (!ideClient) {
      return {
        llmContent: 'Error: IDE client is not connected.',
        returnDisplay:
          'Error: IDE client is not connected, ensure gemini-cli is running inside an IDE.',
        error: {
          message: 'IDE client is not connected',
          type: ToolErrorType.LSP_ERROR,
        },
      };
    }

    try {
      const references = await ideClient.findReferences(
        this.resolvedPath,
        this.params.line,
        this.params.character,
      );
      return {
        llmContent: `Found ${references.length} references for symbol at ${this.params.filePath}:${this.params.line}:${this.params.character}:\n${JSON.stringify(references)}.`,
        returnDisplay: `Found ${references.length} references.`,
      };
    } catch (error) {
      return {
        llmContent: `Error executing LSP find references search: ${
          (error as Error).message
        }`,
        returnDisplay: 'Error executing LSP find references search',
        error: {
          message: (error as Error).message,
          type: ToolErrorType.LSP_ERROR,
        },
      };
    }
  }
}

export class LSPFindReferencesTool extends BaseDeclarativeTool<
  LSPFindReferencesToolParams,
  ToolResult
> {
  static readonly Name = LSP_FIND_REFERENCES_TOOL_NAME;

  constructor(
    private config: Config,
    messageBus?: MessageBus,
  ) {
    super(
      LSPFindReferencesTool.Name,
      'LSPFindReferences',
      'Find references for a symbol in a file, at a particular line, character using the Language Server Protocol (LSP).',
      Kind.Search,
      {
        properties: {
          filePath: {
            description: 'The file path to search for references.',
            type: 'string',
          },
          line: {
            description: 'The line number to search for references. 1-based.',
            type: 'number',
          },
          character: {
            description:
              'The character position to search for references. 1-based.',
            type: 'number',
          },
        },
        required: ['filePath', 'line', 'character'],
        type: 'object',
      },
      false,
      false,
      messageBus,
    );
  }

  protected override createInvocation(
    params: LSPFindReferencesToolParams,
    messageBus?: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<LSPFindReferencesToolParams, ToolResult> {
    return new LSPFindReferencesToolInvocation(
      this.config,
      params,
      _toolName,
      _toolDisplayName,
      messageBus,
    );
  }
}
