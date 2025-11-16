/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { Config } from '../config/config.js';
import type { ToolResult } from '../tools/tools.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
} from '../tools/tools.js';
import { LIST_RESOURCES_TOOL_NAME } from '../tools/tool-names.js';
import type { DiscoveredMCPResource } from './resource-registry.js';

export interface ListResourcesToolParams {
  /**
   * Optional: limit results to a single MCP server.
   */
  server_name?: string;
}

class ListResourcesToolInvocation extends BaseToolInvocation<
  ListResourcesToolParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: ListResourcesToolParams,
    messageBus?: MessageBus,
    toolName?: string,
    toolDisplayName?: string,
  ) {
    super(params, messageBus, toolName, toolDisplayName);
  }

  getDescription(): string {
    if (this.params.server_name) {
      return `List resources for ${this.params.server_name}`;
    }
    return 'List all discovered MCP resources';
  }

  private buildSummary(resources: DiscoveredMCPResource[]): string {
    if (resources.length === 0) {
      if (this.params.server_name) {
        return `No MCP resources are currently available for server "${this.params.server_name}".`;
      }
      return 'No MCP resources are currently available.';
    }

    const lines = resources.map((resource) => {
      const metadata = [
        resource.uri ?? '(no uri)',
        resource.serverName,
        resource.name,
        resource.mimeType,
      ]
        .filter(Boolean)
        .join(' · ');
      const description = resource.description
        ? `\n    ${resource.description}`
        : '';
      return `- ${metadata}${description}`;
    });

    const scopeText = this.params.server_name
      ? `for ${this.params.server_name}`
      : '';
    return (
      `Discovered MCP resources ${scopeText}`.trim() + ':\n' + lines.join('\n')
    );
  }

  async execute(): Promise<ToolResult> {
    const registry = this.config.getResourceRegistry();
    const allResources = registry.getAllResources();
    const filtered = this.params.server_name
      ? allResources.filter(
          (resource) => resource.serverName === this.params.server_name,
        )
      : allResources;
    const summary = this.buildSummary(filtered);
    return {
      llmContent: summary,
      returnDisplay: summary,
    };
  }
}

export class ListResourcesTool extends BaseDeclarativeTool<
  ListResourcesToolParams,
  ToolResult
> {
  static readonly Name = LIST_RESOURCES_TOOL_NAME;

  constructor(
    private readonly config: Config,
    messageBus?: MessageBus,
  ) {
    super(
      ListResourcesTool.Name,
      'ListMcpResources',
      'Lists the MCP resources currently available from connected servers. Optionally filter by server name.',
      Kind.Search,
      {
        type: 'object',
        properties: {
          server_name: {
            type: 'string',
            description: 'Optional server name to filter the result set.',
          },
        },
        additionalProperties: false,
      },
      false,
      false,
      messageBus,
    );
  }

  protected override createInvocation(
    params: ListResourcesToolParams,
    messageBus?: MessageBus,
  ): BaseToolInvocation<ListResourcesToolParams, ToolResult> {
    return new ListResourcesToolInvocation(
      this.config,
      params,
      messageBus,
      this.name,
      this.displayName,
    );
  }
}
