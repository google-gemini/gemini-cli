/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ToolInvocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import { getErrorMessage } from '../utils/errors.js';
import type { PartListUnion } from '@google/genai';
import type { Config } from '../config/config.js';

/**
 * Parameters for the ReadMcpResourceTool.
 */
export interface ReadMcpResourceParams {
  /**
   * An array of MCP resource specifiers in the format "serverName:resourceUri".
   * Example: ["server1:test://example/doc1", "server2:config://settings"]
   */
  resources: string[];
}

/**
 * Result type for resource processing operations
 */
type ResourceProcessingResult =
  | {
      success: true;
      resourceSpec: string;
      serverName: string;
      resourceUri: string;
      content: string;
      mimeType?: string;
      reason?: undefined;
    }
  | {
      success: false;
      resourceSpec: string;
      serverName: string;
      resourceUri: string;
      content?: undefined;
      mimeType?: undefined;
      reason: string;
    };

const DEFAULT_OUTPUT_SEPARATOR_FORMAT = '--- MCP Resource: {resourceSpec} ---';
const DEFAULT_OUTPUT_TERMINATOR = '\n--- End of MCP resource content ---';

class ReadMcpResourceToolInvocation extends BaseToolInvocation<
  ReadMcpResourceParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: ReadMcpResourceParams,
  ) {
    super(params);
  }

  getDescription(): string {
    const resourceSpecs = this.params.resources;

    if (resourceSpecs.length === 1) {
      // Single resource - show clean format
      const spec = resourceSpecs[0];
      const colonIndex = spec.indexOf(':');
      if (colonIndex > 0) {
        const serverName = spec.slice(0, colonIndex);
        const resourceUri = spec.slice(colonIndex + 1);

        // Try to get a friendly name from the resource registry
        const resourceRegistry = this.config.getResourceRegistry();
        const resource = resourceRegistry.getResource(serverName, resourceUri);
        const resourceName = resource?.name || resourceUri;

        return `Read "${resourceName}" from ${serverName}`;
      }
      return `Read MCP resource: ${spec}`;
    } else {
      // Multiple resources - show count with server info
      const serverNames = new Set();
      resourceSpecs.forEach((spec) => {
        const colonIndex = spec.indexOf(':');
        if (colonIndex > 0) {
          serverNames.add(spec.slice(0, colonIndex));
        }
      });

      const serverList = Array.from(serverNames).join(', ');
      return `Read ${resourceSpecs.length} MCP resources from ${serverList}`;
    }
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const { resources: resourceSpecs } = this.params;

    const resourceRegistry = this.config.getResourceRegistry();
    const processedResourcesRelativePaths: string[] = [];
    const contentParts: PartListUnion = [];
    const skippedResources: Array<{ spec: string; reason: string }> = [];

    if (resourceSpecs.length === 0) {
      return {
        llmContent: 'No MCP resources specified to read.',
        returnDisplay: `## ReadMcpResource Result\n\nNo MCP resources were specified to read.`,
      };
    }

    // Parse and validate resource specifications
    const resourceProcessingPromises = resourceSpecs.map(
      async (resourceSpec): Promise<ResourceProcessingResult> => {
        // Parse server:resource format
        const colonIndex = resourceSpec.indexOf(':');
        if (colonIndex <= 0 || colonIndex >= resourceSpec.length - 1) {
          return {
            success: false,
            resourceSpec,
            serverName: '',
            resourceUri: '',
            reason: `Invalid MCP resource format. Expected 'serverName:resourceUri', got '${resourceSpec}'`,
          };
        }

        const serverName = resourceSpec.slice(0, colonIndex);
        const resourceUri = resourceSpec.slice(colonIndex + 1);

        try {
          // Check if resource exists
          const resource = resourceRegistry.getResource(
            serverName,
            resourceUri,
          );

          if (!resource) {
            // Provide helpful error with available resources
            const serverResources =
              resourceRegistry.getResourcesByServer(serverName);
            let reason = `MCP resource '${resourceSpec}' not found.`;

            if (serverResources.length === 0) {
              reason += ` Server '${serverName}' has no available resources.`;
            } else {
              const availableUris = serverResources
                .map((r) => r.uri)
                .slice(0, 3);
              const moreAvailable =
                serverResources.length > 3
                  ? ` and ${serverResources.length - 3} more`
                  : '';
              reason += ` Available resources: ${availableUris.join(', ')}${moreAvailable}`;
            }

            return {
              success: false,
              resourceSpec,
              serverName,
              resourceUri,
              reason,
            };
          }

          // Fetch resource content
          const resourceContents = await resource.read();
          let resourceContent = '';
          let mimeType = '';

          if (
            'text' in resourceContents &&
            typeof resourceContents['text'] === 'string'
          ) {
            resourceContent = resourceContents['text'];
            mimeType =
              (typeof resourceContents['mimeType'] === 'string'
                ? resourceContents['mimeType']
                : '') || 'text/plain';
          } else if (
            'blob' in resourceContents &&
            typeof resourceContents['blob'] === 'string'
          ) {
            // Decode base64 blob for text-based content
            mimeType =
              (typeof resourceContents['mimeType'] === 'string'
                ? resourceContents['mimeType']
                : '') || '';
            if (
              mimeType.startsWith('text/') ||
              mimeType === 'application/json' ||
              mimeType === 'application/xml' ||
              mimeType.includes('markdown') ||
              mimeType.includes('yaml')
            ) {
              try {
                resourceContent = Buffer.from(
                  resourceContents['blob'],
                  'base64',
                ).toString('utf-8');
              } catch (decodeError) {
                return {
                  success: false,
                  resourceSpec,
                  serverName,
                  resourceUri,
                  reason: `Failed to decode MCP resource as text: ${getErrorMessage(decodeError)}`,
                };
              }
            } else {
              return {
                success: false,
                resourceSpec,
                serverName,
                resourceUri,
                reason: `MCP resource contains binary content (${mimeType}) that cannot be processed as text`,
              };
            }
          } else {
            return {
              success: false,
              resourceSpec,
              serverName,
              resourceUri,
              reason: 'MCP resource returned no readable content',
            };
          }

          return {
            success: true,
            resourceSpec,
            serverName,
            resourceUri,
            content: resourceContent,
            mimeType,
          };
        } catch (error) {
          return {
            success: false,
            resourceSpec,
            serverName,
            resourceUri,
            reason: `Error reading MCP resource: ${getErrorMessage(error)}`,
          };
        }
      },
    );

    const results = await Promise.allSettled(resourceProcessingPromises);

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const resourceResult = result.value;

        if (!resourceResult.success) {
          // Handle failed resources
          skippedResources.push({
            spec: resourceResult.resourceSpec,
            reason: resourceResult.reason,
          });
        } else {
          // Handle successfully processed resources
          const { resourceSpec, content } = resourceResult;

          const separator = DEFAULT_OUTPUT_SEPARATOR_FORMAT.replace(
            '{resourceSpec}',
            resourceSpec,
          );

          contentParts.push(`${separator}\n\n${content}\n\n`);
          processedResourcesRelativePaths.push(resourceSpec);
        }
      } else {
        // Handle Promise rejection (unexpected errors)
        skippedResources.push({
          spec: 'unknown',
          reason: `Unexpected error: ${result.reason}`,
        });
      }
    }

    // Build the display message with actual content
    let displayMessage = '';

    if (processedResourcesRelativePaths.length > 0) {
      // Show the actual resource content, similar to ReadManyFiles
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.success) {
          const resourceResult = result.value;
          const { resourceSpec } = resourceResult;

          const colonIndex = resourceSpec.indexOf(':');
          if (colonIndex > 0) {
            const serverName = resourceSpec.slice(0, colonIndex);
            const resourceUri = resourceSpec.slice(colonIndex + 1);

            // Try to get a friendly name
            const resourceRegistry = this.config.getResourceRegistry();
            const resource = resourceRegistry.getResource(
              serverName,
              resourceUri,
            );
            const resourceName = resource?.name || resourceUri;

            // Only show server/resource info if reading multiple resources
            if (resourceSpecs.length > 1) {
              displayMessage += `MCP Server: ${serverName}\nResource: ${resourceName}\n\n`;
            }
          }
        }
      }
    }

    // Add error information if there were issues
    if (skippedResources.length > 0) {
      if (processedResourcesRelativePaths.length === 0) {
        displayMessage += `Error: No MCP resources could be loaded\n\n`;
      } else {
        displayMessage += `Warning: Some resources could not be loaded\n\n`;
      }

      skippedResources.slice(0, 5).forEach((r) => {
        const colonIndex = r.spec.indexOf(':');
        if (colonIndex > 0) {
          const serverName = r.spec.slice(0, colonIndex);
          const resourceUri = r.spec.slice(colonIndex + 1);
          displayMessage += `${resourceUri} from ${serverName}: ${r.reason}\n`;
        } else {
          displayMessage += `${r.spec}: ${r.reason}\n`;
        }
      });
      if (skippedResources.length > 5) {
        displayMessage += `...and ${skippedResources.length - 5} more resources failed to load.\n`;
      }
      displayMessage += `\n`;
    } else if (
      processedResourcesRelativePaths.length === 0 &&
      skippedResources.length === 0
    ) {
      displayMessage += `No MCP resources specified\n\n`;
    }

    if (contentParts.length > 0) {
      contentParts.push(DEFAULT_OUTPUT_TERMINATOR);
    } else {
      contentParts.push('No MCP resource content was loaded.');
    }

    return {
      llmContent: contentParts,
      returnDisplay: displayMessage.trim(),
    };
  }
}

