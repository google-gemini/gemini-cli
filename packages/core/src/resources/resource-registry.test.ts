/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, beforeEach } from 'vitest';
import type { Resource } from '@modelcontextprotocol/sdk/types.js';
import { ResourceRegistry } from './resource-registry.js';

describe('ResourceRegistry', () => {
  let registry: ResourceRegistry;

  beforeEach(() => {
    registry = new ResourceRegistry();
  });

  const createResource = (overrides: Partial<Resource> = {}): Resource => ({
    uri: 'file:///tmp/foo.txt',
    name: 'foo',
    description: 'example resource',
    mimeType: 'text/plain',
    ...overrides,
  });

  it('stores resources per server', () => {
    registry.setResourcesForServer('a', [createResource()]);
    registry.setResourcesForServer('b', [createResource({ uri: 'foo' })]);

    expect(
      registry.getAllResources().filter((res) => res.serverName === 'a'),
    ).toHaveLength(1);
    expect(
      registry.getAllResources().filter((res) => res.serverName === 'b'),
    ).toHaveLength(1);
  });

  it('clears resources for server before adding new ones', () => {
    registry.setResourcesForServer('a', [
      createResource(),
      createResource({ uri: 'bar' }),
    ]);
    registry.setResourcesForServer('a', [createResource({ uri: 'baz' })]);

    const resources = registry
      .getAllResources()
      .filter((res) => res.serverName === 'a');
    expect(resources).toHaveLength(1);
    expect(resources[0].uri).toBe('baz');
  });

  it('finds resources by serverName:uri identifier', () => {
    registry.setResourcesForServer('a', [createResource()]);
    registry.setResourcesForServer('b', [
      createResource({ uri: 'file:///tmp/bar.txt' }),
    ]);

    expect(
      registry.findResourceByUri('b:file:///tmp/bar.txt')?.serverName,
    ).toBe('b');
    expect(
      registry.findResourceByUri('a:file:///tmp/foo.txt')?.serverName,
    ).toBe('a');
    expect(registry.findResourceByUri('a:file:///tmp/bar.txt')).toBeUndefined();
    expect(registry.findResourceByUri('nonexistent')).toBeUndefined();
  });

  it('resolves a bare URI when exactly one server exposes it', () => {
    registry.setResourcesForServer('a', [createResource()]);
    registry.setResourcesForServer('b', [
      createResource({ uri: 'file:///tmp/bar.txt' }),
    ]);

    // No server prefix, but the URI is unique across servers.
    expect(registry.findResourceByUri('file:///tmp/bar.txt')?.serverName).toBe(
      'b',
    );
    // A URI scheme is never mistaken for a server name.
    expect(registry.findResourceByUri('file:///tmp/foo.txt')?.serverName).toBe(
      'a',
    );
  });

  it('does not resolve a bare URI exposed by multiple servers', () => {
    registry.setResourcesForServer('a', [createResource()]);
    registry.setResourcesForServer('b', [createResource()]);

    // Same URI on two servers is ambiguous without a server qualifier.
    expect(registry.findResourceByUri('file:///tmp/foo.txt')).toBeUndefined();

    // ...but the server-qualified identifier still resolves deterministically.
    expect(
      registry.findResourceByUri('a:file:///tmp/foo.txt')?.serverName,
    ).toBe('a');
    expect(
      registry.findResourceByUri('b:file:///tmp/foo.txt')?.serverName,
    ).toBe('b');
  });

  it('reports all servers exposing a given URI', () => {
    registry.setResourcesForServer('a', [createResource()]);
    registry.setResourcesForServer('b', [createResource()]);
    registry.setResourcesForServer('c', [
      createResource({ uri: 'file:///tmp/other.txt' }),
    ]);

    const matches = registry.findResourcesByUri('file:///tmp/foo.txt');
    expect(matches.map((m) => m.serverName).sort()).toEqual(['a', 'b']);
    expect(registry.findResourcesByUri('file:///tmp/other.txt')).toHaveLength(
      1,
    );
    expect(registry.findResourcesByUri('file:///tmp/missing.txt')).toEqual([]);
  });

  it('resolves a server-qualified identifier when the server name has underscores', () => {
    registry.setResourcesForServer('my_server', [createResource()]);
    registry.setResourcesForServer('other', [createResource()]);

    expect(
      registry.findResourceByUri('my_server:file:///tmp/foo.txt')?.serverName,
    ).toBe('my_server');
  });

  it('clears resources for a server', () => {
    registry.setResourcesForServer('a', [createResource()]);
    registry.removeResourcesByServer('a');

    expect(
      registry.getAllResources().filter((res) => res.serverName === 'a'),
    ).toHaveLength(0);
  });
});
