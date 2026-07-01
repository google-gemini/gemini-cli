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
  type PolicyUpdateOptions,
  type ToolConfirmationOutcome,
} from './tools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { READ_MCP_RESOURCE_TOOL_NAME } from './tool-names.js';
import { READ_MCP_RESOURCE_DEFINITION } from './definitions/coreTools.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import { ToolErrorType } from './tool-error.js';
import type { MCPResource } from '../resources/resource-registry.js';
import { buildParamArgsPattern } from '../policy/utils.js';

export interface ReadMcpResourceParams {
  uri: string;
}

export class ReadMcpResourceTool extends BaseDeclarativeTool<
  ReadMcpResourceParams,
  ToolResult
> {
  static readonly Name = READ_MCP_RESOURCE_TOOL_NAME;

  constructor(
    private readonly context: AgentLoopContext,
    messageBus: MessageBus,
  ) {
    super(
      ReadMcpResourceTool.Name,
      'Read MCP Resource',
      READ_MCP_RESOURCE_DEFINITION.base.description!,
      Kind.Read,
      READ_MCP_RESOURCE_DEFINITION.base.parametersJsonSchema,
      messageBus,
      true,
      false,
    );
  }

  protected createInvocation(
    params: ReadMcpResourceParams,
  ): ReadMcpResourceToolInvocation {
    return new ReadMcpResourceToolInvocation(
      this.context,
      params,
      this.messageBus,
    );
  }
}

class ReadMcpResourceToolInvocation extends BaseToolInvocation<
  ReadMcpResourceParams,
  ToolResult
> {
  private resource: MCPResource | undefined;

  constructor(
    private readonly context: AgentLoopContext,
    params: ReadMcpResourceParams,
    messageBus: MessageBus,
  ) {
    super(params, messageBus, ReadMcpResourceTool.Name, 'Read MCP Resource');
    const mcpManager = this.context.config.getMcpClientManager();
    this.resource = mcpManager?.findResourceByUri(params.uri);
  }

  getDescription(): string {
    if (this.resource) {
      return `Read MCP resource "${this.resource.name}" from server "${this.resource.serverName}"`;
    }
    return `Read MCP resource: ${this.params.uri}`;
  }

  override getPolicyUpdateOptions(
    _outcome: ToolConfirmationOutcome,
  ): PolicyUpdateOptions | undefined {
    // Scope an "always allow" approval to this exact resource URI. The MCP
    // server identity cannot be conveyed via `mcpName` here because
    // read_mcp_resource is a flat core tool (not an `mcp_<server>_<tool>`
    // call), so the policy engine cannot derive a server name from it.
    // Narrowing by the URI argument mirrors how read_file/edit scope their
    // approvals and prevents a single approval from authorizing reads of
    // every resource on every connected server.
    return {
      argsPattern: buildParamArgsPattern('uri', this.params.uri),
    };
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

    const uri = this.params.uri;
    if (!uri) {
      return {
        llmContent: 'Error: No URI provided.',
        returnDisplay: 'Error: No URI provided.',
        error: {
          message: 'No URI provided.',
          type: ToolErrorType.INVALID_TOOL_PARAMS,
        },
      };
    }

    const resource = mcpManager.findResourceByUri(uri);
    if (!resource) {
      // Distinguish "no such resource" from "this bare URI is exposed by more
      // than one server". In the ambiguous case, instruct the model to retry
      // with a server-qualified identifier instead of failing opaquely (and
      // instead of silently reading from an arbitrary server).
      const candidates = mcpManager.findResourcesByUri(uri);
      let errorMessage: string;
      let errorType: ToolErrorType;
      if (candidates.length > 1) {
        const servers = candidates
          .map((candidate) => candidate.serverName)
          .sort((a, b) => a.localeCompare(b));
        errorMessage =
          `Resource URI "${uri}" is exposed by multiple MCP servers ` +
          `(${servers.join(', ')}). Retry with a server-qualified identifier ` +
          `of the form "serverName:uri" (for example "${servers[0]}:${uri}").`;
        errorType = ToolErrorType.INVALID_TOOL_PARAMS;
      } else {
        errorMessage = `Resource not found for URI: ${uri}`;
        errorType = ToolErrorType.MCP_RESOURCE_NOT_FOUND;
      }
      return {
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
        error: {
          message: errorMessage,
          type: errorType,
        },
      };
    }

    const client = mcpManager.getClient(resource.serverName);
    if (!client) {
      const errorMessage = `MCP Client not found for server: ${resource.serverName}`;
      return {
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
        error: {
          message: errorMessage,
          type: ToolErrorType.EXECUTION_FAILED,
        },
      };
    }

    try {
      const result = await client.readResource(resource.uri);
      // The result should contain contents.
      // Let's assume it returns a string or an object with contents.
      // According to MCP spec, it returns { contents: [...] }.
      // We should format it nicely.
      let contentText = '';
      if (result && result.contents) {
        for (const content of result.contents) {
          if ('text' in content && content.text) {
            contentText += content.text + '\n';
          } else if ('blob' in content && content.blob) {
            contentText += `[Binary Data (${content.mimeType})]` + '\n';
          }
        }
      }

      return {
        llmContent: contentText || 'No content returned from resource.',
        returnDisplay: this.resource
          ? `Successfully read resource "${this.resource.name}" from server "${this.resource.serverName}"`
          : `Successfully read resource: ${uri}`,
      };
    } catch (e) {
      const errorMessage = `Failed to read resource: ${e instanceof Error ? e.message : String(e)}`;
      return {
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
        error: {
          message: errorMessage,
          type: ToolErrorType.MCP_TOOL_ERROR,
        },
      };
    }
  }
}
