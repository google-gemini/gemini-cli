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

  /**
   * Find a resource by its identifier.
   *
   * The identifier may be either:
   *   - a server-qualified identifier, as advertised by `list_mcp_resources`
   *     (`serverName:uri`, e.g. `myserver:file:///data.txt`), which always
   *     resolves to that specific server, or
   *   - a bare resource URI (e.g. `file:///data.txt`), which only resolves
   *     when exactly one connected server exposes it.
   *
   * If several servers expose the same bare URI the reference is ambiguous and
   * `undefined` is returned, so callers can ask for a server-qualified
   * identifier instead of silently reading from an arbitrary server. Use
   * {@link findResourcesByUri} to detect that case.
   */
  findResourceByUri(identifier: string): MCPResource | undefined {
    const qualified = this.findResourceByQualifiedId(identifier);
    if (qualified) {
      return qualified;
    }

    // Bare URI: only resolve when unambiguous (exactly one server exposes it).
    const matches = this.findResourcesByUri(identifier);
    return matches.length === 1 ? matches[0] : undefined;
  }

  /**
   * Returns every resource whose bare URI matches, across all servers. A length
   * greater than one means the URI is exposed by multiple servers and is
   * therefore ambiguous on its own.
   */
  findResourcesByUri(uri: string): MCPResource[] {
    const matches: MCPResource[] = [];
    for (const resource of this.resources.values()) {
      if (resource.uri === uri) {
        matches.push(resource);
      }
    }
    return matches;
  }

  /**
   * Resolves a server-qualified identifier (`serverName:uri`) to a resource.
   *
   * Known server names are matched explicitly as a prefix, rather than naively
   * splitting on the first colon, so a URI scheme (for example the `file` in
   * `file:///x`) is never mistaken for a server name and server names may
   * themselves contain colons or underscores.
   */
  private findResourceByQualifiedId(
    identifier: string,
  ): MCPResource | undefined {
    const serverNames = new Set<string>();
    for (const resource of this.resources.values()) {
      serverNames.add(resource.serverName);
    }
    for (const serverName of serverNames) {
      const prefix = `${serverName}:`;
      if (identifier.startsWith(prefix)) {
        const uri = identifier.slice(prefix.length);
        const hit = this.resources.get(resourceKey(serverName, uri));
        if (hit) {
          return hit;
        }
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

  /**
   * Returns an array of resources registered from a specific MCP server.
   */
  getResourcesByServer(serverName: string): MCPResource[] {
    const serverResources: MCPResource[] = [];
    for (const resource of this.resources.values()) {
      if (resource.serverName === serverName) {
        serverResources.push(resource);
      }
    }
    return serverResources.sort((a, b) => a.uri.localeCompare(b.uri));
  }
}
