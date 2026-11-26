/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolInvocation,
  type ToolResult,
  type ToolCallConfirmationDetails,
  type ExecuteOptions,
} from './tools.js';
import { GET_CLI_REFERENCE_TOOL_NAME } from './tool-names.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { ToolErrorType } from './tool-error.js';
import { GET_CLI_REFERENCE_DEFINITION } from './definitions/coreTools.js';
import { resolveToolDeclaration } from './definitions/resolver.js';
import {
  getCliReference,
  type CliReferenceCategory,
} from '../services/cliSelfKnowledge.js';

/**
 * Parameters for the GetCliReference tool.
 */
export interface GetCliReferenceParams {
  /**
   * The category of reference data to retrieve.
   * One of: 'flags', 'hotkeys', 'commands', 'all'.
   * Defaults to 'all' if not provided.
   */
  category?: string;
}

class GetCliReferenceInvocation extends BaseToolInvocation<
  GetCliReferenceParams,
  ToolResult
> {
  constructor(
    params: GetCliReferenceParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  override async shouldConfirmExecute(
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    return false;
  }

  getDescription(): string {
    const cat = this.params?.category ?? 'all';
    return `Retrieving CLI reference data: ${cat}`;
  }

  async execute({ abortSignal: _signal }: ExecuteOptions): Promise<ToolResult> {
    try {
      // Defensive type guard: LLM may pass non-string values
      const rawCategoryParam = this.params?.category;
      if (
        rawCategoryParam !== undefined &&
        typeof rawCategoryParam !== 'string'
      ) {
        return {
          llmContent:
            'Invalid category parameter type. Expected a string.',
          returnDisplay: `Invalid category parameter type: ${typeof rawCategoryParam}`,
          error: {
            message: `Invalid category parameter type: ${typeof rawCategoryParam}`,
            type: ToolErrorType.INVALID_TOOL_PARAMS,
          },
        };
      }

      // Trim first, then reject empty/whitespace-only values
      const trimmedCategory =
        typeof rawCategoryParam === 'string'
          ? rawCategoryParam.trim()
          : undefined;
      if (trimmedCategory === '') {
        return {
          llmContent:
            'Category parameter cannot be empty or whitespace-only.',
          returnDisplay: 'Category parameter cannot be empty.',
          error: {
            message: 'Category parameter cannot be empty.',
            type: ToolErrorType.INVALID_TOOL_PARAMS,
          },
        };
      }

      const rawCategory = (trimmedCategory ?? 'all').toLowerCase();

      // Use typed array + includes to avoid prototype lookup issues
      const validCategories = ['flags', 'hotkeys', 'commands', 'all'] as const;
      type ValidCategory = (typeof validCategories)[number];

      if (
        !validCategories.includes(rawCategory as ValidCategory)
      ) {
        // Do not reflect raw user input into llmContent (prompt injection risk)
        return {
          llmContent:
            'Invalid category. Valid options are: flags, hotkeys, commands, all.',
          returnDisplay: `Invalid category: ${rawCategory}`,
          error: {
            message: `Invalid category: ${rawCategory}`,
            type: ToolErrorType.INVALID_TOOL_PARAMS,
          },
        };
      }

      const content = getCliReference(rawCategory as CliReferenceCategory);

      return {
        llmContent: content,
        returnDisplay: `Successfully retrieved CLI reference: ${rawCategory}`,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error retrieving CLI reference: ${errorMessage}`,
        returnDisplay: `Failed to retrieve CLI reference: ${errorMessage}`,
        error: {
          message: errorMessage,
          type: ToolErrorType.EXECUTION_FAILED,
        },
      };
    }
  }
}

/**
 * A tool that provides structured, authoritative reference data about
 * the Gemini CLI's own flags, keyboard shortcuts, and slash commands.
 *
 * Unlike `get_internal_docs` (which reads markdown documentation files),
 * this tool returns data derived directly from the runtime source of truth,
 * ensuring the agent never hallucinates deprecated flags or non-existent
 * hotkeys.
 */
export class GetCliReferenceTool extends BaseDeclarativeTool<
  GetCliReferenceParams,
  ToolResult
> {
  static readonly Name = GET_CLI_REFERENCE_TOOL_NAME;

  constructor(messageBus: MessageBus) {
    super(
      GetCliReferenceTool.Name,
      'GetCliReference',
      GET_CLI_REFERENCE_DEFINITION.base.description!,
      Kind.Think,
      GET_CLI_REFERENCE_DEFINITION.base.parametersJsonSchema,
      messageBus,
      /* isOutputMarkdown */ true,
      /* canUpdateOutput */ false,
    );
  }

  protected createInvocation(
    params: GetCliReferenceParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<GetCliReferenceParams, ToolResult> {
    return new GetCliReferenceInvocation(
      params,
      messageBus,
      _toolName ?? GetCliReferenceTool.Name,
      _toolDisplayName,
    );
  }

  override getSchema(modelId?: string) {
    return resolveToolDeclaration(GET_CLI_REFERENCE_DEFINITION, modelId);
  }
}
