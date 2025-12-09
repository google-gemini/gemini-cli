/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { Config } from '../config/config.js';
import type { ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import { READ_RESOURCE_TOOL_NAME } from './tool-names.js';
import { ToolErrorType } from './tool-error.js';
import { getErrorMessage } from '../utils/errors.js';
import type {
  ReadResourceResult,
  TextResourceContents,
  BlobResourceContents,
} from '@modelcontextprotocol/sdk/types.js';
import { Buffer } from 'node:buffer';

export interface ReadResourceToolParams {
  uri: string;
}

type ResourceContent = TextResourceContents | BlobResourceContents;

class ReadResourceToolInvocation extends BaseToolInvocation<
  ReadResourceToolParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: ReadResourceToolParams,
    messageBus?: MessageBus,
    toolName?: string,
    toolDisplayName?: string,
  ) {
    super(params, messageBus, toolName, toolDisplayName);
  }

  getDescription(): string {
    return `Read resource ${this.params.uri}`;
  }

  private formatContents(response: ReadResourceResult): string {
    const sections: string[] = [];
    const contents = response.contents ?? [];
    if (contents.length === 0) {
      return 'The resource did not return any content blocks.';
    }

    contents.forEach((content: ResourceContent, index: number) => {
      const mimeType = content.mimeType ?? 'application/octet-stream';
      const header = `--- Part ${index + 1} (${mimeType}) ---`;
      if ('text' in content) {
        sections.push(`${header}\n${content.text}`);
      } else if ('blob' in content) {
        const sizeBytes = Buffer.from(content.blob, 'base64').length;
        sections.push(
          `${header}\n[Binary content not inlined: ${sizeBytes} bytes]`,
        );
      }
    });

    return sections.join('\n\n');
  }

  async execute(signal: AbortSignal): Promise<ToolResult> {
    const registry = this.config.getResourceRegistry();
    const resource = registry.findResourceByUri(this.params.uri);
    if (!resource) {
      return {
        llmContent: `Resource '${this.params.uri}' was not found in the MCP registry.`,
        returnDisplay: `Resource '${this.params.uri}' was not found.`,
        error: {
          message: `Unknown resource URI '${this.params.uri}'. Use list_resources first to discover valid URIs.`,
          type: ToolErrorType.INVALID_TOOL_PARAMS,
        },
      };
    }

    const mcpManager = this.config.getMcpClientManager();
    if (!mcpManager) {
      return {
        llmContent:
          'Unable to read MCP resources because no MCP client manager is configured.',
        returnDisplay:
          'Unable to read MCP resources because no MCP client manager is configured.',
        error: {
          message: 'MCP client manager not initialized.',
          type: ToolErrorType.MCP_TOOL_ERROR,
        },
      };
    }

    const client = mcpManager.getClient(resource.serverName);
    if (!client || typeof client.readResource !== 'function') {
      return {
        llmContent: `MCP server '${resource.serverName}' is not connected or does not support resource reads.`,
        returnDisplay: `MCP server '${resource.serverName}' is not connected or does not support resource reads.`,
        error: {
          message: `MCP server '${resource.serverName}' is not connected or does not support resource reads.`,
          type: ToolErrorType.MCP_TOOL_ERROR,
        },
      };
    }

    const resourceUri = resource.uri ?? this.params.uri;
    const displayUri = resource.uri
      ? `${resource.serverName}:${resource.uri}`
      : this.params.uri;

    try {
      // Race MCP resource read with abort signal to respect cancellation
      const response = await new Promise<ReadResourceResult>(
        (resolve, reject) => {
          if (signal.aborted) {
            const error = new Error('Resource read aborted');
            error.name = 'AbortError';
            reject(error);
            return;
          }

          const onAbort = () => {
            cleanup();
            const error = new Error('Resource read aborted');
            error.name = 'AbortError';
            reject(error);
          };

          const cleanup = () => {
            signal.removeEventListener('abort', onAbort);
          };

          signal.addEventListener('abort', onAbort, { once: true });

          client
            .readResource(resourceUri)
            .then((res) => {
              cleanup();
              resolve(res);
            })
            .catch((err) => {
              cleanup();
              reject(err);
            });
        },
      );

      const llmContent = this.formatContents(response);
      return {
        llmContent,
        returnDisplay: `Read MCP resource ${displayUri}`,
      };
    } catch (error) {
      const message = `Error reading resource '${this.params.uri}': ${getErrorMessage(
        error,
      )}`;
      return {
        llmContent: message,
        returnDisplay: message,
        error: {
          message,
          type: ToolErrorType.MCP_TOOL_ERROR,
        },
      };
    }
  }
}

export class ReadResourceTool extends BaseDeclarativeTool<
  ReadResourceToolParams,
  ToolResult
> {
  static readonly Name = READ_RESOURCE_TOOL_NAME;

  constructor(
    private readonly config: Config,
    messageBus?: MessageBus,
  ) {
    super(
      ReadResourceTool.Name,
      'ReadMCPResource',
      'Reads the contents of an MCP resource URI that was previously discovered.',
      Kind.Read,
      {
        type: 'object',
        properties: {
          uri: {
            type: 'string',
            description:
              'The MCP resource URI to read. Use the list_resources tool to discover available URIs.',
          },
        },
        required: ['uri'],
        additionalProperties: false,
      },
      false,
      false,
      messageBus,
    );
  }

  protected override validateToolParamValues(
    params: ReadResourceToolParams,
  ): string | null {
    if (!params.uri || params.uri.trim().length === 0) {
      return "The 'uri' parameter must be provided.";
    }
    return null;
  }

  protected override createInvocation(
    params: ReadResourceToolParams,
    messageBus?: MessageBus,
  ): BaseToolInvocation<ReadResourceToolParams, ToolResult> {
    return new ReadResourceToolInvocation(
      this.config,
      params,
      messageBus,
      this.name,
      this.displayName,
    );
  }
}
