/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Resource,
  ResourceContents,
} from '@modelcontextprotocol/sdk/types.js';

export type DiscoveredMCPResource = Resource & {
  serverName: string;
  read: () => Promise<ResourceContents>;
};

export class ResourceRegistry {
  private resources: Map<string, DiscoveredMCPResource> = new Map();

  /**
   * Registers a resource definition.
   * @param resource - The resource object containing metadata and read logic.
   */
  registerResource(resource: DiscoveredMCPResource): void {
    const resourceKey = `${resource.serverName}:${resource.uri}`;
    if (this.resources.has(resourceKey)) {
      console.warn(
        `Resource with URI "${resource.uri}" from server "${resource.serverName}" is already registered. Overwriting.`,
      );
    }
    this.resources.set(resourceKey, resource);
  }

  /**
   * Returns an array of all registered and discovered resource instances.
   */
  getAllResources(): DiscoveredMCPResource[] {
    return Array.from(this.resources.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  /**
   * Get the definition of a specific resource by server and URI.
   */
  getResource(
    serverName: string,
    uri: string,
  ): DiscoveredMCPResource | undefined {
    const resourceKey = `${serverName}:${uri}`;
    return this.resources.get(resourceKey);
  }

  /**
   * Get a resource by its name (first match across all servers).
   */
  getResourceByName(name: string): DiscoveredMCPResource | undefined {
    for (const resource of this.resources.values()) {
      if (resource.name === name) {
        return resource;
      }
    }
    return undefined;
  }

  /**
   * Returns an array of resources registered from a specific MCP server.
   */
  getResourcesByServer(serverName: string): DiscoveredMCPResource[] {
    const serverResources: DiscoveredMCPResource[] = [];
    for (const resource of this.resources.values()) {
      if (resource.serverName === serverName) {
        serverResources.push(resource);
      }
    }
    return serverResources.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Clears all the resources from the registry.
   */
  clear(): void {
    this.resources.clear();
  }

  /**
   * Removes all resources from a specific server.
   */
  removeResourcesByServer(serverName: string): void {
    for (const [key, resource] of this.resources.entries()) {
      if (resource.serverName === serverName) {
        this.resources.delete(key);
      }
    }
  }

  /**
   * Lists all available resource URIs for @ symbol parsing.
   */
  getAllResourceKeys(): string[] {
    return Array.from(this.resources.keys());
  }

  /**
   * Finds resources matching a pattern (used for @ symbol completion).
   */
  findResourcesMatching(pattern: string): DiscoveredMCPResource[] {
    const results: DiscoveredMCPResource[] = [];
    for (const resource of this.resources.values()) {
      const resourceKey = `${resource.serverName}:${resource.uri}`;
      if (
        resourceKey.includes(pattern) ||
        resource.name.includes(pattern) ||
        resource.uri.includes(pattern)
      ) {
        results.push(resource);
      }
    }
    return results.sort((a, b) => a.name.localeCompare(b.name));
  }
}