/**
 * Tool implementation for reading MCP resources and concatenating their content.
 * This tool provides a consistent UI experience similar to ReadManyFiles but for MCP resources.
 */
export class ReadMcpResourceTool extends BaseDeclarativeTool<
  ReadMcpResourceParams,
  ToolResult
> {
  static readonly Name: string = 'read_mcp_resource';

  constructor(private config: Config) {
    const parameterSchema = {
      type: 'object',
      properties: {
        resources: {
          type: 'array',
          items: {
            type: 'string',
            minLength: 1,
            pattern: '^[^:]+:.+$',
          },
          minItems: 1,
          description:
            "Required. An array of MCP resource specifiers in the format 'serverName:resourceUri'. Examples: ['server1:test://example/doc1', 'server2:config://settings']",
        },
      },
      required: ['resources'],
    };

    super(
      ReadMcpResourceTool.Name,
      'ReadMcpResource',
      `Loads content from MCP (Model Context Protocol) resources provided by external servers. MCP resources can include documents, configuration files, API data, databases, and other external content sources.

This tool provides access to:
- Documentation and knowledge bases from MCP servers
- Configuration files and settings from external systems  
- API responses and dynamic data from connected services
- Database records and structured content from MCP-enabled applications

The tool loads each resource independently and presents them with clear labels showing the resource name and source server. If some resources are unavailable, others will still be loaded successfully.`,
      Kind.Read,
      parameterSchema,
    );
  }

  protected createInvocation(
    params: ReadMcpResourceParams,
  ): ToolInvocation<ReadMcpResourceParams, ToolResult> {
    return new ReadMcpResourceToolInvocation(this.config, params);
  }
}
