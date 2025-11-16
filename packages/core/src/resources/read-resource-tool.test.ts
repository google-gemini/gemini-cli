/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReadResourceTool } from './read-resource-tool.js';
import type { Config } from '../config/config.js';
import type { DiscoveredMCPResource } from './resource-registry.js';

describe('ReadResourceTool', () => {
  let mockConfig: Partial<Config>;
  let mockRegistry: {
    getAllResources: () => DiscoveredMCPResource[];
    findResourceByUri: (uri: string) => DiscoveredMCPResource | undefined;
  };
  let mockManager: { getClient: ReturnType<typeof vi.fn> };
  const textResponse = {
    contents: [{ text: 'hello world', mimeType: 'text/plain' }],
  };

  beforeEach(() => {
    mockRegistry = {
      getAllResources: () => [],
      findResourceByUri: vi.fn(),
    };
    mockManager = {
      getClient: vi.fn(),
    };
    mockConfig = {
      getResourceRegistry: () => mockRegistry,
      getMcpClientManager: () => mockManager,
    } as unknown as Partial<Config>;
  });

  const buildTool = () => new ReadResourceTool(mockConfig as Config);

  it('returns error when URI is unknown', async () => {
    const tool = buildTool();
    const invocation = tool.build({ uri: 'server://unknown' });
    const result = await invocation.execute(new AbortController().signal);
    expect(result.error?.message).toContain('Unknown resource URI');
  });

  it('returns content when resource is readable', async () => {
    const resource: DiscoveredMCPResource = {
      serverName: 'server-a',
      uri: 'server://resource/detail',
      discoveredAt: Date.now(),
      name: 'Detail',
    };
    mockRegistry.findResourceByUri = vi.fn().mockReturnValue(resource);
    mockManager.getClient = vi.fn().mockReturnValue({
      readResource: vi.fn().mockResolvedValue(textResponse),
    });

    const tool = buildTool();
    const invocation = tool.build({ uri: resource.uri! });
    const result = await invocation.execute(new AbortController().signal);
    expect(result.error).toBeUndefined();
    expect(result.llmContent).toContain('hello world');
    expect(result.returnDisplay).toBe(`Read MCP resource ${resource.uri}`);
  });

  it('summarizes binary blobs without embedding raw data', async () => {
    const resource: DiscoveredMCPResource = {
      serverName: 'server-a',
      uri: 'server://resource/detail',
      discoveredAt: Date.now(),
      name: 'Detail',
    };
    mockRegistry.findResourceByUri = vi.fn().mockReturnValue(resource);
    mockManager.getClient = vi.fn().mockReturnValue({
      readResource: vi.fn().mockResolvedValue({
        contents: [
          {
            blob: Buffer.from('abc').toString('base64'),
            mimeType: 'application/octet-stream',
          },
        ],
      }),
    });
    const tool = buildTool();
    const invocation = tool.build({ uri: resource.uri! });
    const result = await invocation.execute(new AbortController().signal);
    expect(result.llmContent).toContain('Binary content not inlined');
    expect(result.returnDisplay).toBe(`Read MCP resource ${resource.uri}`);
  });

  it('returns error when MCP client manager is missing', async () => {
    mockConfig.getMcpClientManager = () => undefined;
    const resource: DiscoveredMCPResource = {
      serverName: 'server-a',
      uri: 'server://resource/detail',
      discoveredAt: Date.now(),
      name: 'Detail',
    };
    mockRegistry.findResourceByUri = vi.fn().mockReturnValue(resource);
    const tool = buildTool();
    const invocation = tool.build({ uri: resource.uri! });
    const result = await invocation.execute(new AbortController().signal);
    expect(result.error?.message).toContain(
      'MCP client manager not initialized',
    );
  });

  it('returns error when client is unavailable', async () => {
    const resource: DiscoveredMCPResource = {
      serverName: 'server-a',
      uri: 'server://resource/detail',
      discoveredAt: Date.now(),
      name: 'Detail',
    };
    mockRegistry.findResourceByUri = vi.fn().mockReturnValue(resource);
    mockManager.getClient = vi.fn().mockReturnValue(undefined);
    const tool = buildTool();
    const invocation = tool.build({ uri: resource.uri! });
    const result = await invocation.execute(new AbortController().signal);
    expect(result.error?.message).toContain('is not connected');
  });
});
