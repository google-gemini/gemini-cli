/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolResult,
  type ExecuteOptions,
} from './tools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { LIST_MCP_RESOURCES_TOOL_NAME } from './tool-names.js';
import { LIST_MCP_RESOURCES_DEFINITION } from './definitions/coreTools.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import { ToolErrorType } from './tool-error.js';

export interface ListMcpResourcesParams {
  serverName?: string;
}

export class ListMcpResourcesTool extends BaseDeclarativeTool<
  ListMcpResourcesParams,
  ToolResult
> {
  static readonly Name = LIST_MCP_RESOURCES_TOOL_NAME;

  constructor(
    private readonly context: AgentLoopContext,
    messageBus: MessageBus,
  ) {
    super(
      ListMcpResourcesTool.Name,
      'List MCP Resources',
      LIST_MCP_RESOURCES_DEFINITION.base.description!,
      Kind.Search,
      LIST_MCP_RESOURCES_DEFINITION.base.parametersJsonSchema,
      messageBus,
      true,
      false,
    );
  }

  protected createInvocation(
    params: ListMcpResourcesParams,
  ): ListMcpResourcesToolInvocation {
    return new ListMcpResourcesToolInvocation(
      this.context,
      params,
      this.messageBus,
    );
  }
}

class ListMcpResourcesToolInvocation extends BaseToolInvocation<
  ListMcpResourcesParams,
  ToolResult
> {
  constructor(
    private readonly context: AgentLoopContext,
    params: ListMcpResourcesParams,
    messageBus: MessageBus,
  ) {
    super(params, messageBus, ListMcpResourcesTool.Name, 'List MCP Resources');
  }

  getDescription(): string {
    return 'List MCP resources';
  }

  async execute({
    abortSignal: _abortSignal,
  }: ExecuteOptions): Promise<ToolResult> {
    const mcpManager = this.context.config.getMcpClientManager();
    if (!mcpManager) {
      return {
        llmContent: 'Error: MCP Client Manager not available.',
        returnDisplay: 'Error: MCP Client Manager not available.',
        error: {
          message: 'MCP Client Manager not available.',
          type: ToolErrorType.EXECUTION_FAILED,
        },
      };
    }

    let resources = mcpManager.getAllResources();

    const serverName = this.params.serverName;
    if (serverName) {
      resources = resources.filter((r) => r.serverName === serverName);
    }

    if (resources.length === 0) {
      const msg = serverName
        ? `No resources found for server: ${serverName}`
        : 'No MCP resources found.';
      return {
        llmContent: msg,
        returnDisplay: msg,
      };
    }

    // Format the list
    let content = 'Available MCP Resources:\n';
    for (const resource of resources) {
      content += `- ${resource.serverName}:${resource.uri}`;
      if (resource.name) {
        content += ` | ${resource.name}`;
      }
      if (resource.description) {
        content += ` | ${resource.description}`;
      }
      content += '\n';
    }

    return {
      llmContent: content,
      returnDisplay: `Listed ${resources.length} resources.`,
    };
  }
}
