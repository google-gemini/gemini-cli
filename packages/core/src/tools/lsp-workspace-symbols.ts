/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { IdeClient } from '../ide/ide-client.js';
import { debugLogger } from '../utils/debugLogger.js';
import { ToolErrorType } from './tool-error.js';
import { LSP_WORKSPACE_SYMBOLS_TOOL_NAME } from './tool-names.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolCallConfirmationDetails,
  type ToolInvocation,
  type ToolResult,
} from './tools.js';

export interface LSPWorkspaceSymbolsToolParams {
  /**
   * The query string to search for symbols in the workspace.
   */
  query: string;
}

class LSPWorkspaceSymbolsToolInvocation extends BaseToolInvocation<
  LSPWorkspaceSymbolsToolParams,
  ToolResult
> {
  constructor(
    params: LSPWorkspaceSymbolsToolParams,
    _toolName?: string,
    _toolDisplayName?: string,
    messageBus?: MessageBus,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  override getDescription(): string {
    return `Searching the workspace for: \`${this.params.query}\``;
  }

  override async shouldConfirmExecute(
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    return false;
  }

  override async execute(): Promise<ToolResult> {
    // TODO: implement abort signal handling
    debugLogger.log(
      'Executing LSPWorkspaceSymbolsTool with query: ',
      this.params.query,
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
      const symbols = await ideClient.getWorkspaceSymbols(this.params.query);
      return {
        llmContent: `Found ${symbols.length} symbols for query "${this.params.query}:\n${JSON.stringify(symbols)}".`,
        returnDisplay: `Found ${symbols.length} symbols for query "${this.params.query}".`,
      };
    } catch (error) {
      return {
        llmContent: `Error executing LSP workspace symbols search: ${
          (error as Error).message
        }`,
        returnDisplay: 'Error executing LSP workspace symbols search',
        error: {
          message: (error as Error).message,
          type: ToolErrorType.LSP_ERROR,
        },
      };
    }
  }
}

export class LSPWorkspaceSymbolsTool extends BaseDeclarativeTool<
  LSPWorkspaceSymbolsToolParams,
  ToolResult
> {
  static readonly Name = LSP_WORKSPACE_SYMBOLS_TOOL_NAME;

  constructor(messageBus?: MessageBus) {
    super(
      LSPWorkspaceSymbolsTool.Name,
      'LSPWorkspaceSymbols',
      'Search for symbols in the workspace using the Language Server Protocol (LSP).',
      Kind.Search,
      {
        properties: {
          query: {
            description:
              'The query string to search for symbols in the workspace.',
            type: 'string',
          },
        },
        required: ['query'],
        type: 'object',
      },
      false,
      false,
      messageBus,
    );
  }

  protected override createInvocation(
    params: LSPWorkspaceSymbolsToolParams,
    messageBus?: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<LSPWorkspaceSymbolsToolParams, ToolResult> {
    return new LSPWorkspaceSymbolsToolInvocation(
      params,
      _toolName,
      _toolDisplayName,
      messageBus,
    );
  }
}
