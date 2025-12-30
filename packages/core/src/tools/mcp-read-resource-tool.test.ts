/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ReadResourceTool } from './mcp-read-resource-tool.js';
import type { Config } from '../config/config.js';
import type { DiscoveredMCPResource } from '../resources/resource-registry.js';

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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const buildTool = () => new ReadResourceTool(mockConfig as Config);

  it('returns error when URI is unknown', async () => {
    const tool = buildTool();
    const invocation = tool.build({ uri: 'server-a:server://unknown' });
    const result = await invocation.execute(new AbortController().signal);
    expect(result.error?.message).toContain('Unknown resource URI');
  });

  it('returns content when resource is readable', async () => {
    const resource: DiscoveredMCPResource = {
      serverName: 'server-a',
      uri: 'file:///project/src/main.rs',
      discoveredAt: Date.now(),
      name: 'Detail',
    };
    mockRegistry.findResourceByUri = vi.fn().mockReturnValue(resource);
    mockManager.getClient = vi.fn().mockReturnValue({
      readResource: vi.fn().mockResolvedValue(textResponse),
    });

    const tool = buildTool();
    const prefixedUri = `${resource.serverName}:${resource.uri}`;
    const invocation = tool.build({ uri: prefixedUri });
    const result = await invocation.execute(new AbortController().signal);
    expect(result.error).toBeUndefined();
    expect(result.llmContent).toContain('hello world');
    expect(result.returnDisplay).toBe(
      `Read MCP resource ${resource.serverName}:${resource.uri}`,
    );
    expect(mockRegistry.findResourceByUri).toHaveBeenCalledWith(prefixedUri);
  });

  it('summarizes binary blobs without embedding raw data', async () => {
    const resource: DiscoveredMCPResource = {
      serverName: 'server-a',
      uri: 'file:///project/src/main.rs',
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
    const prefixedUri = `${resource.serverName}:${resource.uri}`;
    const invocation = tool.build({ uri: prefixedUri });
    const result = await invocation.execute(new AbortController().signal);
    expect(result.llmContent).toContain('Binary content not inlined');
    expect(result.returnDisplay).toBe(
      `Read MCP resource ${resource.serverName}:${resource.uri}`,
    );
    expect(mockRegistry.findResourceByUri).toHaveBeenCalledWith(prefixedUri);
  });

  it('returns error when MCP client manager is missing', async () => {
    mockConfig.getMcpClientManager = () => undefined;
    const resource: DiscoveredMCPResource = {
      serverName: 'server-a',
      uri: 'file:///project/src/main.rs',
      discoveredAt: Date.now(),
      name: 'Detail',
    };
    mockRegistry.findResourceByUri = vi.fn().mockReturnValue(resource);
    const tool = buildTool();
    const prefixedUri = `${resource.serverName}:${resource.uri}`;
    const invocation = tool.build({ uri: prefixedUri });
    const result = await invocation.execute(new AbortController().signal);
    expect(result.error?.message).toContain(
      'MCP client manager not initialized',
    );
  });

  it('returns error when client is unavailable', async () => {
    const resource: DiscoveredMCPResource = {
      serverName: 'server-a',
      uri: 'file:///project/src/main.rs',
      discoveredAt: Date.now(),
      name: 'Detail',
    };
    mockRegistry.findResourceByUri = vi.fn().mockReturnValue(resource);
    mockManager.getClient = vi.fn().mockReturnValue(undefined);
    const tool = buildTool();
    const prefixedUri = `${resource.serverName}:${resource.uri}`;
    const invocation = tool.build({ uri: prefixedUri });
    const result = await invocation.execute(new AbortController().signal);
    expect(result.error?.message).toContain('is not connected');
  });

  describe('AbortSignal support', () => {
    const MOCK_READ_DELAY = 1000;
    const ABORT_DELAY = 50;

    it('should abort immediately if signal is already aborted', async () => {
      const resource: DiscoveredMCPResource = {
        serverName: 'server-a',
        uri: 'file:///project/src/main.rs',
        discoveredAt: Date.now(),
        name: 'Detail',
      };
      mockRegistry.findResourceByUri = vi.fn().mockReturnValue(resource);
      const mockReadResource = vi.fn();
      mockManager.getClient = vi.fn().mockReturnValue({
        readResource: mockReadResource,
      });

      const controller = new AbortController();
      controller.abort();

      const tool = buildTool();
      const prefixedUri = `${resource.serverName}:${resource.uri}`;
      const invocation = tool.build({ uri: prefixedUri });
      const result = await invocation.execute(controller.signal);

      expect(result.error?.message).toContain('Resource read aborted');
      expect(mockReadResource).not.toHaveBeenCalled();
    });

    it('should abort during resource read', async () => {
      const resource: DiscoveredMCPResource = {
        serverName: 'server-a',
        uri: 'file:///project/src/main.rs',
        discoveredAt: Date.now(),
        name: 'Detail',
      };
      mockRegistry.findResourceByUri = vi.fn().mockReturnValue(resource);
      mockManager.getClient = vi.fn().mockReturnValue({
        readResource: vi.fn().mockImplementation(
          () =>
            new Promise((resolve) => {
              setTimeout(() => {
                resolve(textResponse);
              }, MOCK_READ_DELAY);
            }),
        ),
      });

      const controller = new AbortController();
      const tool = buildTool();
      const prefixedUri = `${resource.serverName}:${resource.uri}`;
      const invocation = tool.build({ uri: prefixedUri });
      const promise = invocation.execute(controller.signal);

      // Abort after a short delay to simulate cancellation during read
      setTimeout(() => controller.abort(), ABORT_DELAY);

      const result = await promise;
      expect(result.error?.message).toContain('Resource read aborted');
    });

    it('should complete successfully if not aborted', async () => {
      const resource: DiscoveredMCPResource = {
        serverName: 'server-a',
        uri: 'file:///project/src/main.rs',
        discoveredAt: Date.now(),
        name: 'Detail',
      };
      mockRegistry.findResourceByUri = vi.fn().mockReturnValue(resource);
      mockManager.getClient = vi.fn().mockReturnValue({
        readResource: vi.fn().mockResolvedValue(textResponse),
      });

      const controller = new AbortController();
      const tool = buildTool();
      const prefixedUri = `${resource.serverName}:${resource.uri}`;
      const invocation = tool.build({ uri: prefixedUri });
      const result = await invocation.execute(controller.signal);

      expect(result.error).toBeUndefined();
      expect(result.llmContent).toContain('hello world');
    });

    it('should handle readResource rejection with abort signal', async () => {
      const resource: DiscoveredMCPResource = {
        serverName: 'server-a',
        uri: 'file:///project/src/main.rs',
        discoveredAt: Date.now(),
        name: 'Detail',
      };
      mockRegistry.findResourceByUri = vi.fn().mockReturnValue(resource);
      const expectedError = new Error('Network error');
      mockManager.getClient = vi.fn().mockReturnValue({
        readResource: vi.fn().mockRejectedValue(expectedError),
      });

      const controller = new AbortController();
      const tool = buildTool();
      const prefixedUri = `${resource.serverName}:${resource.uri}`;
      const invocation = tool.build({ uri: prefixedUri });
      const result = await invocation.execute(controller.signal);

      expect(result.error?.message).toContain('Network error');
    });
  });
});
