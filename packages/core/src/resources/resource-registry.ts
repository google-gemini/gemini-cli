/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Resource } from '@modelcontextprotocol/sdk/types.js';

const resourceKey = (serverName: string, uri: string): string =>
  `${serverName}::${uri}`;

export interface MCPResource extends Resource {
  serverName: string;
  discoveredAt: number;
}
export type DiscoveredMCPResource = MCPResource;

/**
 * Tracks resources discovered from MCP servers so other
 * components can query or include them in conversations.
 */
export class ResourceRegistry {
  private resources: Map<string, MCPResource> = new Map();

  /**
   * Replace the resources for a specific server.
   */
  setResourcesForServer(serverName: string, resources: Resource[]): void {
    this.removeResourcesByServer(serverName);
    const discoveredAt = Date.now();
    for (const resource of resources) {
      if (!resource.uri) {
        continue;
      }
      this.resources.set(resourceKey(serverName, resource.uri), {
        serverName,
        discoveredAt,
        ...resource,
      });
    }
  }

  getAllResources(): MCPResource[] {
    return Array.from(this.resources.values());
  }

  findResourceByUri(uri: string, serverName?: string): MCPResource | undefined {
    if (serverName) {
      return this.resources.get(resourceKey(serverName, uri));
    }
    for (const resource of this.resources.values()) {
      if (resource.uri === uri) {
        return resource;
      }
    }
    return undefined;
  }

  removeResourcesByServer(serverName: string): void {
    for (const key of Array.from(this.resources.keys())) {
      if (key.startsWith(`${serverName}::`)) {
        this.resources.delete(key);
      }
    }
  }

  clear(): void {
    this.resources.clear();
  }
}
