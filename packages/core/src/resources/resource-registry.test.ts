/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ResourceRegistry,
  type DiscoveredMCPResource,
} from './resource-registry.js';

describe('ResourceRegistry', () => {
  let registry: ResourceRegistry;
  let mockResource: DiscoveredMCPResource;

  beforeEach(() => {
    registry = new ResourceRegistry();
    mockResource = {
      uri: 'file:///test/file.md',
      name: 'test-resource',
      description: 'A test resource',
      mimeType: 'text/markdown',
      serverName: 'test-server',
      read: async () => ({
        uri: 'file:///test/file.md',
        text: 'Test content',
      }),
    };
  });

  it('should register and retrieve resources', () => {
    registry.registerResource(mockResource);

    const retrieved = registry.getResource(
      'test-server',
      'file:///test/file.md',
    );
    expect(retrieved).toBe(mockResource);
  });

  it('should get resource by name', () => {
    registry.registerResource(mockResource);

    const retrieved = registry.getResourceByName('test-resource');
    expect(retrieved).toBe(mockResource);
  });

  it('should list resources by server', () => {
    const resource2 = {
      ...mockResource,
      name: 'resource2',
      uri: 'file:///test/file2.md',
    };
    registry.registerResource(mockResource);
    registry.registerResource(resource2);

    const serverResources = registry.getResourcesByServer('test-server');
    expect(serverResources).toHaveLength(2);
    expect(serverResources[0].name).toBe('resource2'); // sorted alphabetically
    expect(serverResources[1].name).toBe('test-resource');
  });

  it('should find matching resources', () => {
    registry.registerResource(mockResource);

    const matches = registry.findResourcesMatching('test');
    expect(matches).toHaveLength(1);
    expect(matches[0]).toBe(mockResource);
  });

  it('should clear all resources', () => {
    registry.registerResource(mockResource);
    registry.clear();

    expect(registry.getAllResources()).toHaveLength(0);
  });

  it('should remove resources by server', () => {
    const otherResource = { ...mockResource, serverName: 'other-server' };
    registry.registerResource(mockResource);
    registry.registerResource(otherResource);

    registry.removeResourcesByServer('test-server');

    const remaining = registry.getAllResources();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].serverName).toBe('other-server');
  });

  it('should handle duplicate registrations', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    registry.registerResource(mockResource);
    registry.registerResource(mockResource);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('already registered'),
    );

    consoleSpy.mockRestore();
  });
});
